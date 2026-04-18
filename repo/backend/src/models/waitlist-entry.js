const { Schema, model } = require('mongoose');

const waitlistEntrySchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: 'ProgramSession', required: true },
    participant_id: { type: String, required: true },
    registration_id: { type: Schema.Types.ObjectId, ref: 'Registration', required: true },
    position: { type: Number, required: true },
    promoted_at: { type: Date, default: null },
    promotion_expires_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ['WAITLISTED', 'PROMOTION_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'],
      default: 'WAITLISTED'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

waitlistEntrySchema.index({ session_id: 1, position: 1 }, { unique: true });
waitlistEntrySchema.index({ session_id: 1, status: 1 });

module.exports = model('WaitlistEntry', waitlistEntrySchema, 'waitlist_entries');
