require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const leadRoutes    = require('./routes/leads');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/leads',    leadRoutes);
app.use('/api/webhooks', webhookRoutes);
// keep old /webhooks path working too (for ElevenLabs config)
app.use('/webhooks', webhookRoutes);

app.get('/api/health', (_, res) =>
  res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() })
);

// Worker stats — read from MongoDB (no Redis needed)
app.get('/api/queue/stats', async (_, res) => {
  try {
    const Lead        = require('./models/Lead');
    const CallSession = require('./models/CallSession');
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [byStatusArr, todayCalls, activeCalls] = await Promise.all([
      Lead.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      CallSession.countDocuments({ initiatedAt: { $gte: todayStart } }),
      Lead.countDocuments({ status: 'calling' }),
    ]);
    const byStatus = {};
    byStatusArr.forEach(s => { byStatus[s._id] = s.count; });
    const waiting = ['pending','no_answer','busy','failed'].reduce((a, k) => a + (byStatus[k] || 0), 0);

    res.json({ activeCalls, waiting, todayCalls, byStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pause/resume worker via DB flag
app.post('/api/queue/pause', async (_, res) => {
  await mongoose.connection.db.collection('settings')
    .updateOne({ key: 'worker_paused' }, { $set: { value: true } }, { upsert: true });
  res.json({ paused: true });
});
app.post('/api/queue/resume', async (_, res) => {
  await mongoose.connection.db.collection('settings')
    .updateOne({ key: 'worker_paused' }, { $set: { value: false } }, { upsert: true });
  res.json({ paused: false });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/outbound-caller';
  await mongoose.connect(uri);
  console.log('[API] MongoDB connected');

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀  API server running on http://localhost:${PORT}`);
    console.log(`    Leads:   http://localhost:${PORT}/api/leads`);
    console.log(`    Webhook: POST ${process.env.BASE_URL || 'http://localhost:' + PORT}/webhooks/elevenlabs`);
    console.log(`\n    Set the webhook URL above in ElevenLabs → Agent → Webhooks\n`);
  });
}

process.on('SIGTERM', async () => { await mongoose.disconnect(); process.exit(0); });
start().catch(err => { console.error('[API] Startup failed:', err.message); process.exit(1); });
