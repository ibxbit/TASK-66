import { useMemo, useState } from 'react';
import { validateProgramDraft, validateSessionDraft } from '../validators/forms';

const isQueued = (response) => response?.data?.queued === true;

const defaultProgramDraft = {
  type: 'DOCENT_TRAINING',
  title: 'Docent Basics',
  capacity: '2'
};

const defaultCoachDraft = {
  name: 'Coach Rivera',
  qualifications: 'Philately',
  contact: 'coach@example.local'
};

const defaultAvailabilityDraft = {
  startAtUtc: '2026-07-01T14:00:00Z',
  endAtUtc: '2026-07-01T15:00:00Z',
  timezone: 'America/New_York'
};

const defaultSessionDraft = {
  venueId: 'demo-venue-1',
  startAtUtc: '2026-07-01T14:00:00Z',
  endAtUtc: '2026-07-01T15:00:00Z',
  timezone: 'America/New_York',
  capacity: '2'
};

function ProgramsTab({ apiRequest, csrfToken, setMessage, setError }) {
  const [programDraft, setProgramDraft] = useState(defaultProgramDraft);
  const [coachDraft, setCoachDraft] = useState(defaultCoachDraft);
  const [availabilityDraft, setAvailabilityDraft] = useState(defaultAvailabilityDraft);
  const [sessionDraft, setSessionDraft] = useState(defaultSessionDraft);
  const [participantId, setParticipantId] = useState('usr_900');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState('');
  const [selectedWaitlistEntryId, setSelectedWaitlistEntryId] = useState('');
  const [creditsParticipantId, setCreditsParticipantId] = useState('usr_900');
  const [inboxMessageId, setInboxMessageId] = useState('');
  const [pending, setPending] = useState('');
  const [state, setState] = useState({
    program: null,
    coach: null,
    availability: null,
    session: null,
    registrations: [],
    credits: null,
    inbox: [],
    printable: null
  });

  const [validationError, setValidationError] = useState('');
  const sessionReady = Boolean(state.program?.id && state.coach?.id);

  const activeRegistrations = useMemo(
    () => state.registrations.filter((item) => ['REGISTERED', 'PROMOTION_PENDING'].includes(item.status)),
    [state.registrations]
  );

  const run = async (key, fn) => {
    if (pending) {
      return;
    }
    setPending(key);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Program operation failed');
    } finally {
      setPending('');
    }
  };

  const createProgram = () =>
    run('create-program', async () => {
      const vErr = validateProgramDraft(programDraft);
      if (vErr) {
        setValidationError(vErr);
        throw new Error(vErr);
      }
      setValidationError('');
      const response = await apiRequest({
        path: '/programs',
        method: 'POST',
        csrfToken,
        body: {
          type: programDraft.type,
          title: programDraft.title,
          capacity: Number(programDraft.capacity)
        }
      });
      if (isQueued(response)) {
        setMessage('Program creation queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({ ...prev, program: response.data }));
      setMessage(`Program created: ${response.data.title}`);
    });

  const createCoach = () =>
    run('create-coach', async () => {
      const response = await apiRequest({
        path: '/coaches',
        method: 'POST',
        csrfToken,
        body: {
          name: coachDraft.name,
          qualifications: coachDraft.qualifications
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          contact: coachDraft.contact
        }
      });
      if (isQueued(response)) {
        setMessage('Coach creation queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({ ...prev, coach: response.data }));
      setMessage(`Coach created: ${response.data.name}`);
    });

  const saveAvailability = () =>
    run('create-availability', async () => {
      if (!state.coach?.id) {
        throw new Error('Create a coach first');
      }
      const response = await apiRequest({
        path: `/coaches/${state.coach.id}/availability`,
        method: 'POST',
        csrfToken,
        body: {
          startAtUtc: availabilityDraft.startAtUtc,
          endAtUtc: availabilityDraft.endAtUtc,
          timezone: availabilityDraft.timezone
        }
      });
      if (isQueued(response)) {
        setMessage('Availability update queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({ ...prev, availability: response.data }));
      setMessage('Coach availability window added');
    });

  const createSession = () =>
    run('create-session', async () => {
      if (!state.program?.id || !state.coach?.id) {
        throw new Error('Create program and coach first');
      }
      const sErr = validateSessionDraft(sessionDraft);
      if (sErr) {
        setValidationError(sErr);
        throw new Error(sErr);
      }
      setValidationError('');
      const response = await apiRequest({
        path: '/program-sessions',
        method: 'POST',
        csrfToken,
        body: {
          programId: state.program.id,
          coachId: state.coach.id,
          venueId: sessionDraft.venueId,
          startAtUtc: sessionDraft.startAtUtc,
          endAtUtc: sessionDraft.endAtUtc,
          timezone: sessionDraft.timezone,
          capacity: Number(sessionDraft.capacity)
        }
      });
      if (isQueued(response)) {
        setMessage('Session scheduling queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({ ...prev, session: response.data }));
      setMessage(`Session scheduled with capacity ${response.data.capacity}`);
    });

  const registerParticipant = () =>
    run('register', async () => {
      if (!state.session?.id) {
        throw new Error('Create a session first');
      }
      const response = await apiRequest({
        path: `/program-sessions/${state.session.id}/registrations`,
        method: 'POST',
        csrfToken,
        body: { participantId }
      });
      if (isQueued(response)) {
        setMessage('Registration queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({
        ...prev,
        registrations: [
          ...prev.registrations,
          {
            participantId,
            registrationId: response.data.registrationId,
            status: response.data.status,
            waitlistPosition: response.data.waitlistPosition || null
          }
        ]
      }));
      setMessage(
        response.data.status === 'WAITLISTED'
          ? `Participant waitlisted at position ${response.data.waitlistPosition}`
          : 'Participant registered'
      );
    });

  const cancelRegistration = () =>
    run('cancel-registration', async () => {
      if (!state.session?.id || !selectedRegistrationId) {
        throw new Error('Select a registration first');
      }
      const response = await apiRequest({
        path: `/program-sessions/${state.session.id}/registrations/${selectedRegistrationId}/cancel`,
        method: 'POST',
        csrfToken
      });
      if (isQueued(response)) {
        setMessage('Cancellation queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({
        ...prev,
        registrations: prev.registrations.map((entry) =>
          entry.registrationId === selectedRegistrationId
            ? { ...entry, status: response.data.status }
            : entry
        )
      }));
      if (response.data.waitlistPromotion?.entryId) {
        setSelectedWaitlistEntryId(response.data.waitlistPromotion.entryId);
      }
      setMessage(
        `Cancellation recorded as ${response.data.status}. Credits deducted: ${response.data.creditsDeducted}`
      );
    });

  const markNoShow = () =>
    run('no-show', async () => {
      if (!state.session?.id || !selectedRegistrationId) {
        throw new Error('Select a registration first');
      }
      const response = await apiRequest({
        path: `/program-sessions/${state.session.id}/registrations/${selectedRegistrationId}/no-show`,
        method: 'POST',
        csrfToken
      });
      if (isQueued(response)) {
        setMessage('No-show report queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({
        ...prev,
        registrations: prev.registrations.map((entry) =>
          entry.registrationId === selectedRegistrationId
            ? { ...entry, status: response.data.status }
            : entry
        )
      }));
      if (response.data.waitlistPromotion?.entryId) {
        setSelectedWaitlistEntryId(response.data.waitlistPromotion.entryId);
      }
      setMessage(`No-show recorded. Credits deducted: ${response.data.creditsDeducted}`);
    });

  const confirmWaitlist = () =>
    run('confirm-waitlist', async () => {
      if (!state.session?.id || !selectedWaitlistEntryId) {
        throw new Error('Enter waitlist entry id first');
      }
      const response = await apiRequest({
        path: `/program-sessions/${state.session.id}/waitlist/${selectedWaitlistEntryId}/confirm`,
        method: 'POST',
        csrfToken
      });
      if (isQueued(response)) {
        setMessage('Waitlist confirmation queued offline. It will sync when back online.');
        return;
      }
      setState((prev) => ({
        ...prev,
        registrations: prev.registrations.map((entry) =>
          entry.registrationId === response.data.registrationId
            ? { ...entry, status: response.data.status, waitlistPosition: null }
            : entry
        )
      }));
      setMessage(`Waitlist confirmation complete for ${response.data.registrationId}`);
    });

  const loadCredits = () =>
    run('load-credits', async () => {
      const response = await apiRequest({
        path: `/participants/${creditsParticipantId}/credits`,
        method: 'GET',
        allowQueue: false
      });
      setState((prev) => ({ ...prev, credits: response.data }));
      setMessage('Credit ledger loaded');
    });

  const loadInbox = () =>
    run('load-inbox', async () => {
      const response = await apiRequest({
        path: '/inbox/messages',
        method: 'GET',
        query: { 'filter[unread]': 'false' },
        allowQueue: false
      });
      setState((prev) => ({ ...prev, inbox: response.data || [] }));
      setMessage(`Loaded ${response.data?.length || 0} inbox messages`);
    });

  const printInboxPayload = () =>
    run('print-inbox', async () => {
      if (!inboxMessageId) {
        throw new Error('Select a message id first');
      }
      const readResponse = await apiRequest({
        path: `/inbox/messages/${inboxMessageId}/read`,
        method: 'POST',
        csrfToken
      });
      const printable = await apiRequest({
        path: `/inbox/messages/${inboxMessageId}/print`,
        method: 'POST',
        csrfToken,
        allowQueue: false
      });
      setState((prev) => ({ ...prev, printable: printable.data }));
      setMessage(`Message marked read at ${readResponse.data.readAt}`);
    });

  return (
    <article className="card">
      <h2>Program Scheduling & Capacity Operations</h2>
      <p className="small">Stepwise operations for scheduling, waitlists, penalties, notifications, and printable outputs.</p>
      {validationError ? <p className="notice err">{validationError}</p> : null}

      <section className="route-block">
        <h3>1) Create Program</h3>
        <div className="row wrap">
          <input value={programDraft.type} onChange={(e) => setProgramDraft((prev) => ({ ...prev, type: e.target.value }))} placeholder="program type" />
          <input value={programDraft.title} onChange={(e) => setProgramDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="title" />
          <input value={programDraft.capacity} onChange={(e) => setProgramDraft((prev) => ({ ...prev, capacity: e.target.value }))} placeholder="default capacity" />
          <button onClick={createProgram} disabled={pending !== ''}>{pending === 'create-program' ? 'Saving...' : 'Create Program'}</button>
        </div>
        {state.program ? <p className="small">Program: {state.program.id} - {state.program.title}</p> : null}
      </section>

      <section className="route-block">
        <h3>2) Coach + Availability</h3>
        <div className="row wrap">
          <input value={coachDraft.name} onChange={(e) => setCoachDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="coach name" />
          <input value={coachDraft.qualifications} onChange={(e) => setCoachDraft((prev) => ({ ...prev, qualifications: e.target.value }))} placeholder="qualifications csv" />
          <input value={coachDraft.contact} onChange={(e) => setCoachDraft((prev) => ({ ...prev, contact: e.target.value }))} placeholder="coach contact" />
          <button onClick={createCoach} disabled={pending !== ''}>{pending === 'create-coach' ? 'Saving...' : 'Create Coach'}</button>
        </div>
        <div className="row wrap">
          <input value={availabilityDraft.startAtUtc} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, startAtUtc: e.target.value }))} placeholder="availability start" />
          <input value={availabilityDraft.endAtUtc} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, endAtUtc: e.target.value }))} placeholder="availability end" />
          <input value={availabilityDraft.timezone} onChange={(e) => setAvailabilityDraft((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="timezone" />
          <button onClick={saveAvailability} disabled={!state.coach?.id || pending !== ''}>{pending === 'create-availability' ? 'Saving...' : 'Save Availability'}</button>
        </div>
      </section>

      <section className="route-block">
        <h3>3) Schedule Session</h3>
        <div className="row wrap">
          <input value={sessionDraft.venueId} onChange={(e) => setSessionDraft((prev) => ({ ...prev, venueId: e.target.value }))} placeholder="venue id" />
          <input value={sessionDraft.startAtUtc} onChange={(e) => setSessionDraft((prev) => ({ ...prev, startAtUtc: e.target.value }))} placeholder="session start" />
          <input value={sessionDraft.endAtUtc} onChange={(e) => setSessionDraft((prev) => ({ ...prev, endAtUtc: e.target.value }))} placeholder="session end" />
          <input value={sessionDraft.timezone} onChange={(e) => setSessionDraft((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="timezone" />
          <input value={sessionDraft.capacity} onChange={(e) => setSessionDraft((prev) => ({ ...prev, capacity: e.target.value }))} placeholder="capacity" />
          <button onClick={createSession} disabled={!sessionReady || pending !== ''}>{pending === 'create-session' ? 'Scheduling...' : 'Create Session'}</button>
        </div>
        {state.session ? <p className="small">Session {state.session.id} | coach availability enforced by backend validation.</p> : null}
      </section>

      <section className="route-block">
        <h3>4) Registrations, Waitlist, and Penalties</h3>
        <div className="row wrap">
          <input value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="participant id" />
          <button onClick={registerParticipant} disabled={!state.session?.id || pending !== ''}>{pending === 'register' ? 'Registering...' : 'Register Participant'}</button>
        </div>
        {state.registrations.length === 0 ? <p className="small">No registrations yet.</p> : (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Participant</th>
                <th>Status</th>
                <th>Waitlist</th>
              </tr>
            </thead>
            <tbody>
              {state.registrations.map((row) => (
                <tr key={row.registrationId}>
                  <td>{row.registrationId}</td>
                  <td>{row.participantId}</td>
                  <td>{row.status}</td>
                  <td>{row.waitlistPosition || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row wrap">
          <select value={selectedRegistrationId} onChange={(e) => setSelectedRegistrationId(e.target.value)}>
            <option value="">registration id</option>
            {activeRegistrations.map((item) => (
              <option key={item.registrationId} value={item.registrationId}>{item.registrationId}</option>
            ))}
          </select>
          <button onClick={cancelRegistration} disabled={!selectedRegistrationId || pending !== ''}>{pending === 'cancel-registration' ? 'Submitting...' : 'Late/Normal Cancel'}</button>
          <button onClick={markNoShow} disabled={!selectedRegistrationId || pending !== ''}>{pending === 'no-show' ? 'Submitting...' : 'Mark No-Show'}</button>
        </div>
        <div className="row wrap">
          <input value={selectedWaitlistEntryId} onChange={(e) => setSelectedWaitlistEntryId(e.target.value)} placeholder="promoted waitlist entry id" />
          <button onClick={confirmWaitlist} disabled={!selectedWaitlistEntryId || pending !== ''}>{pending === 'confirm-waitlist' ? 'Confirming...' : 'Confirm Waitlist Promotion'}</button>
        </div>
      </section>

      <section className="route-block">
        <h3>5) Credits and Notifications</h3>
        <div className="row wrap">
          <input value={creditsParticipantId} onChange={(e) => setCreditsParticipantId(e.target.value)} placeholder="participant id for credits" />
          <button onClick={loadCredits} disabled={pending !== ''}>{pending === 'load-credits' ? 'Loading...' : 'Load Credits'}</button>
          <button onClick={loadInbox} disabled={pending !== ''}>{pending === 'load-inbox' ? 'Loading...' : 'Load Inbox Notifications'}</button>
        </div>

        {state.credits ? (
          <details>
            <summary>Credit ledger details</summary>
            <pre>{JSON.stringify(state.credits, null, 2)}</pre>
          </details>
        ) : (
          <p className="small">No credit ledger loaded yet.</p>
        )}

        {state.inbox.length > 0 ? (
          <div>
            <ul>
              {state.inbox.map((message) => (
                <li key={message.id}>{message.id} - {message.title} <span className="small">({message.type})</span></li>
              ))}
            </ul>
            <div className="row wrap">
              <input value={inboxMessageId} onChange={(e) => setInboxMessageId(e.target.value)} placeholder="message id" />
              <button onClick={printInboxPayload} disabled={!inboxMessageId || pending !== ''}>{pending === 'print-inbox' ? 'Fetching...' : 'Mark Read + Printable Output'}</button>
            </div>
          </div>
        ) : (
          <p className="small">No inbox messages loaded yet.</p>
        )}

        {state.printable ? (
          <details>
            <summary>Printable output payload</summary>
            <pre>{JSON.stringify(state.printable, null, 2)}</pre>
          </details>
        ) : null}
      </section>
    </article>
  );
}

export default ProgramsTab;
