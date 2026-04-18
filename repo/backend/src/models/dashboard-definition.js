const { Schema, model } = require('mongoose');

const dashboardDefinitionSchema = new Schema(
  {
    dashboard_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tiles: { type: [Schema.Types.Mixed], default: [] },
    anomaly_rules: { type: [String], default: [] },
    created_by: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('DashboardDefinition', dashboardDefinitionSchema, 'dashboard_definitions');
