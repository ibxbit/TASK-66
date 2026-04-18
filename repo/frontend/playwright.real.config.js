// Playwright config for REAL FE↔BE browser E2E against the live Docker stack.
// No webServer is started — the docker-compose frontend/backend/mongo must be
// running (docker-compose up --build -d) before invoking this suite.
//
// The suite under tests/e2e-real/ does NOT use page.route or any transport
// mocking. Every network request goes: browser → nginx (5173) → backend
// (8888 internal 8080) → MongoDB.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-real',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.REAL_FRONTEND_URL || 'http://localhost:5173',
    // Service workers are allowed in this real path (it matches production
    // browser behavior against the nginx-served bundle).
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  }
  // Intentionally no webServer: the Docker stack is the server under test.
});
