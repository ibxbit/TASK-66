const { Schema, model } = require('mongoose');

const jobWorkflowEventSchema = new Schema(
  {
    job_id: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    from_state: { type: String, required: true },
    to_state: { type: String, required: true },
    actor_id: { type: String, required: true },
    comment: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

jobWorkflowEventSchema.index({ job_id: 1, created_at: -1 });
jobWorkflowEventSchema.index({ to_state: 1, created_at: -1 });

module.exports = model('JobWorkflowEvent', jobWorkflowEventSchema, 'job_workflow_events');
