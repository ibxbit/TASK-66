const { Schema, model } = require('mongoose');

const coachAvailabilitySchema = new Schema(
  {
    coach_id: { type: Schema.Types.ObjectId, ref: 'Coach', required: true },
    start_at_utc: { type: Date, required: true },
    end_at_utc: { type: Date, required: true },
    timezone: { type: String, required: true },
    recurrence: { type: String, default: null },
    venue_constraints: { type: [String], default: [] },
    program_constraints: { type: [String], default: [] }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

coachAvailabilitySchema.index({ coach_id: 1, start_at_utc: 1, end_at_utc: 1 });

module.exports = model('CoachAvailability', coachAvailabilitySchema, 'coach_availability');
