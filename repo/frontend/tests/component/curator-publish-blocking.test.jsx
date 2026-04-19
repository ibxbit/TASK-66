import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CuratorTab from '../../src/components/CuratorTab';

const createBaseProps = (apiRequest) => ({
  apiRequest,
  csrfToken: 'csrf-token',
  acquireStepUpTokenFor: vi.fn(async () => ({ stepUpToken: 'stp-test', action: 'GRAPH_PUBLISH' })),
  setMessage: vi.fn(),
  setError: vi.fn()
});

describe('CuratorTab publish blocking', () => {
  it('disables publish button when no draft exists', () => {
    const apiRequest = vi.fn();
    render(<CuratorTab {...createBaseProps(apiRequest)} />);

    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    expect(publishBtn.disabled).toBe(true);
  });

  it('disables publish when blocking validation issues (duplicate/cycle/orphan) are present', async () => {
    const user = userEvent.setup();
    let callCount = 0;

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/graph/drafts' && request.method === 'POST') {
        return { data: { draftId: 'draft_1' } };
      }
      if (request.path === '/graph/drafts/draft_1' && request.method === 'GET') {
        callCount++;
        if (callCount <= 1) {
          return {
            data: {
              draftId: 'draft_1',
              snapshot: {
                nodes: [
                  { node_id: 'n1', type: 'STAMP', label: 'Blue Airmail', metadata: {} },
                  { node_id: 'n2', type: 'ARTIST', label: 'I. Kline', metadata: {} }
                ],
                edges: [
                  { edge_id: 'e1', from_node_id: 'n1', to_node_id: 'n2', relation_type: 'CREATED_BY', weight: 80, constraints: {} }
                ]
              },
              validation: { status: 'NOT_RUN', issues: [] }
            }
          };
        }
        return {
          data: {
            draftId: 'draft_1',
            snapshot: {
              nodes: [
                { node_id: 'n1', type: 'STAMP', label: 'Blue Airmail', metadata: {} },
                { node_id: 'n2', type: 'ARTIST', label: 'I. Kline', metadata: {} }
              ],
              edges: [
                { edge_id: 'e1', from_node_id: 'n1', to_node_id: 'n2', relation_type: 'CREATED_BY', weight: 80, constraints: {} }
              ]
            },
            validation: {
              status: 'FAILED',
              issues: [
                { severity: 'BLOCKING', code: 'DUPLICATE_NODE', nodeId: 'n1', message: 'Duplicate label detected for Blue Airmail' },
                { severity: 'BLOCKING', code: 'CYCLE', edgeId: 'e1', message: 'Circular reference found in graph' },
                { severity: 'WARNING', code: 'ORPHAN_NODE', nodeId: 'n2', message: 'Node has no outgoing edges' }
              ]
            }
          }
        };
      }
      if (request.path === '/graph/drafts/draft_1/validate' && request.method === 'POST') {
        return { data: { status: 'FAILED' } };
      }
      return { data: {} };
    });

    render(<CuratorTab {...createBaseProps(apiRequest)} />);

    await user.click(screen.getByRole('button', { name: 'Create Draft' }));
    await waitFor(() => {
      expect(screen.getAllByText(/Draft: draft_1/).length).toBeGreaterThan(0);
    });

    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    expect(publishBtn.disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Validate Draft' }));
    await waitFor(() => {
      expect(screen.getByText(/Blocking issues: 2/)).toBeTruthy();
    });

    expect(publishBtn.disabled).toBe(true);
    expect(screen.getByText(/Resolve blocking validation issues/)).toBeTruthy();
  });

  it('enables publish after blocking issues are resolved (validation passes)', async () => {
    const user = userEvent.setup();
    let validateCalled = false;

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/graph/drafts' && request.method === 'POST') {
        return { data: { draftId: 'draft_2' } };
      }
      if (request.path === '/graph/drafts/draft_2' && request.method === 'GET') {
        if (validateCalled) {
          return {
            data: {
              draftId: 'draft_2',
              snapshot: {
                nodes: [{ node_id: 'n1', type: 'STAMP', label: 'Clean Stamp', metadata: {} }],
                edges: []
              },
              validation: { status: 'PASSED', issues: [] }
            }
          };
        }
        return {
          data: {
            draftId: 'draft_2',
            snapshot: {
              nodes: [{ node_id: 'n1', type: 'STAMP', label: 'Clean Stamp', metadata: {} }],
              edges: []
            },
            validation: { status: 'NOT_RUN', issues: [] }
          }
        };
      }
      if (request.path === '/graph/drafts/draft_2/validate' && request.method === 'POST') {
        validateCalled = true;
        return { data: { status: 'PASSED' } };
      }
      return { data: {} };
    });

    render(<CuratorTab {...createBaseProps(apiRequest)} />);

    await user.click(screen.getByRole('button', { name: 'Create Draft' }));
    await waitFor(() => {
      expect(screen.getAllByText(/Draft: draft_2/).length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Validate Draft' }));
    await waitFor(() => {
      expect(screen.getByText(/Blocking issues: 0/)).toBeTruthy();
    });

    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    expect(publishBtn.disabled).toBe(false);
  });
});
