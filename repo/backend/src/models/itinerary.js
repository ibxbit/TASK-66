const { Schema, model } = require('mongoose');

const itinerarySchema = new Schema(
  {
    itinerary_id: { type: String, required: true, unique: true },
    route_id: { type: String, required: true },
    accessibility_mode: { type: Boolean, default: false },
    estimated_walk_minutes: { type: Number, required: true },
    printable_payload: { type: Schema.Types.Mixed, required: true }
  },
  {
    timestamps: { createdAt: 'generated_at', updatedAt: false },
    versionKey: false
  }
);

itinerarySchema.index({ route_id: 1, generated_at: -1 });

module.exports = model('Itinerary', itinerarySchema, 'itineraries');
