const mongoose = require('mongoose');

const MedicationSchema = new mongoose.Schema(
  {
    name:   { type: String, trim: true },
    reason: { type: String, trim: true },
  },
  { _id: false }
);

const ReferralSchema = new mongoose.Schema(
  { name: { type: String, trim: true } },
  { _id: false }
);

const IntakeFormSchema = new mongoose.Schema({
  leadId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  conversationId: { type: String, index: true },

  // Section 1: Area of interest
  areaOfInterest: {
    type: String,
    enum: ['income_protection', 'final_expense', 'both', null],
    default: null,
  },

  // Section 2: Income protection preference
  incomeProtectionPreference: {
    type: String,
    enum: ['keep_coming_in', 'stop_right_there', null],
    default: null,
  },

  // Section 3: Health & underwriting
  medications:         { type: [MedicationSchema], default: [] },
  hasMajorHealthEvent: { type: Boolean, default: null },
  healthEventDetails:  { type: String, trim: true, default: '' },
  usesTobacco:         { type: Boolean, default: null },

  // Section 4: Final expense
  financialBurdenPreference: {
    type: String,
    enum: ['burden', 'blessing', null],
    default: null,
  },
  burialPreference: {
    type: String,
    enum: ['cremated', 'buried', null],
    default: null,
  },
  funeralHome: { type: String, trim: true, default: '' },

  // Section 5: Referrals (up to 10)
  referrals: { type: [ReferralSchema], default: [] },

  completedAt: { type: Date },
  isPartial:   { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('IntakeForm', IntakeFormSchema);
