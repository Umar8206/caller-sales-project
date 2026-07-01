const axios = require('axios');

const EL_BASE = 'https://api.elevenlabs.io/v1';

function headers() {
  return {
    'xi-api-key': process.env.ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
  };
}

/**
 * Initiate an outbound call via ElevenLabs.
 * ElevenLabs uses your linked Twilio number to place the call.
 * Returns the conversation_id string.
 *
 * Before this works you must:
 *  1. Create an Agent in ElevenLabs with your sales script
 *  2. Agent → Phone Numbers → link your Twilio number
 *  3. Copy ELEVENLABS_PHONE_NUMBER_ID from the dashboard into .env
 */
async function initiateCall(toNumber, meta = {}) {
  const res = await axios.post(
    `${EL_BASE}/convai/twilio/outbound-call`,
    {
      agent_id:               process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id:  process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number:              toNumber,
      // Dynamic variables are injected into your agent prompt as {{first_name}} etc.
      conversation_initiation_client_data: {
        dynamic_variables: {
          first_name: meta.firstName || '',
          last_name:  meta.lastName  || '',
          company:    meta.company   || '',
          lead_id:    meta.leadId    || '',
        },
      },
    },
    { headers: headers() }
  );

  console.log('[ElevenLabs] Raw response:', JSON.stringify(res.data, null, 2));
  const conversationId = res.data?.conversation_id;
  if (!conversationId) throw new Error('ElevenLabs did not return conversation_id');
  return conversationId;
}

/**
 * Fetch a completed conversation by ID (for backfilling missed webhooks).
 */
async function getConversation(conversationId) {
  const res = await axios.get(
    `${EL_BASE}/convai/conversations/${conversationId}`,
    { headers: headers() }
  );
  return res.data;
}

/**
 * Parse the ElevenLabs webhook payload into a clean result object.
 *
 * Webhook payload shape (sent to POST /webhooks/elevenlabs):
 * {
 *   type: "conversation_completed",
 *   data: {
 *     conversation_id, agent_id, status,
 *     termination_reason: "agent_ended" | "user_ended" | "no_answer" | "busy" | "failed",
 *     call_duration_secs,
 *     transcript: [{ role: "agent"|"user", message: "..." }],
 *     analysis: {
 *       call_successful: "success" | "failure" | "unknown",
 *       transcript_summary: "...",
 *     },
 *     recording_url,
 *     metadata: { lead_id: "..." }
 *   }
 * }
 */
function parseWebhookPayload(data) {
  const analysis = data.analysis || {};
  const transcript = data.transcript || [];

  // Build flat text for display / fallback detection
  const transcriptText = transcript
    .map(t => `[${(t.role || 'unknown').toUpperCase()}] ${t.message || t.text || ''}`)
    .join('\n');

  // ElevenLabs tells us directly if the call matched your success criteria
  // Set your ElevenLabs analysis criterion name to "appointment_set"
  let detectedOutcome = 'unknown';
  if (analysis.call_successful === 'success')  detectedOutcome = 'appointment_set';
  if (analysis.call_successful === 'failure')  detectedOutcome = 'declined';

  // Fallback keyword scan if ElevenLabs couldn't determine the outcome
  if (detectedOutcome === 'unknown') {
    const text = transcriptText.toLowerCase();

    const appointmentPhrases = [
      'schedule', 'book a call', 'set up a meeting', 'set up a call',
      'let\'s meet', 'i\'ll be available', 'works for me', 'sounds good',
      'yes please', 'i\'m interested', 'tell me more', 'call me back',
      'tuesday', 'wednesday', 'thursday', 'friday', 'monday',
      'tomorrow', 'next week', 'morning', 'afternoon', 'o\'clock',
    ];
    const declinePhrases = [
      'not interested', 'no thank', 'no thanks', "don't call",
      'remove me', 'do not call', 'stop calling', 'not right now',
      'maybe later', 'not a good time',
    ];

    if (declinePhrases.some(s => text.includes(s)))
      detectedOutcome = 'declined';
    else if (appointmentPhrases.filter(s => text.includes(s)).length >= 2)
      detectedOutcome = 'appointment_set';
  }

  // Pull structured fields ElevenLabs data collection captured
  const collected    = data.data_collection || {};
  const smokerStatus = collected.smoker_status?.value || '';
  const leadState    = collected.lead_state?.value    || '';
  const leadAge      = collected.lead_age?.value      || null;
  const apptDateTime = collected.appointment_date_time?.value || '';

  // Also use appointment_scheduled boolean as a stronger signal
  if (collected.appointment_scheduled?.value === true)  detectedOutcome = 'appointment_set';
  if (collected.appointment_scheduled?.value === false && detectedOutcome === 'unknown')
    detectedOutcome = 'declined';

  // Build appointment notes from structured data + time hints in transcript
  const timeHints = [
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(tomorrow|next week|this week)\b/i,
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\b(morning|afternoon|evening)\b/i,
  ];
  const timeFromTranscript = timeHints
    .map(re => { const m = transcriptText.match(re); return m ? m[0] : null; })
    .filter(Boolean)
    .join(', ');

  const appointmentNotes = [
    apptDateTime || timeFromTranscript,
    smokerStatus  ? `smoker: ${smokerStatus}` : '',
    leadState     ? `state: ${leadState}`     : '',
    leadAge       ? `age: ${leadAge}`         : '',
  ].filter(Boolean).join(' | ');

  const intakeCompleted = collected.intake_completed?.value === true;

  return {
    conversationId:    data.conversation_id,
    status:            data.status,
    terminationReason: data.termination_reason,
    durationSeconds:   data.call_duration_secs || 0,
    transcript,
    transcriptText,
    detectedOutcome,
    appointmentNotes,
    smokerStatus,
    leadState,
    leadAge,
    summary:           analysis.transcript_summary || '',
    recordingUrl:      data.recording_url || '',
    leadId:            data.metadata?.lead_id || data.dynamic_variables?.lead_id || '',
    rawDataCollection: collected,
    intakeCompleted,
  };
}

/**
 * Extract intake form fields from the ElevenLabs data_collection object.
 * ElevenLabs wraps each collected field as { value: <actual>, ... }.
 * Flat medication_N and referral_N fields are reassembled into arrays.
 */
function extractIntakeFormData(collected) {
  const val = (key) => {
    const entry = collected[key];
    if (!entry) return undefined;
    return entry.value ?? undefined;
  };

  const medications = [];
  for (let i = 1; i <= 3; i++) {
    const name   = val(`medication_${i}_name`);
    const reason = val(`medication_${i}_reason`);
    if (name || reason) medications.push({ name: name || '', reason: reason || '' });
  }

  const referrals = [];
  for (let i = 1; i <= 10; i++) {
    const name = val(`referral_${i}`);
    if (name) referrals.push({ name });
  }

  return {
    areaOfInterest:             val('area_of_interest')             ?? null,
    incomeProtectionPreference: val('income_protection_preference') ?? null,
    medications,
    hasMajorHealthEvent:        val('has_major_health_event')       ?? null,
    healthEventDetails:         val('health_event_details')         || '',
    usesTobacco:                val('uses_tobacco')                 ?? null,
    financialBurdenPreference:  val('financial_burden_preference')  ?? null,
    burialPreference:           val('burial_preference')            ?? null,
    funeralHome:                val('funeral_home')                 || '',
    referrals,
    intakeCompleted:            val('intake_completed')             === true,
  };
}

module.exports = { initiateCall, getConversation, parseWebhookPayload, extractIntakeFormData };
