const { Schema, model } = require('mongoose');

const inboxMessageSchema = new Schema(
  {
    recipient_id: { type: String, required: true },
    type: {
      type: String,
      enum: ['ANOMALY', 'WAITLIST', 'WORKFLOW', 'SYSTEM'],
      required: true
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    read_at: { type: Date, default: null },
    retention_until: { type: Date, default: null },
    linked_audit_id: { type: Schema.Types.ObjectId, ref: 'AuditLog', default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

inboxMessageSchema.index({ recipient_id: 1, created_at: -1 });
inboxMessageSchema.index({ retention_until: 1 }, { expireAfterSeconds: 0 });

module.exports = model('InboxMessage', inboxMessageSchema, 'inbox_messages');
