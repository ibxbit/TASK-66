const express = require('express');
const InboxMessage = require('../models/inbox-message');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { sendError } = require('../lib/http');

const router = express.Router();

router.use(requireAuth, requirePermission('INBOX_READ'));

router.get('/messages', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(51, Math.max(1, Number(req.query.pageSize || 20)));
  const unread = req.query['filter[unread]'] || req.query?.filter?.unread;
  const type = req.query['filter[type]'] || req.query?.filter?.type;

  const query = { recipient_id: String(req.auth.userId) };
  if (unread === 'true') query.read_at = null;
  if (unread === 'false') query.read_at = { $ne: null };
  if (type) query.type = type;

  const total = await InboxMessage.countDocuments(query);
  const docs = await InboxMessage.find(query)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return res.status(200).json({
    data: docs.map((item) => ({
      id: String(item._id),
      type: item.type,
      title: item.title,
      body: item.body,
      createdAt: item.created_at,
      readAt: item.read_at
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  });
});

router.post('/messages/:messageId/read', async (req, res) => {
  const message = await InboxMessage.findOneAndUpdate(
    { _id: req.params.messageId, recipient_id: String(req.auth.userId) },
    { read_at: new Date() },
    { new: true }
  ).lean();

  if (!message) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Message not found');
  }

  return res.status(200).json({
    data: {
      id: String(message._id),
      readAt: message.read_at
    }
  });
});

router.post('/messages/:messageId/print', async (req, res) => {
  const message = await InboxMessage.findOne({
    _id: req.params.messageId,
    recipient_id: String(req.auth.userId)
  }).lean();

  if (!message) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Message not found');
  }

  return res.status(200).json({
    data: {
      messageId: String(message._id),
      printable: message.payload?.printable || {
        noticeType: 'INBOX_NOTICE',
        title: message.title,
        body: message.body,
        createdAt: message.created_at
      }
    }
  });
});

module.exports = router;
