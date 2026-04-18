const { randomUUID } = require('crypto');
const express = require('express');
const User = require('../models/user');
const config = require('../config');
const { STEP_UP_ACTION_VALUES } = require('../constants/step-up-actions');
const { validatePasswordStrength, verifyPassword } = require('../lib/password');
const { sendError } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');
const { logAuthEvent, logAuditEvent } = require('../services/events');

const router = express.Router();

const lockoutWindowMs = config.auth.lockoutMinutes * 60 * 1000;
const failedWindowMs = config.auth.failedWindowMinutes * 60 * 1000;

const regenerateSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const registerFailedLoginAttempt = async ({ req, user, reason }) => {
  const now = Date.now();
  const windowStart = user.failed_login_window_started_at?.getTime() || 0;
  const withinWindow = now - windowStart <= failedWindowMs;

  user.failed_login_count = withinWindow ? user.failed_login_count + 1 : 1;
  user.failed_login_window_started_at = new Date(now);

  if (user.failed_login_count >= config.auth.maxFailedAttempts) {
    user.lockout_until = new Date(now + lockoutWindowMs);
    await logAuthEvent({
      req,
      eventType: 'LOCKOUT_TRIGGERED',
      userId: user._id,
      username: user.username,
      metadata: { lockoutUntil: user.lockout_until.toISOString() }
    });
  }

  await user.save();

  await logAuthEvent({
    req,
    eventType: 'LOGIN_FAILURE',
    userId: user._id,
    username: user.username,
    metadata: { reason }
  });
};

const buildSessionPayload = ({ userId, username, roles }) => {
  const now = Date.now();
  const idleExpiresAt = new Date(now + config.session.idleTtlSeconds * 1000);
  const absoluteExpiresAt = new Date(now + config.session.absoluteTtlSeconds * 1000);
  return {
    userId,
    username,
    roles,
    idleExpiresAt: idleExpiresAt.toISOString(),
    expiresAt: absoluteExpiresAt.toISOString(),
    stepUpProof: null,
    csrfToken: randomUUID()
  };
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || username.length < 3 || username.length > 64) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'username', issue: 'must be 3-64 characters' }
    ]);
  }

  const normalizedUsername = username.toLowerCase().trim();
  const user = await User.findOne({ username: normalizedUsername });

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    if (user) {
      const now = Date.now();
      if (user.lockout_until && now < user.lockout_until.getTime()) {
        await logAuthEvent({
          req,
          eventType: 'LOGIN_FAILURE',
          userId: user._id,
          username: normalizedUsername,
          metadata: { reason: 'locked', lockoutUntil: user.lockout_until.toISOString() }
        });
        return sendError(res, req, 401, 'ACCOUNT_LOCKED', 'Account is locked', [
          { field: 'lockoutUntil', issue: user.lockout_until.toISOString() }
        ]);
      }

      await registerFailedLoginAttempt({ req, user, reason: 'invalid_credentials' });
    }

    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'password', issue: passwordValidation.message }
    ]);
  }

  if (!user) {
    await logAuthEvent({
      req,
      eventType: 'LOGIN_FAILURE',
      username: normalizedUsername,
      metadata: { reason: 'invalid_credentials' }
    });
    return sendError(res, req, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  const now = Date.now();
  if (user.lockout_until && now < user.lockout_until.getTime()) {
    await logAuthEvent({
      req,
      eventType: 'LOGIN_FAILURE',
      userId: user._id,
      username: normalizedUsername,
      metadata: { reason: 'locked', lockoutUntil: user.lockout_until.toISOString() }
    });
    return sendError(res, req, 401, 'ACCOUNT_LOCKED', 'Account is locked', [
      { field: 'lockoutUntil', issue: user.lockout_until.toISOString() }
    ]);
  }

  const matches = await verifyPassword(password, user.password_hash);
  if (!matches) {
    await registerFailedLoginAttempt({ req, user, reason: 'invalid_credentials' });

    return sendError(res, req, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  user.failed_login_count = 0;
  user.failed_login_window_started_at = null;
  user.lockout_until = null;
  user.last_login_at = new Date(now);
  await user.save();

  await regenerateSession(req);

  req.session.auth = buildSessionPayload({
    userId: String(user._id),
    username: user.username,
    roles: user.roles
  });
  req.session.cookie.maxAge = config.session.idleTtlSeconds * 1000;

  await logAuthEvent({ req, eventType: 'LOGIN_SUCCESS', userId: user._id, username: user.username });

  return res.status(200).json({
    data: {
      user: {
        id: String(user._id),
        username: user.username,
        roles: user.roles
      },
      session: {
        id: req.session.id,
        idleExpiresAt: req.session.auth.idleExpiresAt
      },
      csrfToken: req.session.auth.csrfToken
    }
  });
});

router.post('/logout', async (req, res) => {
  if (req.session?.auth?.userId) {
    await logAuthEvent({
      req,
      eventType: 'LOGOUT',
      userId: req.session.auth.userId,
      username: req.session.auth.username
    });
  }

  req.session.destroy(() => {
    res.clearCookie(config.session.cookieName);
    res.status(204).send();
  });
});

router.get('/me', requireAuth, async (req, res) => {
  return res.status(200).json({
    data: {
      user: {
        id: req.auth.userId,
        username: req.auth.username,
        roles: req.auth.roles
      },
      session: {
        id: req.auth.sessionId,
        idleExpiresAt: req.auth.idleExpiresAt,
        stepUpValidUntil: req.auth.stepUpValidUntil,
        stepUpAction: req.auth.stepUpAction
      }
    }
  });
});

router.post('/step-up', requireAuth, async (req, res) => {
  const { password, action } = req.body || {};
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'password', issue: passwordValidation.message }
    ]);
  }

  if (typeof action !== 'string' || !STEP_UP_ACTION_VALUES.includes(action)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'action', issue: `must be one of: ${STEP_UP_ACTION_VALUES.join(', ')}` }
    ]);
  }

  const user = await User.findById(req.auth.userId);
  const matches = user ? await verifyPassword(password, user.password_hash) : false;
  if (!matches) {
    await logAuthEvent({
      req,
      eventType: 'STEP_UP_FAILURE',
      userId: req.auth.userId,
      username: req.auth.username,
      metadata: { reason: 'invalid_credentials' }
    });
    return sendError(res, req, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  const now = Date.now();
  const sessionAbsolute = new Date(req.session.auth.expiresAt).getTime();
  const sessionIdle = new Date(req.session.auth.idleExpiresAt).getTime();
  const requestedValidUntil = now + config.auth.stepUpTtlMinutes * 60 * 1000;
  const validUntil = new Date(Math.min(requestedValidUntil, sessionAbsolute, sessionIdle));
  const stepUpToken = `stp_${randomUUID().replace(/-/g, '')}`;

  req.session.auth.stepUpProof = {
    token: stepUpToken,
    action,
    validUntil: validUntil.toISOString(),
    issuedAt: new Date(now).toISOString()
  };

  await logAuthEvent({
    req,
    eventType: 'STEP_UP_SUCCESS',
    userId: req.auth.userId,
    username: req.auth.username,
    metadata: { validUntil: validUntil.toISOString(), action }
  });

  await logAuditEvent({
    actorId: req.auth.userId,
    action: 'STEP_UP_VERIFIED',
    entityType: 'session',
    entityId: req.session.id,
    metadata: { validUntil: validUntil.toISOString(), action }
  });

  return res.status(200).json({
    data: {
      stepUpToken,
      action,
      validUntil: validUntil.toISOString()
    }
  });
});

module.exports = router;
