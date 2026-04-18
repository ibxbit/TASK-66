const { Schema, model } = require('mongoose');

const coachSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    qualifications: { type: [String], default: [] },
    contact: { type: String, default: '' },
    active: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('Coach', coachSchema, 'coaches');
