import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: () => 'application/json'
  },
  json: async () => payload
});

describe('Export and audit sequential failure UX', () => {
  it('shows step-up failure then recovers on retry for export flow', async () => {
    const user = userEvent.setup();
    let stepUpCallCount = 0;

    const fetchMock = vi.fn(async (input, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      const raw = typeof input === 'string' ? input : String(input);
      const url = new URL(raw, 'http://localhost');
      const path = url.pathname.replace('/api/v1', '');

      if (path === '/auth/login' && method === 'POST') {
        return jsonResponse(200, {
          data: {
            user: { id: 'user-admin', username: 'admin.dev', roles: ['Administrator'] },
            csrfToken: 'csrf-admin'
          }
        });
      }

      if (path === '/auth/step-up' && method === 'POST') {
        stepUpCallCount++;
        if (stepUpCallCount === 1) {
          return jsonResponse(401, {
            error: { code: 'INVALID_PASSWORD', message: 'Step-up password incorrect' }
          });
        }
        return jsonResponse(200, {
          data: {
            stepUpToken: 'stp-retry',
            action: 'EXPORT_CREATE',
            validUntil: '2027-01-01T00:00:00.000Z'
          }
        });
      }

      if (path === '/exports' && method === 'POST') {
        return jsonResponse(202, { data: { exportJobId: 'exp_fail_1', status: 'QUEUED' } });
      }

      if (path === '/exports/exp_fail_1' && method === 'GET') {
        return jsonResponse(200, {
          data: {
            exportJobId: 'exp_fail_1',
            status: 'COMPLETED',
            artifactPath: 'exports/exp_fail_1.csv',
            checksumSha256: 'abc123',
            maskingPreview: [{ field: 'phone', rule: 'last4' }]
          }
        });
      }

      if (path === '/auth/logout' && method === 'POST') {
        return jsonResponse(204, {});
      }

      return jsonResponse(200, { data: {} });
    });

    global.fetch = fetchMock;

    render(<App />);

    await user.type(screen.getByPlaceholderText('username'), 'admin.dev');
    await user.type(screen.getByPlaceholderText('password'), 'AdminSecure!2026');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Signed in as admin.dev')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Exports' }));

    await user.click(screen.getByRole('button', { name: 'Request Export (Step-Up)' }));
    await waitFor(() => {
      expect(screen.getByText(/Step-up password incorrect|Enter step-up password/)).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText('step-up password'), 'AdminSecure!2026');
    await user.click(screen.getByRole('button', { name: 'Request Export (Step-Up)' }));
    await waitFor(() => {
      expect(screen.getByText(/exp_fail_1/)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Refresh Job Status' }));
    await waitFor(() => {
      expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0);
    });
  }, 15000);

  it('shows error for audit load failure and recovers on retry', async () => {
    const user = userEvent.setup();
    let auditCallCount = 0;

    const fetchMock = vi.fn(async (input, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      const raw = typeof input === 'string' ? input : String(input);
      const url = new URL(raw, 'http://localhost');
      const path = url.pathname.replace('/api/v1', '');

      if (path === '/auth/login' && method === 'POST') {
        return jsonResponse(200, {
          data: {
            user: { id: 'user-auditor', username: 'auditor.dev', roles: ['Auditor'] },
            csrfToken: 'csrf-auditor'
          }
        });
      }

      if (path === '/audit/events' && method === 'GET') {
        auditCallCount++;
        if (auditCallCount === 1) {
          return jsonResponse(500, {
            error: { code: 'INTERNAL_ERROR', message: 'Database connection lost' }
          });
        }
        return jsonResponse(200, {
          data: [
            {
              id: 'aud_retry_1',
              actorId: 'user-admin',
              action: 'EXPORT_REQUESTED',
              entityType: 'export_job',
              entityId: 'exp_1',
              createdAt: '2026-04-01T10:00:00.000Z',
              metadata: {}
            }
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
        });
      }

      if (path === '/auth/logout' && method === 'POST') {
        return jsonResponse(204, {});
      }

      return jsonResponse(200, { data: {} });
    });

    global.fetch = fetchMock;

    render(<App />);

    await user.type(screen.getByPlaceholderText('username'), 'auditor.dev');
    await user.type(screen.getByPlaceholderText('password'), 'AuditorSecure!2026');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Signed in as auditor.dev')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Audit' }));
    await user.click(screen.getByRole('button', { name: 'Load Audit Events' }));
    await waitFor(() => {
      expect(screen.getByText(/Database connection lost/)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Load Audit Events' }));
    await waitFor(() => {
      expect(screen.getByText('EXPORT_REQUESTED')).toBeTruthy();
    });
  }, 15000);
});
