import { useState } from 'react';
import { useFormState } from '../hooks/useFormState';

const isQueued = (response) => response?.data?.queued === true;

const defaultInboxFilters = { unread: 'false', type: '' };
const defaultInboxState = { messages: [], selectedMessageId: '', printable: null };

const statusClass = (value) => {
  const status = String(value || '').toUpperCase();
  if (['SUCCESS', 'COMPLETED', 'VALID', 'ACTIVE', 'TRIGGERED', 'READ'].includes(status)) {
    return 'status-badge status-success';
  }
  if (['FAILED', 'ERROR', 'INVALID', 'REJECTED'].includes(status)) {
    return 'status-badge status-error';
  }
  return 'status-badge status-pending';
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

function InboxTab({ apiRequest, csrfToken, setMessage, setError }) {
  const [inboxFilters, updateInboxFilters] = useFormState(defaultInboxFilters);
  const [inboxState, setInboxState] = useState(defaultInboxState);
  const [pending, setPending] = useState(false);

  const runAction = async (fn) => {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setPending(false);
    }
  };

  const loadInbox = () =>
    runAction(async () => {
      const query = {
        'filter[unread]': inboxFilters.unread
      };
      if (inboxFilters.type) {
        query['filter[type]'] = inboxFilters.type;
      }
      const response = await apiRequest({ path: '/inbox/messages', method: 'GET', query, allowQueue: false });
      setInboxState((prev) => ({ ...prev, messages: response.data || [] }));
      setMessage(`Loaded ${response.data?.length || 0} inbox messages`);
    });

  const readAndPrintMessage = () =>
    runAction(async () => {
      if (!inboxState.selectedMessageId) {
        throw new Error('Select a message id first');
      }
      const readResponse = await apiRequest({
        path: `/inbox/messages/${inboxState.selectedMessageId}/read`,
        method: 'POST',
        csrfToken
      });
      if (isQueued(readResponse)) {
        setMessage('Message read status queued offline. It will sync when back online.');
        return;
      }
      const printable = await apiRequest({ path: `/inbox/messages/${inboxState.selectedMessageId}/print`, method: 'POST', csrfToken, allowQueue: false });
      setInboxState((prev) => ({
        ...prev,
        messages: (prev.messages || []).map((item) =>
          item.id === inboxState.selectedMessageId ? { ...item, readAt: readResponse.data.readAt } : item
        ),
        printable: printable.data
      }));
      setMessage('Message marked read and printable payload fetched');
    });

  return (
    <article className="card">
      <h2>Inbox Notifications</h2>
      <div className="row wrap">
        <select value={inboxFilters.unread} onChange={(e) => updateInboxFilters('unread', e.target.value)}>
          <option value="false">read messages</option>
          <option value="true">unread messages</option>
        </select>
        <input value={inboxFilters.type} onChange={(e) => updateInboxFilters('type', e.target.value)} placeholder="type filter" />
        <button onClick={loadInbox} disabled={pending}>{pending ? 'Loading...' : 'Load Inbox'}</button>
        <input value={inboxState.selectedMessageId} onChange={(e) => setInboxState((prev) => ({ ...prev, selectedMessageId: e.target.value }))} placeholder="message id" />
        <button onClick={readAndPrintMessage} disabled={pending || !inboxState.selectedMessageId}>{pending ? 'Processing...' : 'Read + Print'}</button>
      </div>

      {(inboxState.messages || []).length > 0 ? (
        <table className="segment-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Type</th>
              <th>Title</th>
              <th>Created</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {inboxState.messages.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.type}</td>
                <td>{item.title}</td>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>
                  <span className={statusClass(item.readAt ? 'READ' : 'UNREAD')}>
                    {item.readAt ? 'READ' : 'UNREAD'}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => setInboxState((prev) => ({ ...prev, selectedMessageId: item.id }))}
                    className="ghost"
                  >
                    Select
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="small">No inbox messages for current filter.</p>
      )}

      {inboxState.printable?.printable ? (
        <table className="segment-table">
          <thead>
            <tr>
              <th colSpan="2">Printable Payload ({inboxState.printable.messageId})</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(inboxState.printable.printable).map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}

export default InboxTab;
