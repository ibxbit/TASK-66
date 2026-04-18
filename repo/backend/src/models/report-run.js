const { Schema, model } = require('mongoose');

const reportRunSchema = new Schema(
  {
    run_id: { type: String, required: true, unique: true },
    report_id: { type: String, required: true },
    trigger_type: { type: String, enum: ['SCHEDULED', 'MANUAL', 'RETRY'], required: true },
    status: { type: String, enum: ['RUNNING', 'SUCCESS', 'FAILED'], required: true },
    artifact_path: { type: String, default: null },
    checksum_sha256: { type: String, default: null },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, default: null },
    error_message: { type: String, default: null },
    attempt: { type: Number, default: 1 }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

reportRunSchema.index({ report_id: 1, started_at: -1 });

module.exports = model('ReportRun', reportRunSchema, 'report_runs');
