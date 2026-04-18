const { Schema, model } = require('mongoose');

const jobSchema = new Schema(
  {
    department: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    shift_info: { type: String, required: true },
    current_state: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'PUBLISHED',
        'TAKEDOWN',
        'APPEAL_PENDING',
        'REJECTED_APPEAL',
        'REPUBLISHED_NEW_VERSION'
      ],
      default: 'DRAFT'
    },
    created_by: { type: String, required: true },
    current_appeal_id: { type: String, default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

jobSchema.index({ current_state: 1, created_at: -1 });

module.exports = model('Job', jobSchema, 'jobs');
