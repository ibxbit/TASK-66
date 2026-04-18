const { Schema, model } = require('mongoose');

const exportJobSchema = new Schema(
  {
    export_job_id: { type: String, required: true, unique: true },
    requester_id: { type: String, required: true },
    resource: { type: String, required: true },
    format: { type: String, enum: ['CSV', 'JSON'], required: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    fields: { type: [String], default: [] },
    mask_policy_version: { type: String, required: true, default: 'v1' },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'],
      default: 'QUEUED'
    },
    artifact_path: { type: String, default: null },
    checksum_sha256: { type: String, default: null },
    masking_preview: { type: Schema.Types.Mixed, default: {} },
    error_message: { type: String, default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

exportJobSchema.index({ requester_id: 1, created_at: -1 });

module.exports = model('ExportJob', exportJobSchema, 'export_jobs');
