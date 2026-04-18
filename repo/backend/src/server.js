const app = require('./app');
const config = require('./config');
const { connectWithRetry, mongoose } = require('./db');
const { startReportScheduler } = require('./services/reports');
const { logInfo, logError } = require('./lib/logger');

const maybeAutoSeed = async () => {
  if (!config.development.enableDevSeed) {
    return;
  }
  try {
    const { seedDevUsersIntoConnectedDb } = require('./scripts/seed-dev-users');
    const results = await seedDevUsersIntoConnectedDb();
    logInfo('startup', {
      message: 'Dev users auto-seeded on startup',
      count: results.length,
      usernames: results.map((u) => u.username)
    });
  } catch (error) {
    logError('startup', { message: 'Dev user auto-seed failed', error });
  }
};

const start = async () => {
  app.listen(config.port, () => {
    logInfo('startup', { message: `Backend listening on port ${config.port}` });
  });

  connectWithRetry(config.mongoUri);

  // Seed on first successful connect when ENABLE_DEV_SEED=true; safe idempotent upsert.
  let seeded = false;
  mongoose.connection.on('connected', () => {
    if (seeded) return;
    seeded = true;
    maybeAutoSeed().catch((error) => {
      logError('startup', { message: 'Unexpected auto-seed error', error });
    });
  });

  startReportScheduler().catch((error) => {
    logError('startup', { message: 'Report scheduler failed to initialize', error });
  });
};

start().catch((error) => {
  logError('startup', { message: 'Fatal startup error', error });
  process.exit(1);
});
