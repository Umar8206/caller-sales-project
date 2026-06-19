const mongoose = require('mongoose');

const CallSessionSchema = new mongoose.Schema({
  callSid:                    { type: String, required: true, unique: true },
  elevenLabsConversationId:   { type: String },
  leadId:                     { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  phone:                      { type: String },

  status: {
    type: String,
    enum: ['initiated', 'in-progress', 'completed', 'failed', 'no-answer', 'busy'],
    default: 'initiated',
  },

  initiatedAt:     { type: Date, default: Date.now },
  answeredAt:      { type: Date },
  endedAt:         { type: Date },
  durationSeconds: { type: Number },

  transcript: [{
    speaker:   { type: String, enum: ['agent', 'user'] },
    text:      { type: String },
    timestamp: { type: Date },
  }],
  fullTranscriptText: { type: String },

  detectedOutcome: {
    type: String,
    enum: ['interested', 'not_interested', 'unknown'],
    default: 'unknown',
  },
  outcomeSummary: { type: String },
  recordingUrl:   { type: String },
  errorMessage:   { type: String },
}, { timestamps: true });

CallSessionSchema.index({ leadId: 1 });
CallSessionSchema.index({ initiatedAt: -1 });

module.exports = mongoose.model('CallSession', CallSessionSchema);
