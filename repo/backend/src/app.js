require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { dbState, mongoose, isDbReady } = require('./db');
const config = require('./config');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const catalogRoutes = require('./routes/catalog');
const graphRoutes = require('./routes/graph');
const venuesRoutes = require('./routes/venues');
const programsRoutes = require('./routes/programs');
const inboxRoutes = require('./routes/inbox');
const jobsRoutes = require('./routes/jobs');
const analyticsRoutes = require('./routes/analytics');
const exportsRoutes = require('./routes/exports');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');
const { requestIdMiddleware, sendError } = require('./lib/http');
const { requireCsrf } = require('./middleware/auth');
const { requireDatabaseReady } = require('./middleware/db-ready');
const { logInfo, logError } = require('./lib/logger');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(requestIdMiddleware);
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const routePath = req.route?.path || req.path;
    const actorId = req.auth?.userId || req.session?.auth?.userId || null;
    const outcome = res.statusCode >= 400 ? 'error' : 'success';
    logInfo('http_request', {
      requestId: req.requestId,
      route: routePath,
      method: req.method,
      actorId,
      action: `${req.method} ${routePath}`,
      outcome,
      errorCode: res.locals.errorCode || null,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
});
app.use(express.json());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true
  })
);

app.get('/api/v1/health', (req, res) => {
  const ready = isDbReady();
  res.status(200).json({
    data: {
      status: ready ? 'ok' : 'degraded',
      service: 'backend',
      sessionCookie: {
        name: config.session.cookieName,
        httpOnly: true,
        secure: config.session.secure,
        sameSite: config.session.sameSite,
        idleTtlSeconds: config.session.idleTtlSeconds,
        absoluteTtlSeconds: config.session.absoluteTtlSeconds
      },
      db: {
        ready,
        connected: dbState.connected,
        readyState: mongoose.connection.readyState,
        lastError: dbState.lastError
      }
    }
  });
});

if (!config.isProduction || config.docs.enableSwagger) {
  app.get('/api/v1/docs/openapi.yaml', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'openapi.yaml'));
  });

  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(null, {
      swaggerOptions: {
        url: '/api/v1/docs/openapi.yaml'
      }
    })
  );
} else {
  app.use('/api/v1/docs', (req, res) => {
    return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
  });
}

app.use('/api/v1', requireDatabaseReady);

app.use(
  '/api/v1',
  session({
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl: config.mongoUri,
      collectionName: 'sessions',
      ttl: config.session.absoluteTtlSeconds,
      autoRemove: 'native'
    }),
    cookie: {
      httpOnly: true,
      secure: config.session.secure,
      sameSite: config.session.sameSite,
      maxAge: config.session.idleTtlSeconds * 1000
    }
  })
);

app.use('/api/v1', requireCsrf);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/graph', graphRoutes);
app.use('/api/v1', venuesRoutes);
app.use('/api/v1', programsRoutes);
app.use('/api/v1/inbox', inboxRoutes);
app.use('/api/v1/jobs', jobsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/exports', exportsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/audit', auditRoutes);

app.use((error, req, res, next) => {
  if (error.code === 11000) {
    return sendError(res, req, 409, 'CONFLICT', 'Resource already exists');
  }

  if (error.message === 'Origin not allowed by CORS') {
    return sendError(res, req, 403, 'CORS_ORIGIN_DENIED', error.message);
  }

  if (error.message === 'Audit logs are immutable') {
    return sendError(res, req, 403, 'IMMUTABLE_RESOURCE', error.message);
  }

  console.error('[CRITICAL] Global Error Handler:', error);
  logError('request_failure', {
    requestId: req.requestId,
    route: req.route?.path || req.path,
    method: req.method,
    actorId: req.auth?.userId || req.session?.auth?.userId || null,
    action: `${req.method} ${req.route?.path || req.path}`,
    outcome: 'error',
    errorCode: 'INTERNAL_ERROR',
    error
  });
  return sendError(res, req, 500, 'INTERNAL_ERROR', 'Unexpected server error');
});

app.use((req, res) => {
  sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
});

module.exports = app;
