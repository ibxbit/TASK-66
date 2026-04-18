import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuidedNavigationTab from '../../src/components/GuidedNavigationTab';

const createBaseProps = (apiRequest) => ({
  apiRequest,
  setMessage: vi.fn(),
  setError: vi.fn()
});

describe('GuidedNavigationTab', () => {
  it('loads route data and displays segments and itineraries', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/routes/rte_abc123' && request.method === 'GET') {
        return {
          data: {
            routeId: 'rte_abc123',
            name: 'Main Exhibit Route',
            strictSequence: true,
            defaultPaceMph: 3,
            segments: [
              { id: 'seg1', segmentType: 'REQUIRED_NEXT', fromCaseId: 'case_1', toCaseId: 'case_2', distanceMeters: 50, dwellMinutes: 5 },
              { id: 'seg2', segmentType: 'OPTIONAL_BRANCH', fromCaseId: 'case_2', toCaseId: 'case_3', distanceMeters: 30, dwellMinutes: 3 }
            ]
          }
        };
      }
      if (request.path === '/routes/rte_abc123/itineraries' && request.method === 'GET') {
        return {
          data: [
            {
              itineraryId: 'itn_1',
              estimatedWalkMinutes: 12,
              generatedAt: '2026-03-31T10:00:00.000Z',
              printable: {
                steps: [
                  { step: 1, segmentType: 'REQUIRED_NEXT', fromCaseId: 'case_1', toCaseId: 'case_2', distanceMeters: 50, dwellMinutes: 5 }
                ]
              }
            }
          ]
        };
      }
      return { data: {} };
    });

    const props = createBaseProps(apiRequest);
    render(<GuidedNavigationTab {...props} />);

    await user.type(screen.getByPlaceholderText(/route id/), 'rte_abc123');
    await user.click(screen.getByRole('button', { name: 'Load Route' }));

    await waitFor(() => {
      expect(screen.getByText('Main Exhibit Route')).toBeTruthy();
    });

    expect(screen.getByText(/strictSequence: true/)).toBeTruthy();
    expect(screen.getByText(/pace: 3 mph/)).toBeTruthy();
    expect(screen.getAllByText(/REQUIRED_NEXT/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OPTIONAL_BRANCH/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/itn_1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12 min/).length).toBeGreaterThan(0);
    expect(props.setMessage).toHaveBeenCalledWith('Loaded guided navigation for route rte_abc123');
  });

  it('shows error when route id is empty', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn();
    const props = createBaseProps(apiRequest);

    render(<GuidedNavigationTab {...props} />);

    await user.click(screen.getByRole('button', { name: 'Load Route' }));

    await waitFor(() => {
      expect(props.setError).toHaveBeenCalledWith('Enter a route id first');
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('handles API error gracefully', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async () => {
      throw new Error('Route not found');
    });
    const props = createBaseProps(apiRequest);

    render(<GuidedNavigationTab {...props} />);

    await user.type(screen.getByPlaceholderText(/route id/), 'rte_missing');
    await user.click(screen.getByRole('button', { name: 'Load Route' }));

    await waitFor(() => {
      expect(props.setError).toHaveBeenCalledWith('Route not found');
    });
  });

  it('shows empty itinerary message when no itineraries exist', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/routes/rte_empty' && request.method === 'GET') {
        return {
          data: {
            routeId: 'rte_empty',
            name: 'Empty Route',
            strictSequence: false,
            defaultPaceMph: 3,
            segments: []
          }
        };
      }
      if (request.path === '/routes/rte_empty/itineraries' && request.method === 'GET') {
        return { data: [] };
      }
      return { data: {} };
    });

    render(<GuidedNavigationTab {...createBaseProps(apiRequest)} />);

    await user.type(screen.getByPlaceholderText(/route id/), 'rte_empty');
    await user.click(screen.getByRole('button', { name: 'Load Route' }));

    await waitFor(() => {
      expect(screen.getByText('Empty Route')).toBeTruthy();
    });
    expect(screen.getByText('No generated itineraries yet for this route.')).toBeTruthy();
  });

  it('discovers available routes and allows selection from dropdown', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/routes' && request.method === 'GET') {
        return {
          data: [
            { routeId: 'rte_disc_1', name: 'Main Exhibit Route' },
            { routeId: 'rte_disc_2', name: 'Accessibility Route' }
          ]
        };
      }
      if (request.path === '/routes/rte_disc_2' && request.method === 'GET') {
        return {
          data: {
            routeId: 'rte_disc_2',
            name: 'Accessibility Route',
            strictSequence: false,
            defaultPaceMph: 2,
            segments: [
              { id: 'seg_a1', segmentType: 'ACCESSIBILITY_DETOUR', fromCaseId: 'case_a', toCaseId: 'case_b', distanceMeters: 80, dwellMinutes: 6 }
            ]
          }
        };
      }
      if (request.path === '/routes/rte_disc_2/itineraries' && request.method === 'GET') {
        return { data: [] };
      }
      return { data: {} };
    });

    const props = createBaseProps(apiRequest);
    render(<GuidedNavigationTab {...props} />);

    await user.click(screen.getByRole('button', { name: 'Discover Routes' }));
    await waitFor(() => {
      expect(props.setMessage).toHaveBeenCalledWith('Found 2 available route(s)');
    });

    const routeSelect = screen.getByRole('combobox');
    expect(routeSelect).toBeTruthy();
    await user.selectOptions(routeSelect, 'rte_disc_2');

    await user.click(screen.getByRole('button', { name: 'Load Route' }));
    await waitFor(() => {
      expect(screen.getAllByText('Accessibility Route').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/ACCESSIBILITY_DETOUR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/pace: 2 mph/)).toBeTruthy();
  });

  it('prevents duplicate loading while request is pending', async () => {
    const user = userEvent.setup();
    let resolveRequest;
    const apiRequest = vi.fn(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(<GuidedNavigationTab {...createBaseProps(apiRequest)} />);

    await user.type(screen.getByPlaceholderText(/route id/), 'rte_slow');
    await user.click(screen.getByRole('button', { name: 'Load Route' }));

    expect(screen.getByRole('button', { name: 'Loading...' }).disabled).toBe(true);

    resolveRequest({
      data: {
        routeId: 'rte_slow',
        name: 'Slow Route',
        strictSequence: false,
        defaultPaceMph: 3,
        segments: []
      }
    });
  });
});
