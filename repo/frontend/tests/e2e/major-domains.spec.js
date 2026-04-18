import { expect, test } from '@playwright/test';

const loginPayloadByUser = {
  'curator.dev': { id: 'user-curator', username: 'curator.dev', roles: ['Curator'] },
  'manager.dev': { id: 'user-manager', username: 'manager.dev', roles: ['Exhibit Manager'] },
  'coordinator.dev': { id: 'user-coord', username: 'coordinator.dev', roles: ['Program Coordinator'] },
  'admin.dev': { id: 'user-admin', username: 'admin.dev', roles: ['Administrator'] },
  'employer.dev': { id: 'user-employer', username: 'employer.dev', roles: ['Employer'] },
  'reviewer.dev': { id: 'user-reviewer', username: 'reviewer.dev', roles: ['Reviewer'] }
};

const setupCommonAuthRoutes = async (page) => {
  let currentUser = null;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/auth/login')) {
      const body = request.postDataJSON();
      const user = loginPayloadByUser[body.username] || loginPayloadByUser['employer.dev'];
      currentUser = user;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            user,
            csrfToken: `csrf-${user.id}`
          }
        })
      });
      return;
    }

    if (url.pathname.endsWith('/auth/logout')) {
      currentUser = null;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.endsWith('/auth/step-up')) {
      const body = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            stepUpToken: `stp-${body.action}`,
            action: body.action,
            validUntil: '2027-01-01T00:00:00.000Z'
          }
        })
      });
      return;
    }

    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({
        status: currentUser ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(currentUser ? { data: { user: currentUser } } : { error: { message: 'not-authenticated' } })
      });
      return;
    }

    await route.fallback();
  });
};

const signIn = async (page, username, password) => {
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').first().fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
};

test('unauthorized hash access shows forbidden panel', async ({ page }) => {
  await setupCommonAuthRoutes(page);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/catalog/hot-keywords')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    if (url.pathname.endsWith('/catalog/search')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }) });
      return;
    }

    await route.fallback();
  });

  await page.goto('/#curator');
  await signIn(page, 'employer.dev', 'EmployerSecure!2026');

  await expect(page.getByText('Curator Administration')).toBeVisible();
  await expect(page.getByText(/Forbidden: insufficient permission/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Draft' })).toHaveCount(0);
});

test('search happy path', async ({ page }) => {
  await setupCommonAuthRoutes(page);
  await page.route('**/api/v1/catalog/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'itm_1',
            title: 'Blue Airmail 1930',
            catalogNumber: 'CAT-1930',
            artist: 'I. Kline',
            series: 'Sky',
            period: '1930',
            category: 'Airmail',
            tags: ['blue']
          }
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
      })
    });
  });
  await page.route('**/api/v1/catalog/hot-keywords', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.goto('/');
  await signIn(page, 'curator.dev', 'CuratorSecure!2026');

  await page.getByPlaceholder('title').fill('Blue');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await expect(page.getByText('Blue Airmail 1930')).toBeVisible();
});

