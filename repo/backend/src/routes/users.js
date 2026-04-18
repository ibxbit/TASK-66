const express = require('express');
const User = require('../models/user');
const { ROLES } = require('../constants/roles');
const { validatePasswordStrength, hashPassword } = require('../lib/password');
const { sendError } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

router.use(requireAuth, requirePermission('USERS_ADMIN'));

router.get('/', async (req, res) => {
  const users = await User.find({}, { password_hash: 0 }).sort({ username: 1 }).lean();
  return res.status(200).json({ data: users });
});

router.post('/', async (req, res) => {
  const { username, password, roles } = req.body || {};
  const details = [];

  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 64) {
    details.push({ field: 'username', issue: 'must be 3-64 characters' });
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    details.push({ field: 'password', issue: passwordValidation.message });
  }

  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => !ROLES.includes(role))) {
    details.push({ field: 'roles', issue: 'must be a non-empty subset of role enum' });
  }

  if (details.length > 0) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  const created = await User.create({
    username: username.toLowerCase().trim(),
    password_hash: await hashPassword(password),
    roles,
    status: 'ACTIVE'
  });

  return res.status(201).json({
    data: {
      id: String(created._id),
      username: created.username,
      roles: created.roles,
      status: created.status
    }
  });
});

router.patch('/:userId', async (req, res) => {
  const updates = {};

  if (req.body.roles !== undefined) {
    if (!Array.isArray(req.body.roles) || req.body.roles.length === 0 || req.body.roles.some((role) => !ROLES.includes(role))) {
      return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
        { field: 'roles', issue: 'must be a subset of role enum' }
      ]);
    }
    updates.roles = req.body.roles;
  }

  if (req.body.status !== undefined) {
    if (!['ACTIVE', 'DISABLED'].includes(req.body.status)) {
      return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
        { field: 'status', issue: 'must be ACTIVE or DISABLED' }
      ]);
    }
    updates.status = req.body.status;
  }

  const user = await User.findByIdAndUpdate(req.params.userId, updates, {
    new: true,
    projection: { password_hash: 0 }
  }).lean();

  if (!user) {
    return sendError(res, req, 404, 'NOT_FOUND', 'User not found');
  }

  return res.status(200).json({ data: user });
});

module.exports = router;
