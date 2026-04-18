const { dbState, mongoose, isDbReady } = require('../db');
const { sendError } = require('../lib/http');

const requireDatabaseReady = (req, res, next) => {
  if (isDbReady()) {
    return next();
  }

  return sendError(
    res,
    req,
    503,
    'SERVICE_UNAVAILABLE',
    'Database is not ready. Retry shortly.',
    {
      service: 'mongodb',
      connected: dbState.connected,
      readyState: mongoose.connection.readyState,
      lastError: dbState.lastError
    }
  );
};

module.exports = {
  requireDatabaseReady
};
