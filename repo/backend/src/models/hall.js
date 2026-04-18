const { Schema, model } = require('mongoose');

const hallSchema = new Schema(
  {
    venue_id: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    name: { type: String, required: true, trim: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

hallSchema.index({ venue_id: 1 });

module.exports = model('Hall', hallSchema, 'halls');
