import { useState } from 'react';
import { useFormState } from '../hooks/useFormState';

const defaultExportForm = {
  resource: 'participants',
  format: 'CSV',
  fieldsText: 'name,phone,email,notes'
};

const defaultExportState = { exportJobId: '', exportResult: null, artifacts: [] };

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

function ExportsTab({ apiRequest, csrfToken, acquireStepUpTokenFor, setMessage, setError }) {
  const [exportForm, updateExportForm] = useFormState(defaultExportForm);
  const [exportState, setExportState] = useState(defaultExportState);
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

  const requestExport = () =>
    runAction(async () => {
      const fields = exportForm.fieldsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (fields.length === 0) {
        throw new Error('At least one export field is required');
      }

      const stepUpData = await acquireStepUpTokenFor('EXPORT_CREATE');
      const created = await apiRequest({
        path: '/exports',
        method: 'POST',
        csrfToken,
        stepUpToken: stepUpData.stepUpToken,
        body: {
          resource: exportForm.resource,
          format: exportForm.format,
          filters: {},
          fields
        },
        allowQueue: false
      });
      setExportState((prev) => ({
        ...prev,
        exportJobId: created.data.exportJobId,
        exportResult: { exportJobId: created.data.exportJobId, status: created.data.status }
      }));
      setMessage(`Export requested: ${created.data.exportJobId}`);
    });

  const refreshExportStatus = () =>
    runAction(async () => {
      if (!exportState.exportJobId) {
        throw new Error('Request an export first');
      }
      const fetched = await apiRequest({ path: `/exports/${exportState.exportJobId}`, method: 'GET', allowQueue: false });
      setExportState((prev) => ({ ...prev, exportResult: fetched.data }));
      setMessage(`Export status: ${fetched.data.status}`);
    });

  const loadReconciliationArtifacts = () =>
    runAction(async () => {
      const artifacts = await apiRequest({ path: '/admin/reconciliation/artifacts', method: 'GET', allowQueue: false });
      setExportState((prev) => ({ ...prev, artifacts: artifacts.data || [] }));
      setMessage(`Loaded ${artifacts.data?.length || 0} reconciliation artifacts`);
    });

  return (
    <article className="card">
      <h2>Exports & Reconciliation</h2>

      <section className="route-block">
        <h3>Step 1) Request Export</h3>
        <div className="row wrap">
          <input value={exportForm.resource} onChange={(e) => updateExportForm('resource', e.target.value)} placeholder="resource" />
          <select value={exportForm.format} onChange={(e) => updateExportForm('format', e.target.value)}>
            <option value="CSV">CSV</option>
            <option value="JSON">JSON</option>
          </select>
          <input value={exportForm.fieldsText} onChange={(e) => updateExportForm('fieldsText', e.target.value)} placeholder="fields csv" />
          <button onClick={requestExport} disabled={pending}>{pending ? 'Submitting...' : 'Request Export (Step-Up)'}</button>
        </div>
        <p className="small">Export job id: {exportState.exportJobId || 'none'}</p>
      </section>

      <section className="route-block">
        <h3>Step 2) Track Job and Artifacts</h3>
        <div className="row wrap">
          <button onClick={refreshExportStatus} disabled={pending || !exportState.exportJobId}>{pending ? 'Refreshing...' : 'Refresh Job Status'}</button>
          <button onClick={loadReconciliationArtifacts} disabled={pending}>{pending ? 'Loading...' : 'Load Reconciliation Artifacts'}</button>
        </div>

        {exportState.exportResult ? (
          <div className="summary-grid">
            <div className="summary-card"><p className="small">Status</p><p><span className={statusClass(exportState.exportResult.status)}>{exportState.exportResult.status}</span></p></div>
            <div className="summary-card"><p className="small">Artifact</p><p>{exportState.exportResult.artifactPath || '-'}</p></div>
            <div className="summary-card"><p className="small">Checksum</p><p>{exportState.exportResult.checksumSha256 || '-'}</p></div>
          </div>
        ) : (
          <p className="small">No export job status loaded yet.</p>
        )}

        {(exportState.exportResult?.maskingPreview || []).length > 0 ? (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {exportState.exportResult.maskingPreview.map((item, index) => (
                <tr key={`${item.field}-${index}`}>
                  <td>{item.field}</td>
                  <td>{item.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {exportState.artifacts.length > 0 ? (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ID</th>
                <th>Status</th>
                <th>Artifact</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {exportState.artifacts.map((artifact) => (
                <tr key={`${artifact.type}-${artifact.id}`}>
                  <td>{artifact.type}</td>
                  <td>{artifact.id}</td>
                  <td><span className={statusClass(artifact.status)}>{artifact.status}</span></td>
                  <td>{artifact.artifactPath || '-'}</td>
                  <td>{formatDateTime(artifact.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="small">No reconciliation artifacts loaded yet.</p>
        )}
      </section>
    </article>
  );
}

export default ExportsTab;
