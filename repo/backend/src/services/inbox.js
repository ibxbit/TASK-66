const InboxMessage = require('../models/inbox-message');
const config = require('../config');

const createInboxMessage = async ({ recipientId, type, title, body, payload = {}, linkedAuditId = null }) => {
  const retentionUntil = new Date(
    Date.now() + config.operations.inboxRetentionDays * 24 * 60 * 60 * 1000
  );

  return InboxMessage.create({
    recipient_id: String(recipientId),
    type,
    title,
    body,
    payload,
    retention_until: retentionUntil,
    linked_audit_id: linkedAuditId
  });
};

module.exports = {
  createInboxMessage
};
