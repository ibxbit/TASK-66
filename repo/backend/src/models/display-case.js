const { Schema, model } = require('mongoose');

const displayCaseSchema = new Schema(
  {
    zone_id: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
    name: { type: String, required: true, trim: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

displayCaseSchema.index({ zone_id: 1 });

module.exports = model('DisplayCase', displayCaseSchema, 'display_cases');
