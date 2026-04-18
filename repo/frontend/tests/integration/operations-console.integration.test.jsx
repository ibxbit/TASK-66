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

describe('Operations console structured workflows', () => {
  it('uses step-based analytics, exports, inbox, and audit UX', async () => {
    const user = userEvent.setup();

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
        return jsonResponse(200, {
          data: {
            stepUpToken: 'stp-export',
            action: 'EXPORT_CREATE',
            validUntil: '2027-01-01T00:00:00.000Z'
          }
        });
      }

      if (path === '/analytics/metrics' && method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        return jsonResponse(201, {
          data: {
            id: 'met_1',
            key: 'weekly_bookings',
            name: 'Weekly Bookings',
            dimensions: body.dimensions || [],
            groupBy: body.groupBy || null
          }
        });
      }
      if (path === '/analytics/anomaly-rules' && method === 'POST') {
        return jsonResponse(201, { data: { id: 'rule_1', ruleKey: 'bookings_drop_wow_30' } });
      }
      if (path === '/analytics/dashboards' && method === 'POST') {
        return jsonResponse(201, { data: { dashboardId: 'dash_1', name: 'Operations Dashboard' } });
      }
      if (path === '/analytics/dashboards/dash_1' && method === 'GET') {
        return jsonResponse(200, {
          data: {
            dashboardId: 'dash_1',
            tiles: [{ metric: 'weekly_bookings', value: 42 }],
            anomalies: [
              {
                rule: 'bookings_drop_wow_30',
                status: 'TRIGGERED',
                message: 'bookings drop >30% week-over-week'
              }
            ]
          }
        });
      }
      if (path === '/analytics/reports' && method === 'POST') {
        return jsonResponse(201, {
          data: {
            reportId: 'rep_1',
            name: 'Daily Program Reconciliation',
            dataset: 'program_registrations',
            format: 'CSV',
            schedule: { time: '02:00', timezone: 'America/New_York' }
          }
        });
      }
      if (path === '/analytics/reports/rep_1/run' && method === 'POST') {
        return jsonResponse(200, {
          data: {
            runId: 'run_1',
            status: 'SUCCESS',
            artifactPath: 'reports/run_1.csv',
            checksumSha256: 'abc123',
            startedAt: '2026-03-31T02:00:00.000Z',
            finishedAt: '2026-03-31T02:00:04.000Z'
          }
        });
      }
      if (path === '/analytics/reports/rep_1/runs' && method === 'GET') {
        return jsonResponse(200, {
          data: [
            {
              runId: 'run_1',
              status: 'SUCCESS',
              artifactPath: 'reports/run_1.csv',
              checksumSha256: 'abc123',
              startedAt: '2026-03-31T02:00:00.000Z',
              finishedAt: '2026-03-31T02:00:04.000Z'
            }
          ]
        });
      }

      if (path === '/exports' && method === 'POST') {
        return jsonResponse(202, { data: { exportJobId: 'exp_1', status: 'QUEUED' } });
      }
      if (path === '/exports/exp_1' && method === 'GET') {
        return jsonResponse(200, {
          data: {
            exportJobId: 'exp_1',
            status: 'COMPLETED',
            artifactPath: 'exports/exp_1.csv',
            checksumSha256: 'def456',
            maskingPreview: [{ field: 'phone', rule: 'last4' }]
          }
        });
      }
      if (path === '/admin/reconciliation/artifacts' && method === 'GET') {
        return jsonResponse(200, {
          data: [
            {
              type: 'EXPORT',
              id: 'exp_1',
              status: 'COMPLETED',
              artifactPath: 'exports/exp_1.csv',
              checksumSha256: 'def456',
              createdAt: '2026-03-31T02:00:06.000Z'
            }
          ]
        });
      }

      if (path === '/inbox/messages' && method === 'GET') {
        return jsonResponse(200, {
          data: [
            {
              id: 'msg_1',
              type: 'ANOMALY',
              title: 'Bookings Alert',
              body: 'Bookings dropped',
              createdAt: '2026-03-31T02:10:00.000Z',
              readAt: null
            }
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
        });
      }
      if (path === '/inbox/messages/msg_1/read' && method === 'POST') {
        return jsonResponse(200, { data: { id: 'msg_1', readAt: '2026-03-31T02:11:00.000Z' } });
      }
      if (path === '/inbox/messages/msg_1/print' && method === 'POST') {
        return jsonResponse(200, {
          data: {
            messageId: 'msg_1',
            printable: {
              noticeType: 'ANOMALY_ALERT',
              message: 'Bookings dropped'
            }
          }
        });
      }

      if (path === '/audit/events' && method === 'GET') {
        return jsonResponse(200, {
          data: [
            {
              id: 'aud_1',
              actorId: 'user-admin',
              action: 'EXPORT_REQUESTED',
              entityType: 'export_job',
              entityId: 'exp_1',
              createdAt: '2026-03-31T02:12:00.000Z',
              metadata: { resource: 'participants' }
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

    await user.type(screen.getByPlaceholderText('username'), 'admin.dev');
    await user.type(screen.getByPlaceholderText('password'), 'AdminSecure!2026');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByText('Signed in as admin.dev')).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText('step-up password'), 'AdminSecure!2026');

    await user.click(screen.getByRole('button', { name: 'Analytics' }));
    expect(screen.getByText('Step 1) Metric and Anomaly Rule')).toBeTruthy();
    expect(screen.queryByText('Analytics details')).toBeNull();

    expect(screen.getByPlaceholderText('dimensions (key:TYPE,...)')).toBeTruthy();
    expect(screen.getByPlaceholderText('group by dimension')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save Metric + Rule' }));
    await waitFor(() => {
      expect(screen.getByText(/date:DATE/)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Create Dashboard' }));
    await waitFor(() => {
      expect(screen.getAllByText('weekly_bookings').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Save Report Definition' }));
    await user.click(screen.getByRole('button', { name: 'Run Report Now' }));
    await waitFor(() => {
      expect(screen.getAllByText('run_1').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Exports' }));
    expect(screen.queryByText('Export details')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Request Export (Step-Up)' }));
    await user.click(screen.getByRole('button', { name: 'Refresh Job Status' }));
    await waitFor(() => {
      expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Load Reconciliation Artifacts' }));
    await waitFor(() => {
      expect(screen.getByText('exp_1')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Inbox' }));
    await user.click(screen.getByRole('button', { name: 'Load Inbox' }));
    await waitFor(() => {
      expect(screen.getByText('Bookings Alert')).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Read + Print' }));
    await waitFor(() => {
      expect(screen.getByText('ANOMALY_ALERT')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Audit' }));
    await user.click(screen.getByRole('button', { name: 'Load Audit Events' }));
    await waitFor(() => {
      expect(screen.getByText('EXPORT_REQUESTED')).toBeTruthy();
    });
  }, 20000);
});
