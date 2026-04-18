const { Schema, model } = require('mongoose');

const hotKeywordSchema = new Schema(
  {
    keyword: { type: String, required: true, trim: true },
    rank: { type: Number, required: true, min: 1 },
    active_from: { type: Date, required: true },
    active_to: { type: Date, required: true },
    curated_by: { type: String, default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'RETIRED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

hotKeywordSchema.index({ rank: 1 });
hotKeywordSchema.index({ keyword: 1, status: 1 });

module.exports = model('HotKeyword', hotKeywordSchema, 'hot_keywords');
