const { Schema, model } = require('mongoose');

const programSessionSchema = new Schema(
  {
    program_id: { type: Schema.Types.ObjectId, ref: 'Program', required: true },
    coach_id: { type: Schema.Types.ObjectId, ref: 'Coach', required: true },
    venue_id: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    start_at_utc: { type: Date, required: true },
    end_at_utc: { type: Date, required: true },
    timezone: { type: String, required: true },
    capacity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['SCHEDULED', 'CANCELLED'],
      default: 'SCHEDULED'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

programSessionSchema.index({ start_at_utc: 1, end_at_utc: 1 });
programSessionSchema.index({ coach_id: 1, start_at_utc: 1 });

module.exports = model('ProgramSession', programSessionSchema, 'program_sessions');
