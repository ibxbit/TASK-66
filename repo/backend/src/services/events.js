const AuthEvent = require('../models/auth-event');
const AuditLog = require('../models/audit-log');

const SEVEN_YEARS_IN_MS = 7 * 365 * 24 * 60 * 60 * 1000;

const logAuthEvent = async ({ req, eventType, userId = null, username = null, metadata = {} }) => {
  await AuthEvent.create({
    event_type: eventType,
    user_id: userId,
    username,
    ip_address: req.ip,
    user_agent: req.get('user-agent') || null,
    metadata
  });
};

const logAuditEvent = async ({ actorId, action, entityType, entityId, metadata = {} }) => {
  const now = Date.now();
  await AuditLog.create({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: String(entityId),
    metadata,
    retention_until: new Date(now + SEVEN_YEARS_IN_MS)
  });
};

module.exports = {
  logAuthEvent,
  logAuditEvent
};
