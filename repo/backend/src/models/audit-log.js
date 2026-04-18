const { Schema, model } = require('mongoose');

const immutableBlock = () => {
  throw new Error('Audit logs are immutable');
};

const auditLogSchema = new Schema(
  {
    actor_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true
    },
    entity_type: {
      type: String,
      required: true
    },
    entity_id: {
      type: String,
      required: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    retention_until: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    strict: true
  }
);

auditLogSchema.index({ actor_id: 1, created_at: -1 });
auditLogSchema.index({ action: 1, created_at: -1 });
auditLogSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });
auditLogSchema.index({ retention_until: 1 }, { expireAfterSeconds: 0 });

auditLogSchema.pre('deleteOne', immutableBlock);
auditLogSchema.pre('deleteMany', immutableBlock);
auditLogSchema.pre('findOneAndDelete', immutableBlock);
auditLogSchema.pre('findOneAndReplace', immutableBlock);
auditLogSchema.pre('findOneAndUpdate', immutableBlock);
auditLogSchema.pre('replaceOne', immutableBlock);
auditLogSchema.pre('updateOne', immutableBlock);
auditLogSchema.pre('updateMany', immutableBlock);

module.exports = model('AuditLog', auditLogSchema, 'audit_logs');
