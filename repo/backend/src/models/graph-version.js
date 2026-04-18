const { Schema, model } = require('mongoose');

const graphVersionSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    published_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    published_at: { type: Date, required: true },
    checksum: { type: String, required: true },
    summary: { type: String, default: '' },
    snapshot: {
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] }
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

graphVersionSchema.index({ version: -1 });

module.exports = model('GraphVersion', graphVersionSchema, 'graph_versions');
