/**
 * CALL WORKER
 * -----------
 * Polls MongoDB every POLL_INTERVAL_MS for leads ready to be called.
 * Uses findOneAndUpdate to atomically "claim" each lead — safe to run
 * multiple instances without double-calling anyone.
 *
 * Start alongside the API server:
 *   npm run worker          (production)
 *   npm run worker:dev      (development with auto-restart)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { initiateCall } = require('../services/elevenLabsService');
const Lead        = require('../models/Lead');
const CallSession = require('../models/CallSession');

const CONCURRENCY    = parseInt(process.env.WORKER_CONCURRENCY  || '10');
const POLL_INTERVAL  = parseInt(process.env.POLL_INTERVAL_MS    || '5000');
const CALLS_PER_HOUR = parseInt(process.env.CALLS_PER_HOUR      || '50');
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MINUTES || '30') * 60_000;

// Minimum gap between starting calls to honour CALLS_PER_HOUR
const MIN_GAP_MS = Math.floor(3_600_000 / CALLS_PER_HOUR);

let activeCalls     = 0;
let lastCallAt      = 0;
let isShuttingDown  = false;

// ── Core: atomically claim one lead ─────────────────────────────────────────
async function claimNextLead() {
  return Lead.findOneAndUpdate(
    {
      isDeleted: { $ne: true },
      status: { $in: ['pending', 'no_answer', 'busy', 'failed'] },
      $or: [
        { nextRetryAt: null },
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: { $lte: new Date() } },
      ],
    },
    { $set: { status: 'calling', lastCalledAt: new Date() } },
    { sort: { nextRetryAt: 1, createdAt: 1 }, new: true }
  );
}

// ── Process one lead ─────────────────────────────────────────────────────────
async function processLead(lead) {
  activeCalls++;
  lastCallAt = Date.now();

  console.log(`[Worker] → Calling ${lead.phone}  attempt ${lead.retryCount + 1}/${lead.maxRetries}`);

  try {
    const conversationId = await initiateCall(lead.phone, {
      firstName: lead.firstName,
      lastName:  lead.lastName,
      company:   lead.company,
      leadId:    lead._id.toString(),
    });

    // Record the session
    await CallSession.create({
      callSid:                  conversationId,
      elevenLabsConversationId: conversationId,
      leadId:                   lead._id,
      phone:                    lead.phone,
      status:                   'initiated',
      initiatedAt:              new Date(),
    });

    // Append to lead's call history
    await Lead.updateOne(
      { _id: lead._id },
      { $push: { callAttempts: { callSid: conversationId, startedAt: new Date() } } }
    );

    console.log(`[Worker] ✓ ${lead.phone}  conv: ${conversationId}`);

  } catch (err) {
    console.error(`[Worker] ✗ ${lead.phone}  error: ${err.message}`);

    const newCount = lead.retryCount + 1;
    if (newCount >= lead.maxRetries) {
      await Lead.updateOne({ _id: lead._id },
        { $set: { status: 'max_retries', retryCount: newCount } });
      console.log(`[Worker]   Lead ${lead._id} hit max retries`);
    } else {
      await Lead.updateOne({ _id: lead._id }, {
        $set: {
          status:      'failed',
          retryCount:  newCount,
          nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS),
        },
      });
    }
  } finally {
    activeCalls--;
  }
}

// ── One tick of the poll loop ────────────────────────────────────────────────
async function tick() {
  if (isShuttingDown) return;

  // Check pause flag (set via API POST /queue/pause)
  const flag = await mongoose.connection.db
    .collection('settings')
    .findOne({ key: 'worker_paused' });
  if (flag?.value === true) return;

  // Concurrency gate
  if (activeCalls >= CONCURRENCY) return;

  // Rate gate
  if (lastCallAt > 0 && (Date.now() - lastCallAt) < MIN_GAP_MS) return;

  const lead = await claimNextLead();
  if (!lead) return;

  processLead(lead); // intentionally not awaited — keep polling
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/outbound-caller');
  console.log('[Worker] MongoDB connected');
  console.log(`[Worker] concurrency=${CONCURRENCY}  rate=${CALLS_PER_HOUR}/hr  poll=${POLL_INTERVAL}ms`);

  // Reset any leads stuck in 'calling' from a previous crash
  const { modifiedCount } = await Lead.updateMany(
    { status: 'calling' },
    { $set: { status: 'pending', nextRetryAt: null } }
  );
  if (modifiedCount) console.log(`[Worker] Reset ${modifiedCount} stuck leads → pending`);

  const interval = setInterval(async () => {
    try { await tick(); } catch (e) { console.error('[Worker] tick error:', e.message); }
  }, POLL_INTERVAL);

  const shutdown = async () => {
    console.log('\n[Worker] Shutting down gracefully…');
    isShuttingDown = true;
    clearInterval(interval);
    // wait up to 10 s for in-flight initiations
    for (let i = 0; i < 20 && activeCalls > 0; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);

  console.log('[Worker] Polling…\n');
}

start().catch(err => { console.error('[Worker] Fatal:', err.message); process.exit(1); });
