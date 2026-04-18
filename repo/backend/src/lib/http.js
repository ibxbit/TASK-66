const { randomUUID } = require('crypto');

const requestIdMiddleware = (req, res, next) => {
  req.requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  next();
};

const errorEnvelope = (req, code, message, details) => ({
  error: {
    code,
    message,
    ...(details ? { details } : {}),
    requestId: req.requestId
  }
});

const sendError = (res, req, status, code, message, details) => {
  if (!res.locals) {
    res.locals = {};
  }
  res.locals.errorCode = code;
  res.status(status).json(errorEnvelope(req, code, message, details));
};

module.exports = {
  requestIdMiddleware,
  sendError
};
