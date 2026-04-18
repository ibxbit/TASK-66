const { Schema, model } = require('mongoose');

const graphNodeSchema = new Schema(
  {
    node_id: { type: String, required: true },
    type: {
      type: String,
      enum: ['STAMP', 'MASTERPIECE', 'ARTIST', 'COUNTRY_PERIOD', 'SERIES'],
      required: true
    },
    label: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const graphEdgeSchema = new Schema(
  {
    edge_id: { type: String, required: true },
    from_node_id: { type: String, required: true },
    to_node_id: { type: String, required: true },
    relation_type: { type: String, required: true },
    weight: { type: Number, min: 0, max: 100, required: true },
    constraints: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const graphDraftSchema = new Schema(
  {
    draft_id: { type: String, required: true, unique: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    base_version: { type: Number, default: 0 },
    snapshot: {
      nodes: { type: [graphNodeSchema], default: [] },
      edges: { type: [graphEdgeSchema], default: [] }
    },
    validation_report: {
      status: { type: String, enum: ['VALID', 'INVALID'], default: 'VALID' },
      issues: { type: [Schema.Types.Mixed], default: [] }
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT'
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

graphDraftSchema.index({ status: 1, created_at: -1 });

module.exports = model('GraphDraft', graphDraftSchema, 'graph_drafts');
