import { expect, test } from '@playwright/test';

test('user switch does not show stale cross-user data', async ({ page }) => {
  let currentUser = null;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/auth/login')) {
      const body = request.postDataJSON();
      if (body.username === 'curator.dev') {
        currentUser = 'curator';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              user: { id: 'user-a', username: 'curator.dev', roles: ['Curator'] },
              csrfToken: 'csrf-a'
            }
          })
        });
        return;
      }

      if (body.username === 'employer.dev') {
        currentUser = 'employer';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              user: { id: 'user-b', username: 'employer.dev', roles: ['Employer'] },
              csrfToken: 'csrf-b'
            }
          })
        });
        return;
      }
    }

    if (url.pathname.endsWith('/auth/logout')) {
      currentUser = null;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.endsWith('/catalog/search')) {
      const isCurator = currentUser === 'curator';
      const artifact = isCurator ? 'A-only artifact' : 'B-only artifact';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ title: artifact }]
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} })
    });
  });

  await page.goto('/');

  await page.getByPlaceholder('username').fill('curator.dev');
  await page.getByPlaceholder('password').first().fill('CuratorSecure!2026');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('Signed in as curator.dev')).toBeVisible();

  await page.getByPlaceholder('title').fill('bird');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await expect(page.getByText('A-only artifact')).toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByText('Signed out')).toBeVisible();
  await expect(page.getByText('Allowed tabs: none')).toBeVisible();

  await page.getByPlaceholder('username').fill('employer.dev');
  await page.getByPlaceholder('password').first().fill('EmployerSecure!2026');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('Signed in as employer.dev')).toBeVisible();

  await page.getByPlaceholder('title').fill('bird');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await expect(page.getByText('B-only artifact')).toBeVisible();
  await expect(page.getByText('A-only artifact')).toHaveCount(0);

  expect(await page.evaluate(() => localStorage.getItem('museum_csrf'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('museum_stepup'))).toBeNull();
});
