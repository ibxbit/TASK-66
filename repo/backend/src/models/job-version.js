const { Schema, model } = require('mongoose');

const jobVersionSchema = new Schema(
  {
    job_id: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    actor_id: { type: String, required: true },
    reason: { type: String, default: '' }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

jobVersionSchema.index({ job_id: 1, version: -1 }, { unique: true });

module.exports = model('JobVersion', jobVersionSchema, 'job_versions');
