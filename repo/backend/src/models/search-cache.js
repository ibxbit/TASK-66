const { Schema, model } = require('mongoose');

const searchCacheSchema = new Schema(
  {
    query_hash: { type: String, required: true },
    role_scope: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    hit_count: { type: Number, default: 0 },
    expires_at: { type: Date, required: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

searchCacheSchema.index({ query_hash: 1, role_scope: 1 }, { unique: true });
searchCacheSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = model('SearchCache', searchCacheSchema, 'search_cache');
