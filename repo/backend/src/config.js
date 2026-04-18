const dotenv = require('dotenv');

dotenv.config();

const toBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
};

const splitCsv = (value) =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toTruthyBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  const normalized = String(value).toLowerCase().trim();
  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'change-me-in-production';

if (isProduction) {
  const weakSecrets = new Set(['change-me-in-production', 'changeme', 'default', 'secret']);
  if (!sessionSecret || sessionSecret.length < 24 || weakSecrets.has(sessionSecret.toLowerCase())) {
    throw new Error('SESSION_SECRET must be set to a strong non-default value in production');
  }
}

module.exports = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 8080),
  mongoUri:
    process.env.MONGO_URI ||
    'mongodb://museum_user:museum_pass@localhost:27017/museum_ops?authSource=admin',
  frontendOrigins: splitCsv(process.env.FRONTEND_ORIGIN || 'http://localhost:5173'),
  search: {
    cacheTtlSeconds: Number(process.env.SEARCH_CACHE_TTL_SECONDS || 600)
  },
  operations: {
    waitlistPromotionExpiryMinutes: Number(process.env.WAITLIST_PROMOTION_EXPIRY_MINUTES || 60),
    inboxRetentionDays: Number(process.env.INBOX_RETENTION_DAYS || 90)
  },
  reporting: {
    scheduleTimezone: process.env.REPORT_SCHEDULE_TIMEZONE || 'America/New_York',
    scheduleTime: process.env.REPORT_SCHEDULE_TIME || '02:00',
    reconciliationDir: process.env.RECONCILIATION_DIR || '/app/reconciliation'
  },
  docs: {
    enableSwagger: toTruthyBoolean(process.env.ENABLE_SWAGGER, false)
  },
  auth: {
    minPasswordLength: Number(process.env.MIN_PASSWORD_LENGTH || 12),
    maxFailedAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5),
    lockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 15),
    failedWindowMinutes: Number(process.env.FAILED_LOGIN_WINDOW_MINUTES || 15),
    stepUpTtlMinutes: Number(process.env.STEP_UP_TTL_MINUTES || 10)
  },
  session: {
    secret: sessionSecret,
    idleTtlSeconds: Number(process.env.SESSION_IDLE_TTL_SECONDS || 1800),
    absoluteTtlSeconds: Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS || 43200),
    cookieName: process.env.SESSION_COOKIE_NAME || 'museum_sid',
    secure: toBoolean(process.env.SESSION_COOKIE_SECURE, false),
    sameSite: process.env.SESSION_COOKIE_SAME_SITE || 'lax'
  },
  development: {
    enableDevSeed:
      toBoolean(process.env.ENABLE_DEV_SEED, false) &&
      (process.env.NODE_ENV || 'development') !== 'production'
  }
};
