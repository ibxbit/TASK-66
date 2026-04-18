const { Schema, model } = require('mongoose');

const metricDefinitionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    dataset: { type: String, required: true },
    aggregation: { type: String, required: true },
    dimensions: [{ 
      key: { type: String, required: true }, 
      type: { type: String, required: true, default: 'STRING' } 
    }],
    group_by: { type: String, default: null },
    filter_template: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('MetricDefinition', metricDefinitionSchema, 'metric_definitions');
