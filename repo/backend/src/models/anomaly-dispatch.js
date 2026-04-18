const { Schema, model } = require('mongoose');

const anomalyDispatchSchema = new Schema(
  {
    dedupe_key: { type: String, required: true, unique: true },
    dashboard_id: { type: String, required: true },
    rule_key: { type: String, required: true },
    period_key: { type: String, required: true },
    recipient_id: { type: String, required: true },
    message_id: { type: Schema.Types.ObjectId, ref: 'InboxMessage', default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

anomalyDispatchSchema.index({ dashboard_id: 1, created_at: -1 });

module.exports = model('AnomalyDispatch', anomalyDispatchSchema, 'anomaly_dispatches');
