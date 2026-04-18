import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchDiscoveryTab from '../../src/components/SearchDiscoveryTab';

const createBaseProps = (apiRequest) => ({
  apiRequest,
  csrfToken: 'csrf-token',
  canCurateKeywords: true,
  setMessage: vi.fn(),
  setError: vi.fn()
});

describe('SearchDiscoveryTab', () => {
  it('supports loading -> success flow with sorting and pagination controls', async () => {
    const user = userEvent.setup();
    const calls = [];
    const apiRequest = vi.fn(async (request) => {
      calls.push(request);
      if (request.path === '/catalog/search') {
        return {
          data: [
            {
              id: 'itm_1',
              title: 'Blue Airmail',
              catalogNumber: 'CAT-1',
              artist: 'I. Kline',
              series: 'Sky',
              period: '1930',
              category: 'Airmail',
              tags: ['blue']
            }
          ],
          pagination: { page: Number(request.query.page), pageSize: 20, total: 2, totalPages: 2 }
        };
      }
      if (request.path === '/catalog/hot-keywords') {
        return { data: [] };
      }
      if (request.path === '/catalog/autocomplete') {
        return { data: [{ type: 'title', value: 'Blue Airmail' }] };
      }
      return { data: {} };
    });

    render(<SearchDiscoveryTab {...createBaseProps(apiRequest)} />);

    await user.type(screen.getByPlaceholderText('title'), 'Blue');
    await user.selectOptions(screen.getByRole('combobox'), 'title:asc');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Blue Airmail')).toBeTruthy();
    });
    expect(screen.getByText(/Loaded 1 items on page 1 of 2/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(calls.filter((entry) => entry.path === '/catalog/search').length).toBe(2);
    });
    expect(calls[1].query.page).toBe(2);
    expect(calls[0].query.sort).toBe('title:asc');
  });

  it('shows explicit empty and error states', async () => {
    const user = userEvent.setup();

    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } })
      .mockRejectedValueOnce(new Error('Backend offline'));

    const props = createBaseProps(apiRequest);
    render(<SearchDiscoveryTab {...props} />);

    await user.type(screen.getByPlaceholderText('title'), 'No Match');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('No results found for this query.')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(props.setError).toHaveBeenCalledWith('Backend offline');
    });
  });

  it('enforces page size boundary in UI: 51 allowed and 52 blocked', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/catalog/search') {
        return {
          data: [
            {
              id: 'itm_boundary_1',
              title: 'Boundary Result',
              catalogNumber: 'BOUND-1',
              artist: 'Boundary Artist',
              series: 'Boundary',
              period: '1940'
            }
          ],
          pagination: { page: 1, pageSize: request.query.pageSize, total: 1, totalPages: 1 }
        };
      }
      return { data: [] };
    });

    render(<SearchDiscoveryTab {...createBaseProps(apiRequest)} />);

    await user.type(screen.getByPlaceholderText('title'), 'Boundary');
    const pageSizeInput = screen.getByPlaceholderText('page size (max 51)');
    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '51');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Boundary Result')).toBeTruthy();
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][0].query.pageSize).toBe(51);

    await user.clear(pageSizeInput);
    await user.type(pageSizeInput, '52');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Page size cannot exceed 51.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('shows queued message for hot-keyword creation when offline', async () => {
    const user = userEvent.setup();
    const props = createBaseProps(vi.fn(async (request) => {
      if (request.path === '/catalog/hot-keywords' && request.method === 'POST') {
        return { data: { queued: true, message: 'Request queued while offline and will sync automatically' } };
      }
      return { data: [] };
    }));

    render(<SearchDiscoveryTab {...props} />);

    await user.type(screen.getByPlaceholderText('keyword'), 'Vintage Airmail');
    await user.type(screen.getByPlaceholderText('rank'), '5');
    await user.click(screen.getByRole('button', { name: 'Save Keyword' }));

    await waitFor(() => {
      expect(props.setMessage).toHaveBeenCalledWith(
        'Keyword creation queued offline. It will sync when back online.'
      );
    });
  });

  it('shows queued message for hot-keyword update when offline', async () => {
    const user = userEvent.setup();
    const props = createBaseProps(vi.fn(async (request) => {
      if (request.path === '/catalog/hot-keywords' && request.method === 'GET') {
        return {
          data: [{ id: 'kw_1', keyword: 'Stamp Show', rank: 3, activeFrom: '', activeTo: '' }]
        };
      }
      if (request.method === 'PATCH') {
        return { data: { queued: true, message: 'Request queued while offline and will sync automatically' } };
      }
      return { data: [] };
    }));

    render(<SearchDiscoveryTab {...props} />);

    await user.click(screen.getByRole('button', { name: 'Load Hot Keywords' }));
    await waitFor(() => {
      expect(screen.getByText('Stamp Show')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByPlaceholderText('rank'));
    await user.type(screen.getByPlaceholderText('rank'), '10');
    await user.click(screen.getByRole('button', { name: 'Save Keyword' }));

    await waitFor(() => {
      expect(props.setMessage).toHaveBeenCalledWith(
        'Keyword update queued offline. It will sync when back online.'
      );
    });
  });

  it('shows queued message for hot-keyword retirement when offline', async () => {
    const user = userEvent.setup();
    const props = createBaseProps(vi.fn(async (request) => {
      if (request.path === '/catalog/hot-keywords' && request.method === 'GET') {
        return {
          data: [{ id: 'kw_2', keyword: 'Rare Stamps', rank: 1, activeFrom: '', activeTo: '' }]
        };
      }
      if (request.method === 'DELETE') {
        return { data: { queued: true, message: 'Request queued while offline and will sync automatically' } };
      }
      return { data: [] };
    }));

    render(<SearchDiscoveryTab {...props} />);

    await user.click(screen.getByRole('button', { name: 'Load Hot Keywords' }));
    await waitFor(() => {
      expect(screen.getByText('Rare Stamps')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Retire' }));

    await waitFor(() => {
      expect(props.setMessage).toHaveBeenCalledWith(
        'Keyword retirement queued offline. It will sync when back online.'
      );
    });
  });

  it('normalizes legacy nested search payloads', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/catalog/search') {
        return {
          data: {
            items: [
              {
                id: 'itm_legacy_1',
                title: 'Legacy Nested Result',
                catalogNumber: 'LEG-1',
                artist: 'Legacy Artist',
                series: 'Legacy Series',
                period: '1920',
                category: 'Legacy',
                tags: ['legacy']
              }
            ]
          },
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
        };
      }
      return { data: [] };
    });

    render(<SearchDiscoveryTab {...createBaseProps(apiRequest)} />);
    await user.type(screen.getByPlaceholderText('title'), 'Legacy');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Legacy Nested Result')).toBeTruthy();
    });
  });
});
