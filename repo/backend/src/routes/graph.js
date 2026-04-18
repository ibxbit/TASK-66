const crypto = require('crypto');
const { randomUUID } = require('crypto');
const express = require('express');
const GraphDraft = require('../models/graph-draft');
const GraphVersion = require('../models/graph-version');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireStepUp } = require('../middleware/step-up');
const { STEP_UP_ACTIONS } = require('../constants/step-up-actions');
const { sendError } = require('../lib/http');
const { validateGraphSnapshot } = require('../services/graph-validation');
const { logAuditEvent } = require('../services/events');

const router = express.Router();

const canReadUnpublishedDraft = (req, draft) => {
  const roles = req.auth?.roles || [];
  if (roles.includes('Administrator') || roles.includes('Curator')) {
    return true;
  }
  return String(draft.created_by) === String(req.auth?.userId);
};

const canMutateDraft = (req, draft) => {
  const roles = req.auth?.roles || [];
  if (roles.includes('Administrator')) {
    return true;
  }
  return String(draft.created_by) === String(req.auth?.userId);
};

router.use(requireAuth);

router.get('/versions', requirePermission('GRAPH_READ'), async (req, res) => {
  const versions = await GraphVersion.find({}, { snapshot: 0 })
    .sort({ version: -1 })
    .limit(100)
    .lean();

  return res.status(200).json({
    data: versions.map((item) => ({
      version: item.version,
      publishedBy: String(item.published_by),
      publishedAt: item.published_at,
      checksum: item.checksum,
      summary: item.summary
    }))
  });
});

router.post('/drafts', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const latest = await GraphVersion.findOne({}).sort({ version: -1 }).lean();
  const draft = await GraphDraft.create({
    draft_id: `gdr_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
    created_by: req.auth.userId,
    base_version: latest?.version || 0,
    snapshot: latest?.snapshot || { nodes: [], edges: [] },
    validation_report: { status: 'VALID', issues: [] },
    status: 'DRAFT'
  });

  return res.status(201).json({
    data: {
      draftId: draft.draft_id,
      baseVersion: draft.base_version,
      status: draft.status
    }
  });
});

router.get('/drafts/:draftId', requirePermission('GRAPH_READ'), async (req, res) => {
  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId }).lean();
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }

  if (draft.status !== 'PUBLISHED' && !canReadUnpublishedDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot access unpublished draft created by another user');
  }

  return res.status(200).json({
    data: {
      draftId: draft.draft_id,
      baseVersion: draft.base_version,
      status: draft.status,
      snapshot: draft.snapshot,
      validation: draft.validation_report
    }
  });
});

router.post('/drafts/:draftId/nodes', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const { type, label, metadata } = req.body || {};
  if (!type || !label) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'type/label', issue: 'required fields missing' }
    ]);
  }

  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const node = {
    node_id: `n_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
    type,
    label,
    metadata: metadata || {}
  };
  draft.snapshot.nodes.push(node);
  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(201).json({ data: node });
});

router.patch('/drafts/:draftId/nodes/:nodeId', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const node = draft.snapshot.nodes.find((item) => item.node_id === req.params.nodeId);
  if (!node) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Node not found');
  }

  if (req.body.label !== undefined) node.label = req.body.label;
  if (req.body.metadata !== undefined) node.metadata = req.body.metadata;

  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(200).json({ data: node });
});

router.delete('/drafts/:draftId/nodes/:nodeId', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const before = draft.snapshot.nodes.length;
  draft.snapshot.nodes = draft.snapshot.nodes.filter((item) => item.node_id !== req.params.nodeId);
  draft.snapshot.edges = draft.snapshot.edges.filter(
    (edge) => edge.from_node_id !== req.params.nodeId && edge.to_node_id !== req.params.nodeId
  );

  if (before === draft.snapshot.nodes.length) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Node not found');
  }

  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(204).send();
});

router.post('/drafts/:draftId/edges', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const { fromNodeId, toNodeId, relationType, weight, constraints } = req.body || {};
  if (!fromNodeId || !toNodeId || !relationType || !Number.isInteger(weight) || weight < 0 || weight > 100) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'edge', issue: 'fromNodeId, toNodeId, relationType, weight(0-100) required' }
    ]);
  }

  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const edge = {
    edge_id: `e_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    relation_type: relationType,
    weight,
    constraints: constraints || {}
  };

  draft.snapshot.edges.push(edge);
  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(201).json({ data: edge });
});

router.patch('/drafts/:draftId/edges/:edgeId', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const { fromNodeId, toNodeId, relationType, weight, constraints } = req.body || {};
  if (!fromNodeId || !toNodeId || !relationType || !Number.isInteger(weight) || weight < 0 || weight > 100) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'edge', issue: 'fromNodeId, toNodeId, relationType, weight(0-100) required' }
    ]);
  }

  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const edge = draft.snapshot.edges.find((item) => item.edge_id === req.params.edgeId);
  if (!edge) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Edge not found');
  }

  edge.from_node_id = fromNodeId;
  edge.to_node_id = toNodeId;
  edge.relation_type = relationType;
  edge.weight = weight;
  edge.constraints = constraints || {};

  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(200).json({ data: edge });
});

router.delete('/drafts/:draftId/edges/:edgeId', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  const before = draft.snapshot.edges.length;
  draft.snapshot.edges = draft.snapshot.edges.filter((item) => item.edge_id !== req.params.edgeId);
  if (before === draft.snapshot.edges.length) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Edge not found');
  }

  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(204).send();
});

router.post('/drafts/:draftId/validate', requirePermission('GRAPH_DRAFT_EDIT'), async (req, res) => {
  const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
  if (!draft) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
  }
  if (!canMutateDraft(req, draft)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
  }

  draft.validation_report = validateGraphSnapshot(draft.snapshot);
  await draft.save();

  return res.status(200).json({ data: draft.validation_report });
});

router.post(
  '/drafts/:draftId/publish',
  requirePermission('GRAPH_PUBLISH'),
  requireStepUp(STEP_UP_ACTIONS.GRAPH_PUBLISH),
  async (req, res) => {
    const draft = await GraphDraft.findOne({ draft_id: req.params.draftId });
    if (!draft) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Graph draft not found');
    }
    if (!canMutateDraft(req, draft)) {
      return sendError(res, req, 403, 'FORBIDDEN', 'Cannot modify draft created by another user');
    }

    draft.validation_report = validateGraphSnapshot(draft.snapshot);
    if (draft.validation_report.status === 'INVALID') {
      await draft.save();
      return sendError(res, req, 422, 'GRAPH_VALIDATION_BLOCKED', 'Blocking validation issues remain', [
        ...draft.validation_report.issues
      ]);
    }

    const latest = await GraphVersion.findOne({}).sort({ version: -1 });
    const nextVersion = (latest?.version || 0) + 1;
    const publishedAt = new Date();
    const checksum = crypto.createHash('sha256').update(JSON.stringify(draft.snapshot)).digest('hex');

    await GraphVersion.create({
      version: nextVersion,
      published_by: req.auth.userId,
      published_at: publishedAt,
      checksum,
      summary: `Published from ${draft.draft_id}`,
      snapshot: draft.snapshot
    });

    draft.status = 'PUBLISHED';
    await draft.save();

    await logAuditEvent({
      actorId: req.auth.userId,
      action: 'GRAPH_PUBLISH',
      entityType: 'graph_version',
      entityId: String(nextVersion),
      metadata: { draftId: draft.draft_id, stepUp: true }
    });

    return res.status(200).json({
      data: {
        version: nextVersion,
        publishedAt: publishedAt.toISOString()
      }
    });
  }
);

module.exports = router;
