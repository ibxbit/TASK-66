const { Schema, model } = require('mongoose');

const reportDefinitionSchema = new Schema(
  {
    report_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    dataset: { type: String, required: true },
    format: { type: String, enum: ['CSV', 'JSON'], required: true },
    dimensions: {
      type: [{ _id: false, key: { type: String }, type: { type: String, default: 'STRING' } }],
      default: []
    },
    group_by: { type: String, default: null },
    filter_template: { type: Schema.Types.Mixed, default: {} },
    schedule: {
      time: { type: String, required: true },
      timezone: { type: String, required: true }
    },
    created_by: { type: String, required: true },
    active: { type: Boolean, default: true },
    last_scheduled_run_date: { type: String, default: null }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('ReportDefinition', reportDefinitionSchema, 'report_definitions');
