const { Schema, model } = require('mongoose');

const routeSegmentSchema = new Schema(
  {
    route_id: { type: String, required: true },
    from_case_id: { type: Schema.Types.ObjectId, ref: 'DisplayCase', required: true },
    to_case_id: { type: Schema.Types.ObjectId, ref: 'DisplayCase', required: true },
    segment_type: {
      type: String,
      enum: ['REQUIRED_NEXT', 'OPTIONAL_BRANCH', 'ACCESSIBILITY_DETOUR'],
      required: true
    },
    dwell_minutes: { type: Number, min: 0, default: 0 },
    distance_meters: { type: Number, min: 0, default: 0 },
    order: { type: Number, required: true, min: 1 }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

routeSegmentSchema.index({ route_id: 1, order: 1 });
routeSegmentSchema.index({ route_id: 1, from_case_id: 1 });

module.exports = model('RouteSegment', routeSegmentSchema, 'route_segments');
