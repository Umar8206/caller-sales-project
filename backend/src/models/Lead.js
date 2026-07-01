const mongoose = require('mongoose');

const CallAttemptSchema = new mongoose.Schema({
  callSid:         { type: String },
  startedAt:       { type: Date },
  endedAt:         { type: Date },
  durationSeconds: { type: Number },
  outcome:         { type: String },   // answered | no_answer | busy | failed
  transcript:      { type: String },
  audioUrl:        { type: String },
}, { _id: false });

const LeadSchema = new mongoose.Schema({
  firstName: { type: String, trim: true, default: '' },
  lastName:  { type: String, trim: true, default: '' },
  phone:     { type: String, required: true, trim: true, unique: true },
  email:     { type: String, trim: true, lowercase: true, default: '' },
  company:   { type: String, trim: true, default: '' },

  status: {
    type: String,
    enum: [
      'pending',          // ready to call
      'calling',          // actively being called right now
      'appointment_set',   // lead agreed to a meeting with the sales agent
      'intake_completed',  // lead completed the intake questionnaire
      'declined',          // lead said no
      'no_answer',        // no pick-up — will retry
      'busy',             // line busy — will retry
      'failed',           // API/technical error — will retry
      'max_retries',      // exhausted all retries
      'dnc',              // do not call (manual override)
    ],
    default: 'pending',
  },

  retryCount:   { type: Number, default: 0 },
  maxRetries:   { type: Number, default: 3 },
  nextRetryAt:  { type: Date, default: null },
  lastCalledAt: { type: Date, default: null },

  // Appointment details extracted from the call
  appointmentNotes: { type: String, default: '' },  // e.g. "Tuesday 3pm" or "call me back tomorrow"
  intakeFormId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeForm', default: null },

  callAttempts: [CallAttemptSchema],

  // Best/final data from the call that mattered
  finalTranscript: { type: String, default: '' },
  finalAudioUrl:   { type: String, default: '' },
  finalCallSid:    { type: String, default: '' },

  source:        { type: String, enum: ['manual', 'excel', 'word', 'api'], default: 'manual' },
  uploadBatchId: { type: String, default: '' },

  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Indexes
LeadSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });
LeadSchema.index({ uploadBatchId: 1 });
LeadSchema.index({ createdAt: -1 });

// Virtual
LeadSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ') || 'Unknown';
});

module.exports = mongoose.model('Lead', LeadSchema);
