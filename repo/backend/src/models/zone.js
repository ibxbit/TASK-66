const { Schema, model } = require('mongoose');

const zoneSchema = new Schema(
  {
    hall_id: { type: Schema.Types.ObjectId, ref: 'Hall', required: true },
    name: { type: String, required: true, trim: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

zoneSchema.index({ hall_id: 1 });

module.exports = model('Zone', zoneSchema, 'zones');
