const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { parseWebhookPayload, extractIntakeFormData } = require('../services/elevenLabsService');
const Lead        = require('../models/Lead');
const CallSession = require('../models/CallSession');
const IntakeForm  = require('../models/IntakeForm');

// ── POST /webhooks/elevenlabs ─────────────────────────────────────────────────
// Configure this URL in ElevenLabs: Agent → Webhooks → Add endpoint
// Events to subscribe: conversation_completed, conversation_failed
router.post('/elevenlabs', async (req, res) => {

  // Verify signature — required in production
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (secret) {
    const sig      = req.headers['x-elevenlabs-signature'];
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body)).digest('hex');
    if (sig !== expected) {
      console.warn('[Webhook] Bad signature — set ELEVENLABS_WEBHOOK_SECRET correctly');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[Webhook] ELEVENLABS_WEBHOOK_SECRET is not set — rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Respond immediately — ElevenLabs times out if we take too long
  res.sendStatus(200);

  const { type, data } = req.body;
  if (!data) return;

  const parsed = parseWebhookPayload(data);
  const { conversationId, terminationReason, durationSeconds,
          transcript, transcriptText, detectedOutcome, appointmentNotes,
          summary, recordingUrl, leadId,
          rawDataCollection, intakeCompleted } = parsed;

  console.log(`[Webhook] ${type}  conv=${conversationId}  reason=${terminationReason}  outcome=${detectedOutcome}`);

  try {
    // Find the CallSession
    const session = await CallSession.findOne({ elevenLabsConversationId: conversationId });
    const resolvedLeadId = leadId || session?.leadId;
    if (!resolvedLeadId) {
      console.warn(`[Webhook] No lead found for conversation ${conversationId}`);
      return;
    }

    const lead = await Lead.findById(resolvedLeadId);
    if (!lead) return;

    // ── Non-answer: no_answer / busy / failed ─────────────────────────────
    const nonAnswer = ['no_answer', 'busy', 'failed', 'timeout'];
    if (nonAnswer.includes(terminationReason) || type === 'conversation_failed') {
      const newCount = lead.retryCount + 1;
      const retryDelayMs = parseInt(process.env.RETRY_DELAY_MINUTES || '30') * 60_000;

      if (newCount >= lead.maxRetries) {
        const r = await Lead.updateOne({ _id: resolvedLeadId },
          { $set: { status: 'max_retries', retryCount: newCount } });
        if (r.modifiedCount === 0) console.warn('[Webhook] max_retries update matched no lead:', resolvedLeadId);
      } else {
        const r = await Lead.updateOne({ _id: resolvedLeadId }, {
          $set: {
            status:      terminationReason === 'no_answer' ? 'no_answer' : 'failed',
            retryCount:  newCount,
            nextRetryAt: new Date(Date.now() + retryDelayMs),
          },
        });
        if (r.modifiedCount === 0) console.warn('[Webhook] retry update matched no lead:', resolvedLeadId);
      }
      await CallSession.updateOne({ elevenLabsConversationId: conversationId },
        { $set: { status: terminationReason, endedAt: new Date() } });
      return;
    }

    // ── Completed conversation ─────────────────────────────────────────────
    await CallSession.updateOne(
      { elevenLabsConversationId: conversationId },
      {
        $set: {
          status:  'completed',
          endedAt: new Date(),
          durationSeconds,
          transcript: transcript.map(t => ({
            speaker: t.role === 'agent' ? 'agent' : 'user',
            text:    t.message || t.text || '',
            timestamp: new Date(),
          })),
          fullTranscriptText: transcriptText,
          detectedOutcome,
          outcomeSummary: summary,
          recordingUrl,
        },
      }
    );

    // ── Save intake form data ─────────────────────────────────────────────────
    const intakeData = extractIntakeFormData(rawDataCollection || {});
    const hasIntakeData = intakeData.areaOfInterest
      || intakeData.medications.length > 0
      || intakeData.hasMajorHealthEvent !== null
      || intakeData.usesTobacco !== null
      || intakeData.burialPreference
      || intakeData.referrals.length > 0;

    let intakeFormId = null;
    if (hasIntakeData) {
      try {
        const form = await IntakeForm.findOneAndUpdate(
          { leadId: resolvedLeadId },
          {
            $set: {
              conversationId,
              areaOfInterest:             intakeData.areaOfInterest,
              incomeProtectionPreference: intakeData.incomeProtectionPreference,
              medications:                intakeData.medications,
              hasMajorHealthEvent:        intakeData.hasMajorHealthEvent,
              healthEventDetails:         intakeData.healthEventDetails,
              usesTobacco:                intakeData.usesTobacco,
              financialBurdenPreference:  intakeData.financialBurdenPreference,
              burialPreference:           intakeData.burialPreference,
              funeralHome:                intakeData.funeralHome,
              referrals:                  intakeData.referrals,
              isPartial:                  !intakeData.intakeCompleted,
              ...(intakeData.intakeCompleted && { completedAt: new Date() }),
            },
          },
          { upsert: true, new: true }
        );
        intakeFormId = form._id;
        console.log(`[Webhook] IntakeForm saved for lead ${resolvedLeadId} (partial: ${form.isPartial})`);
      } catch (intakeErr) {
        console.error('[Webhook] Failed to save intake form:', intakeErr.message);
      }
    }

    // Determine final lead status
    let newStatus = lead.status;
    if (detectedOutcome === 'appointment_set') {
      newStatus = 'appointment_set';
    } else if (intakeCompleted) {
      newStatus = 'intake_completed';
    } else if (detectedOutcome === 'declined') {
      newStatus = 'declined';
    } else if (durationSeconds < 15) {
      // Hung up almost immediately — treat as no answer, retry
      const newCount = lead.retryCount + 1;
      newStatus = newCount >= lead.maxRetries ? 'max_retries' : 'no_answer';
      if (newStatus === 'no_answer') {
        const retryDelayMs = parseInt(process.env.RETRY_DELAY_MINUTES || '30') * 60_000;
        await Lead.updateOne({ _id: resolvedLeadId }, {
          $set: { retryCount: newCount, nextRetryAt: new Date(Date.now() + retryDelayMs) },
        });
      }
    } else {
      // Had a conversation but outcome was unclear — retry rather than give up
      const newCount = lead.retryCount + 1;
      newStatus = newCount >= lead.maxRetries ? 'max_retries' : 'no_answer';
      if (newStatus === 'no_answer') {
        const retryDelayMs = parseInt(process.env.RETRY_DELAY_MINUTES || '30') * 60_000;
        await Lead.updateOne({ _id: resolvedLeadId }, {
          $set: { retryCount: newCount, nextRetryAt: new Date(Date.now() + retryDelayMs) },
        });
      }
    }

    const leadUpdate = {
      status:          newStatus,
      lastCalledAt:    new Date(),
      finalTranscript: transcriptText,
      finalAudioUrl:   recordingUrl,
      finalCallSid:    conversationId,
      ...(intakeFormId && { intakeFormId }),
    };
    if (newStatus === 'appointment_set' && appointmentNotes) {
      leadUpdate.appointmentNotes = appointmentNotes;
    }

    const updateResult = await Lead.updateOne({ _id: resolvedLeadId }, {
      $set: {
        ...leadUpdate,
        'callAttempts.$[el].endedAt':         new Date(),
        'callAttempts.$[el].durationSeconds': durationSeconds,
        'callAttempts.$[el].outcome':         terminationReason || 'answered',
        'callAttempts.$[el].transcript':      transcriptText,
        'callAttempts.$[el].audioUrl':        recordingUrl,
      },
    }, { arrayFilters: [{ 'el.callSid': conversationId }] });
    if (updateResult.modifiedCount === 0)
      console.warn('[Webhook] Lead update matched nothing — callSid may not be tracked:', conversationId);

    console.log(`[Webhook] Lead ${resolvedLeadId} → ${newStatus}  (${durationSeconds}s)`);

  } catch (e) {
    console.error('[Webhook] Error processing payload:', e.message);
  }
});

// Quick health check — hit this in browser to confirm webhook URL is reachable
router.get('/elevenlabs/health', (_, res) => res.json({ ok: true }));

module.exports = router;
