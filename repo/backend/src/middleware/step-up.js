const { sendError } = require('../lib/http');

const requireStepUp = (expectedAction) => (req, res, next) => {
  const token = req.get('X-Step-Up-Token');
  const proof = req.session?.auth?.stepUpProof;

  if (!token || !proof?.validUntil || !proof?.token || !proof?.action) {
    return sendError(res, req, 403, 'STEP_UP_REQUIRED', 'Valid step-up token required');
  }

  const now = Date.now();
  const expiry = new Date(proof.validUntil).getTime();
  if (token !== proof.token || Number.isNaN(expiry) || now > expiry) {
    return sendError(res, req, 403, 'STEP_UP_REQUIRED', 'Valid step-up token required');
  }

  if (expectedAction && proof.action !== expectedAction) {
    return sendError(res, req, 403, 'STEP_UP_REQUIRED', 'Valid step-up token required');
  }

  req.session.auth.stepUpProof = null;

  return next();
};

module.exports = {
  requireStepUp
};
