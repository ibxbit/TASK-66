const { Schema, model } = require('mongoose');

const dimensionDefinitionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    dataset: { type: String, required: true },
    field: { type: String, required: true },
    data_type: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

module.exports = model('DimensionDefinition', dimensionDefinitionSchema, 'dimension_definitions');
