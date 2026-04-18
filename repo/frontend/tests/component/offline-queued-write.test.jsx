import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgramsTab from '../../src/components/ProgramsTab';
import StaffingTab from '../../src/components/StaffingTab';

describe('Offline queued-write UX messaging', () => {
  it('ProgramsTab shows queued message instead of committed success on offline response', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async () => ({
      data: {
        queued: true,
        message: 'Request queued while offline and will sync automatically'
      }
    }));

    render(
      <ProgramsTab
        apiRequest={apiRequest}
        csrfToken="csrf-test"
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: /Create Program/ }));

    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith(
        'Program creation queued offline. It will sync when back online.'
      );
    });
  });

  it('ProgramsTab does not set session state from queued response', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    let callCount = 0;
    const apiRequest = vi.fn(async (request) => {
      callCount++;
      if (request.path === '/programs' && request.method === 'POST') {
        return { data: { id: 'prog_1', title: 'Docent Basics', type: 'DOCENT_TRAINING' } };
      }
      if (request.path === '/coaches' && request.method === 'POST') {
        return { data: { id: 'coach_1', name: 'Coach Rivera' } };
      }
      if (request.path === '/program-sessions' && request.method === 'POST') {
        return {
          data: {
            queued: true,
            message: 'Request queued while offline and will sync automatically'
          }
        };
      }
      return { data: {} };
    });

    render(
      <ProgramsTab
        apiRequest={apiRequest}
        csrfToken="csrf-test"
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: /Create Program/ }));
    await waitFor(() => {
      expect(screen.getByText(/Program: prog_1/)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Create Coach/ }));
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('button', { name: /Create Session/ }));
    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith(
        'Session scheduling queued offline. It will sync when back online.'
      );
    });

    expect(screen.queryByText(/Session sess_/)).toBeNull();
  });

  it('ProgramsTab shows committed success when response has real data', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/programs' && request.method === 'POST') {
        return {
          data: {
            id: 'prog_real',
            title: 'Docent Basics',
            type: 'DOCENT_TRAINING'
          }
        };
      }
      return { data: {} };
    });

    render(
      <ProgramsTab
        apiRequest={apiRequest}
        csrfToken="csrf-test"
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: /Create Program/ }));

    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Program created: Docent Basics');
    });
    expect(screen.getByText(/Program: prog_real/)).toBeTruthy();
  });

  it('StaffingTab shows queued message for offline job draft creation', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async () => ({
      data: {
        queued: true,
        message: 'Request queued while offline and will sync automatically'
      }
    }));

    render(
      <StaffingTab
        apiRequest={apiRequest}
        csrfToken="csrf-test"
        roles={['Administrator']}
        acquireStepUpTokenFor={vi.fn()}
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: /Create Draft/ }));

    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith(
        'Job draft queued offline. It will sync when back online.'
      );
    });

    expect(screen.getByText('No jobs created in this session.')).toBeTruthy();
  });

  it('shows error when request fails completely', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async () => {
      throw new Error('Network error');
    });

    render(
      <ProgramsTab
        apiRequest={apiRequest}
        csrfToken="csrf-test"
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: /Create Program/ }));

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Network error');
    });
  });
});
