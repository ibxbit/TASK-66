const { Schema, model } = require('mongoose');

const catalogItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    catalog_number: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    series: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    period: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

catalogItemSchema.index({ catalog_number: 1 }, { unique: true });
catalogItemSchema.index({ category: 1 });
catalogItemSchema.index({ tags: 1 });
catalogItemSchema.index({ series: 1 });
catalogItemSchema.index({ period: 1 });
catalogItemSchema.index({ title: 'text', catalog_number: 'text', artist: 'text', series: 'text', country: 'text', period: 'text', tags: 'text' });

module.exports = model('CatalogItem', catalogItemSchema, 'catalog_items');
