const { Schema, model } = require('mongoose');

const programSchema = new Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    cancellation_policy: {
      late_cancel_hours: { type: Number, default: 12 },
      late_cancel_deduct: { type: Number, default: 1 },
      no_show_deduct: { type: Number, default: 2 }
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('Program', programSchema, 'programs');