test('graph publish happy path', async ({ page }) => {
  await setupCommonAuthRoutes(page);

  await page.route('**/api/v1/graph/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/graph/drafts') && request.method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { draftId: 'gdr_1' } }) });
      return;
    }

    if (url.pathname.endsWith('/graph/drafts/gdr_1') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            draftId: 'gdr_1',
            snapshot: {
              nodes: [
                { node_id: 'n_1', type: 'STAMP', label: 'Blue Airmail' },
                { node_id: 'n_2', type: 'ARTIST', label: 'I. Kline' }
              ],
              edges: [
                { edge_id: 'e_1', from_node_id: 'n_1', to_node_id: 'n_2', relation_type: 'INFLUENCED_BY', weight: 80, constraints: {} }
              ]
            },
            validation: { status: 'VALID', issues: [] }
          }
        })
      });
      return;
    }

    if (url.pathname.endsWith('/graph/drafts/gdr_1/publish')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { version: 1 } }) });
      return;
    }

    if (url.pathname.endsWith('/graph/drafts/gdr_1/validate')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { status: 'VALID', issues: [] } }) });
      return;
    }

    if (url.pathname.includes('/graph/drafts/gdr_1/nodes') || url.pathname.includes('/graph/drafts/gdr_1/edges')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
      return;
    }

    await route.fallback();
  });
  await page.route('**/api/v1/catalog/hot-keywords', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.goto('/');
  await signIn(page, 'curator.dev', 'CuratorSecure!2026');
  await page.getByRole('button', { name: 'Curator Admin' }).click();
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await page.getByPlaceholder('step-up password').fill('CuratorSecure!2026');
  await page.getByRole('button', { name: 'Publish (Step-Up)' }).click();
  await expect(page.getByText('Graph published as version 1')).toBeVisible();
});

test('route itinerary happy path', async ({ page }) => {
  await setupCommonAuthRoutes(page);
  let caseCounter = 0;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/venues') && request.method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'v1' } }) });
      return;
    }
    if (url.pathname.endsWith('/venues/v1/halls')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'h1' } }) });
      return;
    }
    if (url.pathname.endsWith('/halls/h1/zones')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'z1' } }) });
      return;
    }
    if (url.pathname.endsWith('/routes') && request.method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { routeId: 'rte_1' } }) });
      return;
    }
    if (url.pathname.endsWith('/zones/z1/display-cases')) {
      caseCounter += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: `case_${caseCounter}`, name: `Case ${caseCounter}` } }) });
      return;
    }
    if (url.pathname.endsWith('/routes/rte_1/segments')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { ok: true } }) });
      return;
    }
    if (url.pathname.endsWith('/routes/rte_1/itineraries')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            estimatedWalkMinutes: 9.2,
            printable: {
              estimatedWalkMinutes: 9.2,
              steps: [
                { step: 1, segmentType: 'REQUIRED_NEXT', fromCaseId: 'case_1', toCaseId: 'case_2', distanceMeters: 40, dwellMinutes: 4 }
              ]
            }
          }
        })
      });
      return;
    }

    if (url.pathname.endsWith('/catalog/hot-keywords')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }

    await route.fallback();
  });

  await page.goto('/');
  await signIn(page, 'manager.dev', 'ManagerSecure!2026');

  await page.getByRole('button', { name: 'Route Builder' }).click();
  await page.getByRole('button', { name: 'Create Hierarchy + Route' }).click();
  await page.getByRole('button', { name: 'Add Case Node' }).click();
  await page.getByRole('button', { name: 'Add Case Node' }).click();

  const segmentEditor = page.locator('section.route-block', { hasText: '4) Segment Editor' });
  await expect(segmentEditor.locator('option[value="case_1"]')).toHaveCount(2);
  await expect(segmentEditor.locator('option[value="case_2"]')).toHaveCount(2);
  await segmentEditor.locator('select').nth(0).selectOption('case_1');
  await segmentEditor.locator('select').nth(1).selectOption('case_2');
  await page.getByRole('button', { name: 'Add Segment' }).click();
  await page.getByRole('button', { name: 'Commit Segments To API' }).click();
  await page.getByRole('button', { name: 'Generate Itinerary' }).click();

  await expect(page.getByText('Estimated walk time: 9.2 minutes')).toBeVisible();
});

