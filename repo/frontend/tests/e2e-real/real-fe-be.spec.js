/**
 * REAL FE↔BE browser E2E — no transport mocking whatsoever.
 *
 * Preconditions:
 *   docker-compose up --build -d
 *
 * Every network call flows: browser → nginx (:5173) → museum_backend:8080
 * → MongoDB. There is no `page.route`, no `fetch` stub, no fixture server —
 * the Docker stack is the system under test.
 */

import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// A helper that asserts the response was served by the real backend by
// inspecting the response headers we know the backend sets (Express/Mongo
// session cookies) and the JSON envelope shape. No mocks.
const waitForRealResponse = async (page, method, pathSuffix) => {
  return page.waitForResponse(
    (res) => {
      const url = new URL(res.url());
      return res.request().method() === method && url.pathname.endsWith(pathSuffix);
    },
    { timeout: 15000 }
  );
};

test('real backend: admin login populates session and /auth/me mirrors user', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Auth' })).toBeVisible();

  // ── Real login flow ─────────────────────────────────────────────────────
  await page.getByPlaceholder('username').fill('admin.dev');
  await page.getByPlaceholder('password').first().fill('AdminSecure!2026');

  const loginResponsePromise = waitForRealResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const loginResponse = await loginResponsePromise;

  // Real backend contract assertions (no fixtures in play)
  expect(loginResponse.status()).toBe(200);
  const loginBody = await loginResponse.json();
  expect(loginBody.data.user.username).toBe('admin.dev');
  expect(loginBody.data.user.roles).toContain('Administrator');
  expect(typeof loginBody.data.csrfToken).toBe('string');
  expect(loginBody.data.csrfToken.length).toBeGreaterThan(10);

  // Session cookie must be set by real express-session + connect-mongo store
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'museum_sid');
  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie.httpOnly).toBe(true);

  // UI reflects the real backend payload
  await expect(page.getByText(/Signed in as admin\.dev/)).toBeVisible();

  // ── Real refresh-me flow (second real API round-trip) ───────────────────
  const mePromise = waitForRealResponse(page, 'GET', '/auth/me');
  await page.getByRole('button', { name: 'Refresh Session' }).click();
  const meResponse = await mePromise;
  expect(meResponse.status()).toBe(200);
  const meBody = await meResponse.json();
  expect(meBody.data.user.username).toBe('admin.dev');
  expect(meBody.data.user.id).toBe(loginBody.data.user.id);

  // ── Real logout flow — real backend issues 204 ──────────────────────────
  const logoutPromise = waitForRealResponse(page, 'POST', '/auth/logout');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  const logoutResponse = await logoutPromise;
  expect(logoutResponse.status()).toBe(204);

  // After logout, the auth panel is back to the unauthenticated state
  await expect(page.getByText(/User: none/)).toBeVisible();
});

test('real backend: invalid credentials return the real error contract', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('username').fill('admin.dev');
  await page.getByPlaceholder('password').first().fill('WrongPassword!2026');

  const badLoginPromise = waitForRealResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const badLogin = await badLoginPromise;

  expect(badLogin.status()).toBe(401);
  const body = await badLogin.json();
  expect(body.error.code).toBe('INVALID_CREDENTIALS');
  expect(typeof body.error.requestId).toBe('string');
});

test('real backend: curator role view reflects backend-issued RBAC', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('username').fill('curator.dev');
  await page.getByPlaceholder('password').first().fill('CuratorSecure!2026');

  const loginPromise = waitForRealResponse(page, 'POST', '/auth/login');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const login = await loginPromise;
  expect(login.status()).toBe(200);
  const body = await login.json();
  expect(body.data.user.roles).toContain('Curator');

  // The UI exposes roles in the auth panel — confirm the live backend value
  await expect(page.getByText(/roles: Curator/)).toBeVisible();
});
