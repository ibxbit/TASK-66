import { useState } from 'react';
import { useFormState } from '../hooks/useFormState';

const defaultAuditFilters = {
  action: '',
  actorId: '',
  entityType: '',
  from: '',
  to: '',
  page: '1',
  pageSize: '20',
  sort: 'newest'
};

const defaultAuditState = { events: [], pagination: null };

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const summarizeMetadata = (metadata) => {
  const entries = Object.entries(metadata || {});
  if (entries.length === 0) return 'none';
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' | ');
};

function AuditTab({ apiRequest, setMessage, setError }) {
  const [auditFilters, updateAuditFilters] = useFormState(defaultAuditFilters);
  const [auditState, setAuditState] = useState(defaultAuditState);
  const [pending, setPending] = useState(false);

  const loadAudit = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const query = {
        page: auditFilters.page,
        pageSize: auditFilters.pageSize
      };
      if (auditFilters.action) query['filter[action]'] = auditFilters.action;
      if (auditFilters.actorId) query['filter[actorId]'] = auditFilters.actorId;
      if (auditFilters.entityType) query['filter[entityType]'] = auditFilters.entityType;
      if (auditFilters.from) query['filter[from]'] = auditFilters.from;
      if (auditFilters.to) query['filter[to]'] = auditFilters.to;

      const response = await apiRequest({ path: '/audit/events', method: 'GET', query, allowQueue: false });
      const events = [...(response.data || [])];
      if (auditFilters.sort === 'oldest') {
        events.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      }
      setAuditState({ events, pagination: response.pagination });
      setMessage('Audit events loaded');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="card">
      <h2>Audit View</h2>
      <div className="row wrap">
        <input value={auditFilters.action} onChange={(e) => updateAuditFilters('action', e.target.value)} placeholder="action" />
        <input value={auditFilters.actorId} onChange={(e) => updateAuditFilters('actorId', e.target.value)} placeholder="actor id" />
        <input value={auditFilters.entityType} onChange={(e) => updateAuditFilters('entityType', e.target.value)} placeholder="entity type" />
        <input value={auditFilters.from} onChange={(e) => updateAuditFilters('from', e.target.value)} placeholder="from ISO date" />
        <input value={auditFilters.to} onChange={(e) => updateAuditFilters('to', e.target.value)} placeholder="to ISO date" />
        <input value={auditFilters.page} onChange={(e) => updateAuditFilters('page', e.target.value)} placeholder="page" />
        <input value={auditFilters.pageSize} onChange={(e) => updateAuditFilters('pageSize', e.target.value)} placeholder="page size" />
        <select value={auditFilters.sort} onChange={(e) => updateAuditFilters('sort', e.target.value)}>
          <option value="newest">newest first</option>
          <option value="oldest">oldest first</option>
        </select>
        <button onClick={loadAudit} disabled={pending}>{pending ? 'Loading...' : 'Load Audit Events'}</button>
      </div>
      <p className="small">
        Events: {auditState.events?.length || 0}
        {auditState.pagination
          ? ` | page ${auditState.pagination.page} of ${auditState.pagination.totalPages}`
          : ''}
      </p>
      {(auditState.events || []).length > 0 ? (
        <table className="segment-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {auditState.events.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td>{event.actorId}</td>
                <td>{event.action}</td>
                <td>{event.entityType} / {event.entityId}</td>
                <td>{summarizeMetadata(event.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="small">No audit events found for this filter set.</p>
      )}
    </article>
  );
}

export default AuditTab;
