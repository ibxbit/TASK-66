const { Schema, model } = require('mongoose');

const venueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    default_pace_mph: { type: Number, default: 3, min: 0.1 }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('Venue', venueSchema, 'venues');
