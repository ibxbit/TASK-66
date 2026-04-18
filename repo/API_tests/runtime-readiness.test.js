const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startBackend = (port, mongoUri) => {
  const backendRoot = path.resolve(__dirname, '..', 'backend');
  const child = spawn('node', ['src/server.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      SESSION_COOKIE_SECURE: 'false',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      MONGO_URI: mongoUri
    },
    stdio: 'ignore'
  });

  return child;
};

// Cold-boot of a second Node process with bind-mounted node_modules on
// Docker Desktop for Windows takes ~10–40s (many file-stat syscalls per
// require). Keep the host path fast while tolerating the containerized
// path via an override.
const DEFAULT_HEALTH_WAIT_MS =
  Number(process.env.RUNTIME_READINESS_HEALTH_WAIT_MS) || 60000;

const waitForHealth = async (baseUrl, timeoutMs = DEFAULT_HEALTH_WAIT_MS) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      // keep waiting for process boot
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for health endpoint at ${baseUrl}/health`);
};

const stopBackend = async (child) => {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 3000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

const UNREACHABLE_MONGO_URI =
  'mongodb://museum_user:museum_pass@127.0.0.1:29999/museum_ops?authSource=admin';

test('health endpoint stays reachable and reports db disconnected status', { concurrency: false }, async () => {
  const port = 19081;
  const baseUrl = `http://localhost:${port}/api/v1`;
  const backend = startBackend(port, UNREACHABLE_MONGO_URI);

  try {
    const response = await waitForHealth(baseUrl);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, 'degraded');
    assert.equal(payload.data.db.ready, false);
    assert.equal(payload.data.db.connected, false);
  } finally {
    await stopBackend(backend);
  }
});

test('db-dependent endpoint returns graceful 503 when db not ready', { concurrency: false }, async () => {
  const port = 19082;
  const baseUrl = `http://localhost:${port}/api/v1`;
  const backend = startBackend(port, UNREACHABLE_MONGO_URI);

  try {
    await waitForHealth(baseUrl);

    const response = await fetch(`${baseUrl}/catalog/search?q=air&page=1&pageSize=5`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.error.code, 'SERVICE_UNAVAILABLE');
  } finally {
    await stopBackend(backend);
  }
});

test('scheduler does not crash process while db is unavailable', { concurrency: false }, async () => {
  const port = 19083;
  const baseUrl = `http://localhost:${port}/api/v1`;
  const backend = startBackend(port, UNREACHABLE_MONGO_URI);

  try {
    await waitForHealth(baseUrl);
    await sleep(12000);

    assert.equal(backend.exitCode, null, 'Backend process should still be alive with unavailable DB');
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
  } finally {
    await stopBackend(backend);
  }
});
