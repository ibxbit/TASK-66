const User = require('../models/user');
const config = require('../config');
const { sendError } = require('../lib/http');

const getSessionAuth = (req) => req.session?.auth;

const requireAuth = async (req, res, next) => {
  const auth = getSessionAuth(req);
  if (!auth?.userId) {
    return sendError(res, req, 401, 'UNAUTHENTICATED', 'Authentication required');
  }

  const now = Date.now();
  const idleExpires = new Date(auth.idleExpiresAt).getTime();
  const absoluteExpires = new Date(auth.expiresAt).getTime();

  if (Number.isNaN(idleExpires) || Number.isNaN(absoluteExpires) || now > idleExpires || now > absoluteExpires) {
    req.session.destroy(() => {});
    res.clearCookie(config.session.cookieName);
    return sendError(res, req, 401, 'SESSION_EXPIRED', 'Session expired');
  }

  const user = await User.findById(auth.userId).lean();
  if (!user || user.status !== 'ACTIVE') {
    req.session.destroy(() => {});
    res.clearCookie(config.session.cookieName);
    return sendError(res, req, 401, 'UNAUTHENTICATED', 'Authentication required');
  }

  const nextIdle = new Date(now + config.session.idleTtlSeconds * 1000);
  req.session.auth.idleExpiresAt = nextIdle.toISOString();
  req.session.cookie.maxAge = config.session.idleTtlSeconds * 1000;

  const stepUpProof = req.session.auth.stepUpProof || null;

  req.auth = {
    userId: String(user._id),
    username: user.username,
    roles: user.roles,
    sessionId: req.session.id,
    idleExpiresAt: req.session.auth.idleExpiresAt,
    stepUpValidUntil: stepUpProof?.validUntil || null,
    stepUpAction: stepUpProof?.action || null
  };

  return next();
};

const optionalAuth = async (req, res, next) => {
  const auth = getSessionAuth(req);
  if (!auth?.userId) {
    return next();
  }

  const now = Date.now();
  const idleExpires = new Date(auth.idleExpiresAt).getTime();
  const absoluteExpires = new Date(auth.expiresAt).getTime();

  if (Number.isNaN(idleExpires) || Number.isNaN(absoluteExpires) || now > idleExpires || now > absoluteExpires) {
    return next();
  }

  const user = await User.findById(auth.userId).lean();
  if (!user || user.status !== 'ACTIVE') {
    return next();
  }

  const nextIdle = new Date(now + config.session.idleTtlSeconds * 1000);
  req.session.auth.idleExpiresAt = nextIdle.toISOString();
  req.session.cookie.maxAge = config.session.idleTtlSeconds * 1000;

  const stepUpProof = req.session.auth.stepUpProof || null;

  req.auth = {
    userId: String(user._id),
    username: user.username,
    roles: user.roles,
    sessionId: req.session.id,
    idleExpiresAt: req.session.auth.idleExpiresAt,
    stepUpValidUntil: stepUpProof?.validUntil || null,
    stepUpAction: stepUpProof?.action || null
  };

  return next();
};

const requireCsrf = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const originalPath = String(req.originalUrl || '').split('?')[0];
  if (req.path === '/auth/login' || req.path === '/api/v1/auth/login' || originalPath === '/api/v1/auth/login') {
    return next();
  }

  const csrfHeader = req.get('X-CSRF-Token');
  const csrfSession = req.session?.auth?.csrfToken;
  if (!csrfHeader || !csrfSession || csrfHeader !== csrfSession) {
    return sendError(res, req, 403, 'CSRF_TOKEN_INVALID', 'Valid X-CSRF-Token required');
  }

  return next();
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireCsrf
};
