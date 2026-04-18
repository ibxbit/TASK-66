import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgramsTab from '../../src/components/ProgramsTab';
import StaffingTab from '../../src/components/StaffingTab';

describe('Programs and staffing retry behavior', () => {
  it('retries failed program creation and succeeds on second attempt', async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    const setMessage = vi.fn();
    const apiRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValueOnce({ data: { id: 'prog_1', title: 'Docent Basics', type: 'DOCENT_TRAINING', capacity: 2 } });

    render(<ProgramsTab apiRequest={apiRequest} csrfToken="csrf" setMessage={setMessage} setError={setError} />);

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Transient failure');
    });

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Program created: Docent Basics');
    });
  }, 15000);

  it('shows late-cancel penalty messaging and credit deduction', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/programs' && request.method === 'POST') {
        return { data: { id: 'prog_lc', title: 'Cancel Test', type: 'DOCENT_TRAINING' } };
      }
      if (request.path === '/coaches' && request.method === 'POST') {
        return { data: { id: 'coach_lc', name: 'Coach LC' } };
      }
      if (request.path.includes('/availability') && request.method === 'POST') {
        return { data: { id: 'avail_lc' } };
      }
      if (request.path === '/program-sessions' && request.method === 'POST') {
        return { data: { id: 'sess_lc', capacity: 2 } };
      }
      if (request.path.endsWith('/registrations') && request.method === 'POST') {
        return { data: { registrationId: 'reg_lc_1', status: 'REGISTERED' } };
      }
      if (request.path.endsWith('/cancel') && request.method === 'POST') {
        return { data: { status: 'LATE_CANCELLED', creditsDeducted: 1, waitlistPromotion: null } };
      }
      return { data: {} };
    });

    render(<ProgramsTab apiRequest={apiRequest} csrfToken="csrf" setMessage={setMessage} setError={setError} />);

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => expect(screen.getByText(/Program: prog_lc/)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Create Coach' }));
    await user.click(screen.getByRole('button', { name: 'Save Availability' }));
    await user.click(screen.getByRole('button', { name: 'Create Session' }));
    await waitFor(() => expect(screen.getByText(/Session sess_lc/)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Register Participant' }));
    await waitFor(() => expect(screen.getByRole('cell', { name: 'REGISTERED' })).toBeTruthy());

    const regSelect = screen.getAllByRole('combobox').find((s) => s.querySelector('option[value="reg_lc_1"]'));
    if (regSelect) await user.selectOptions(regSelect, 'reg_lc_1');
    await user.click(screen.getByRole('button', { name: 'Late/Normal Cancel' }));

    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Cancellation recorded as LATE_CANCELLED. Credits deducted: 1');
    });
    expect(screen.getByRole('cell', { name: 'LATE_CANCELLED' })).toBeTruthy();
  }, 15000);

  it('shows no-show penalty messaging with 2 credit deduction', async () => {
    const user = userEvent.setup();
    const setMessage = vi.fn();
    const setError = vi.fn();

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/programs' && request.method === 'POST') {
        return { data: { id: 'prog_ns', title: 'NoShow Test', type: 'DOCENT_TRAINING' } };
      }
      if (request.path === '/coaches' && request.method === 'POST') {
        return { data: { id: 'coach_ns', name: 'Coach NS' } };
      }
      if (request.path.includes('/availability') && request.method === 'POST') {
        return { data: { id: 'avail_ns' } };
      }
      if (request.path === '/program-sessions' && request.method === 'POST') {
        return { data: { id: 'sess_ns', capacity: 2 } };
      }
      if (request.path.endsWith('/registrations') && request.method === 'POST') {
        return { data: { registrationId: 'reg_ns_1', status: 'REGISTERED' } };
      }
      if (request.path.endsWith('/no-show') && request.method === 'POST') {
        return { data: { status: 'NO_SHOW', creditsDeducted: 2, waitlistPromotion: null } };
      }
      return { data: {} };
    });

    render(<ProgramsTab apiRequest={apiRequest} csrfToken="csrf" setMessage={setMessage} setError={setError} />);

    await user.click(screen.getByRole('button', { name: 'Create Program' }));
    await waitFor(() => expect(screen.getByText(/Program: prog_ns/)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Create Coach' }));
    await user.click(screen.getByRole('button', { name: 'Save Availability' }));
    await user.click(screen.getByRole('button', { name: 'Create Session' }));
    await waitFor(() => expect(screen.getByText(/Session sess_ns/)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Register Participant' }));
    await waitFor(() => expect(screen.getByRole('cell', { name: 'REGISTERED' })).toBeTruthy());

    const regSelect = screen.getAllByRole('combobox').find((s) => s.querySelector('option[value="reg_ns_1"]'));
    if (regSelect) await user.selectOptions(regSelect, 'reg_ns_1');
    await user.click(screen.getByRole('button', { name: 'Mark No-Show' }));

    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('No-show recorded. Credits deducted: 2');
    });
    expect(screen.getByRole('cell', { name: 'NO_SHOW' })).toBeTruthy();
  }, 15000);

  it('retries step-up protected staffing approval after failure', async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    const setMessage = vi.fn();
    const acquireStepUpTokenFor = vi
      .fn()
      .mockRejectedValueOnce(new Error('Step-up denied'))
      .mockResolvedValueOnce({ stepUpToken: 'stp_ok' });

    const apiRequest = vi.fn(async (request) => {
      if (request.path === '/jobs') {
        return { data: { jobId: 'job_1', state: 'DRAFT' } };
      }
      if (request.path === '/jobs/job_1/submit') {
        return { data: { jobId: 'job_1', state: 'PENDING_APPROVAL' } };
      }
      if (request.path === '/jobs/job_1/approve') {
        return { data: { jobId: 'job_1', state: 'PUBLISHED' } };
      }
      return { data: {} };
    });

    render(
      <StaffingTab
        apiRequest={apiRequest}
        csrfToken="csrf"
        roles={['Administrator']}
        acquireStepUpTokenFor={acquireStepUpTokenFor}
        setMessage={setMessage}
        setError={setError}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create Draft' }));
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'job_1');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await user.click(screen.getByRole('button', { name: 'Approve (Step-Up)' }));
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Step-up denied');
    });

    await user.click(screen.getByRole('button', { name: 'Approve (Step-Up)' }));
    await waitFor(() => {
      expect(setMessage).toHaveBeenCalledWith('Job approved and published');
    });
  }, 15000);
});
