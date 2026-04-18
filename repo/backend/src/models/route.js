const { Schema, model } = require('mongoose');

const routeSchema = new Schema(
  {
    route_id: { type: String, required: true, unique: true },
    venue_id: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    name: { type: String, required: true, trim: true },
    strict_sequence: { type: Boolean, default: false },
    default_pace_mph: { type: Number, default: 3, min: 0.1 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

routeSchema.index({ venue_id: 1 });

module.exports = model('Route', routeSchema, 'routes');
