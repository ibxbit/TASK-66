const { Schema, model } = require('mongoose');

const registrationSchema = new Schema(
  {
    session_id: { type: Schema.Types.ObjectId, ref: 'ProgramSession', required: true },
    participant_id: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'REGISTERED',
        'WAITLISTED',
        'CANCELLED',
        'LATE_CANCEL',
        'NO_SHOW',
        'ATTENDED',
        'PROMOTION_PENDING'
      ],
      default: 'REGISTERED'
    },
    waitlist_position: { type: Number, default: null },
    promoted_at: { type: Date, default: null },
    promotion_expires_at: { type: Date, default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

registrationSchema.index({ session_id: 1, participant_id: 1 }, { unique: true });
registrationSchema.index({ session_id: 1, status: 1 });

module.exports = model('Registration', registrationSchema, 'registrations');
