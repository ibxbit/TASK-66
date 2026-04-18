const { Schema, model } = require('mongoose');

const anomalyRuleSchema = new Schema(
  {
    rule_key: { type: String, required: true, unique: true },
    metric_key: { type: String, required: true },
    comparison: {
      type: String,
      enum: ['WOW_DROP_GT_PERCENT'],
      default: 'WOW_DROP_GT_PERCENT'
    },
    threshold_percent: { type: Number, required: true, default: 30 },
    min_baseline_count: { type: Number, required: true, default: 20 },
    enabled: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('AnomalyRule', anomalyRuleSchema, 'anomaly_rules');
