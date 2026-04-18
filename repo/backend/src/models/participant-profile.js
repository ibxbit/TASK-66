const { Schema, model } = require('mongoose');

const participantProfileSchema = new Schema(
  {
    participant_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('ParticipantProfile', participantProfileSchema, 'participant_profiles');
