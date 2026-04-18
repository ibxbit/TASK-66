const express = require('express');
const AuditLog = require('../models/audit-log');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { sendError } = require('../lib/http');

const router = express.Router();

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'stepuptoken',
  'step_up_token',
  'session',
  'sessionid',
  'session_id',
  'csrf',
  'secret'
]);

const sanitizeMetadata = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }

  if (value && typeof value === 'object') {
    const safe = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase();
      if (SENSITIVE_KEYS.has(normalized)) {
        continue;
      }
      safe[key] = sanitizeMetadata(nested);
    }
    return safe;
  }

  return value;
};

router.use(requireAuth, requirePermission('AUDIT_READ'));

router.get('/events', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(51, Math.max(1, Number(req.query.pageSize || 20)));
  const action = req.query['filter[action]'] || req.query?.filter?.action;
  const actorId = req.query['filter[actorId]'] || req.query?.filter?.actorId;
  const entityType = req.query['filter[entityType]'] || req.query?.filter?.entityType;
  const from = req.query['filter[from]'] || req.query?.filter?.from;
  const to = req.query['filter[to]'] || req.query?.filter?.to;

  const query = {};
  if (action) query.action = String(action);
  if (actorId) query.actor_id = String(actorId);
  if (entityType) query.entity_type = String(entityType);
  if (from || to) {
    query.created_at = {};
    if (from) {
      const fromDate = new Date(String(from));
      if (Number.isNaN(fromDate.getTime())) {
        return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
          { field: 'filter[from]', issue: 'must be a valid ISO date' }
        ]);
      }
      query.created_at.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(String(to));
      if (Number.isNaN(toDate.getTime())) {
        return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
          { field: 'filter[to]', issue: 'must be a valid ISO date' }
        ]);
      }
      query.created_at.$lte = toDate;
    }
  }

  const total = await AuditLog.countDocuments(query);
  const rows = await AuditLog.find(query)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return res.status(200).json({
    data: rows.map((row) => ({
      id: String(row._id),
      actorId: String(row.actor_id),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
      metadata: sanitizeMetadata(row.metadata || {})
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  });
});

module.exports = router;