test('program scheduling happy path', async ({ page }) => {
  await setupCommonAuthRoutes(page);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/programs')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'prog_1', title: 'Docent Basics', type: 'DOCENT_TRAINING', capacity: 2 } }) });
      return;
    }
    if (url.pathname.endsWith('/coaches')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'coach_1', name: 'Coach Rivera' } }) });
      return;
    }
    if (url.pathname.endsWith('/coaches/coach_1/availability')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'avail_1' } }) });
      return;
    }
    if (url.pathname.endsWith('/program-sessions')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'session_1', capacity: 2 } }) });
      return;
    }
    if (url.pathname.endsWith('/program-sessions/session_1/registrations')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { registrationId: 'reg_1', status: 'REGISTERED' } }) });
      return;
    }
    if (url.pathname.endsWith('/catalog/hot-keywords')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }

    await route.fallback();
  });

  await page.goto('/');
  await signIn(page, 'coordinator.dev', 'CoordinatorSecure!2026');
  await page.getByRole('button', { name: 'Programs' }).click();
  await page.getByRole('button', { name: 'Create Program' }).click();
  await page.getByRole('button', { name: 'Create Coach' }).click();
  await page.getByRole('button', { name: 'Save Availability' }).click();
  await page.getByRole('button', { name: 'Create Session' }).click();
  await page.getByRole('button', { name: 'Register Participant' }).click();
  await expect(page.getByRole('cell', { name: 'REGISTERED' })).toBeVisible();
});

test('staffing approval happy path', async ({ page }) => {
  await setupCommonAuthRoutes(page);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/jobs') && request.method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { jobId: 'job_1', state: 'DRAFT' } }) });
      return;
    }
    if (url.pathname.endsWith('/jobs/job_1/submit')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { jobId: 'job_1', state: 'PENDING_APPROVAL' } }) });
      return;
    }
    if (url.pathname.endsWith('/jobs/job_1/approve')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { jobId: 'job_1', state: 'PUBLISHED' } }) });
      return;
    }
    if (url.pathname.endsWith('/catalog/hot-keywords')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }

    await route.fallback();
  });

  await page.goto('/');
  await signIn(page, 'admin.dev', 'AdminSecure!2026');
  await page.getByRole('button', { name: 'Staffing' }).click();
  await page.getByRole('button', { name: 'Create Draft' }).click();

  const workflowSection = page.locator('section.route-block', { hasText: 'Workflow Actions' });
  const jobSelect = workflowSection.locator('select').filter({ hasText: 'Select job' });
  await expect(jobSelect.locator('option[value="job_1"]')).toHaveCount(1);
  await jobSelect.selectOption('job_1');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByPlaceholder('step-up password').fill('AdminSecure!2026');
  await page.getByRole('button', { name: 'Approve (Step-Up)' }).click();
  await expect(page.getByText('Job approved and published')).toBeVisible();
});

test('reviewer role has access to search, navigation, staffing, inbox but not curator or exports', async ({ page }) => {
  await setupCommonAuthRoutes(page);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/catalog/search')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'itm_rv_1', title: 'Reviewed Stamp', catalogNumber: 'RV-1', artist: 'Reviewer', series: 'Check', period: '1950' }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
        })
      });
      return;
    }
    if (url.pathname.endsWith('/catalog/hot-keywords')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    if (url.pathname.includes('/inbox/messages')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'msg_rv', type: 'SYSTEM', title: 'Review Notice', body: 'Review pending', createdAt: '2026-04-01T10:00:00.000Z', readAt: null }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
        })
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/');
  await signIn(page, 'reviewer.dev', 'ReviewerSecure!2026');

  const curatorBtn = page.getByRole('button', { name: 'Curator Admin' });
  await expect(curatorBtn).toBeDisabled();

  const exportsBtn = page.getByRole('button', { name: 'Exports' });
  await expect(exportsBtn).toBeDisabled();

  await page.getByPlaceholder('title').fill('stamp');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await expect(page.getByText('Reviewed Stamp')).toBeVisible();

  await page.getByRole('button', { name: 'Inbox' }).click();
  await page.getByRole('button', { name: 'Load Inbox' }).click();
  await expect(page.getByText('Review Notice')).toBeVisible();

  await page.getByRole('button', { name: 'Staffing' }).click();
  await expect(page.getByText('Staffing Governance')).toBeVisible();
});
