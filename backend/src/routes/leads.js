const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');
const Lead        = require('../models/Lead');
const CallSession = require('../models/CallSession');
const { parseExcel, parseWord, validateLead } = require('../services/leadParser');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /\.(xlsx|xls|docx|doc)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only Excel or Word files are allowed'), ok);
  },
});

// ── GET /leads ───────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25, sortBy = 'createdAt', sortDir = 'desc' } = req.query;
    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') }, { lastName:  new RegExp(search, 'i') },
        { phone:     new RegExp(search, 'i') }, { email:     new RegExp(search, 'i') },
        { company:   new RegExp(search, 'i') },
      ];
    }
    const [data, total] = await Promise.all([
      Lead.find(filter)
        .select('-callAttempts')
        .sort({ [sortBy]: sortDir === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit).limit(+limit).lean(),
      Lead.countDocuments(filter),
    ]);
    res.json({ data, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / limit) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /leads/stats ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [byStatusArr, todayCalls] = await Promise.all([
      Lead.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      CallSession.countDocuments({ initiatedAt: { $gte: todayStart } }),
    ]);
    const byStatus = {};
    byStatusArr.forEach(s => { byStatus[s._id] = s.count; });
    const total    = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const called   = (byStatus.appointment_set || 0) + (byStatus.declined || 0);
    const rate     = called > 0 ? +((byStatus.appointment_set || 0) / called * 100).toFixed(1) : 0;
    res.json({ byStatus, total, todayCalls, acceptanceRate: rate });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /leads/:id ───────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead || lead.isDeleted) return res.status(404).json({ error: 'Not found' });
    const sessions = await CallSession.find({ leadId: lead._id }).sort({ initiatedAt: -1 }).lean();
    res.json({ ...lead.toObject(), callSessions: sessions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /leads  (single manual lead) ────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { phone, firstName, lastName, email, company } = req.body;
    const { valid, errors } = validateLead({ phone });
    if (!valid) return res.status(400).json({ error: errors.join(', ') });
    const lead = await Lead.create({ phone, firstName, lastName, email, company, source: 'manual' });
    res.status(201).json(lead);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Phone number already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /leads/bulk-upload ───────────────────────────────────────────────────
router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const batchId  = uuidv4();
  const isExcel  = /\.(xlsx|xls)$/i.test(req.file.originalname);
  const isWord   = /\.(docx|doc)$/i.test(req.file.originalname);
  const source   = isExcel ? 'excel' : 'word';

  let rows = [];
  try {
    rows = isExcel ? parseExcel(req.file.buffer) : await parseWord(req.file.buffer);
  } catch (e) {
    return res.status(422).json({ error: `Could not parse file: ${e.message}` });
  }

  if (!rows.length) return res.status(422).json({ error: 'No leads found in file' });

  let created = 0, skipped = 0, invalid = 0;
  const errors = [];

  for (const row of rows) {
    const { valid, errors: errs } = validateLead(row);
    if (!valid) { invalid++; errors.push({ phone: row.phone, errors: errs }); continue; }
    try {
      await Lead.create({ ...row, source, uploadBatchId: batchId });
      created++;
    } catch (e) {
      if (e.code === 11000) skipped++;
      else { invalid++; errors.push({ phone: row.phone, errors: [e.message] }); }
    }
  }

  res.status(201).json({ batchId, total: rows.length, created, skipped, invalid, errors });
});

// ── POST /leads/start-calling ─────────────────────────────────────────────────
// Just resets nextRetryAt so the worker picks leads up immediately.
// The worker is always running — no "queue" to push into.
router.post('/start-calling', async (req, res) => {
  try {
    const { batchId } = req.query;
    const filter = {
      isDeleted: false,
      status: { $in: ['pending', 'no_answer', 'busy', 'failed'] },
      ...(batchId && { uploadBatchId: batchId }),
    };
    const { modifiedCount } = await Lead.updateMany(filter, { $set: { nextRetryAt: null } });
    res.json({ message: `${modifiedCount} leads will be called on next worker poll`, count: modifiedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /leads/:id ──────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['firstName','lastName','email','company','status','maxRetries'];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!lead) return res.status(404).json({ error: 'Not found' });
    res.json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /leads/:id ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await Lead.updateOne({ _id: req.params.id }, { isDeleted: true });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /leads/:id/retry ─────────────────────────────────────────────────────
router.post('/:id/retry', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (['appointment_set','declined','dnc'].includes(lead.status))
      return res.status(400).json({ error: `Cannot retry a lead with status: ${lead.status}` });
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'pending', nextRetryAt: null } });
    res.json({ message: 'Lead reset to pending — worker will call on next poll' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
