import { useState } from 'react';
import { useFormState } from '../hooks/useFormState';

const isQueued = (response) => response?.data?.queued === true;

const defaultAnalyticsForm = {
  metricKey: 'weekly_bookings',
  metricDimensions: 'date:DATE,program:STRING,venue:STRING',
  metricGroupBy: 'date',
  ruleKey: 'bookings_drop_wow_30',
  dashboardName: 'Operations Dashboard',
  reportName: 'Daily Program Reconciliation',
  reportDataset: 'program_registrations',
  reportFormat: 'CSV',
  reportTime: '02:00',
  reportTimezone: 'America/New_York'
};

const defaultAnalyticsState = {
  metric: null,
  anomalyRule: null,
  dashboard: null,
  reportDefinition: null,
  reportRuns: [],
  lastRun: null
};

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

const parseDimensions = (text) => {
  if (!text || !text.trim()) return [];
  return text.split(',').map((entry) => {
    const [key, type] = entry.trim().split(':');
    return { key: (key || '').trim(), type: (type || 'STRING').trim().toUpperCase() };
  }).filter((d) => d.key);
};

function AnalyticsTab({ apiRequest, csrfToken, setMessage, setError }) {
  const [analyticsForm, updateAnalytics] = useFormState(defaultAnalyticsForm);
  const [analyticsState, setAnalyticsState] = useState(defaultAnalyticsState);
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

  const saveMetricAndRule = () =>
    runAction(async () => {
      const dimensions = parseDimensions(analyticsForm.metricDimensions);
      const metric = await apiRequest({
        path: '/analytics/metrics',
        method: 'POST',
        csrfToken,
        body: {
          key: analyticsForm.metricKey,
          name: 'Weekly Bookings',
          dataset: 'registrations',
          aggregation: 'count',
          dimensions,
          groupBy: analyticsForm.metricGroupBy || undefined
        }
      });
      if (isQueued(metric)) {
        setMessage('Metric creation queued offline. It will sync when back online.');
        return;
      }
      const rule = await apiRequest({
        path: '/analytics/anomaly-rules',
        method: 'POST',
        csrfToken,
        body: {
          ruleKey: analyticsForm.ruleKey,
          metricKey: analyticsForm.metricKey,
          thresholdPercent: 30,
          minBaselineCount: 20
        }
      });
      if (isQueued(rule)) {
        setAnalyticsState((prev) => ({ ...prev, metric: metric.data }));
        setMessage('Anomaly rule creation queued offline. It will sync when back online.');
        return;
      }
      setAnalyticsState((prev) => ({ ...prev, metric: metric.data, anomalyRule: rule.data }));
      setMessage('Metric and anomaly rule saved');
    });

  const createDashboard = () =>
    runAction(async () => {
      const dash = await apiRequest({
        path: '/analytics/dashboards',
        method: 'POST',
        csrfToken,
        body: {
          name: analyticsForm.dashboardName,
          tiles: [{ metric: analyticsForm.metricKey }],
          anomalyRules: [analyticsForm.ruleKey]
        }
      });
      if (isQueued(dash)) {
        setMessage('Dashboard creation queued offline. It will sync when back online.');
        return;
      }
      const dashData = await apiRequest({
        path: `/analytics/dashboards/${dash.data.dashboardId}`,
        method: 'GET',
        allowQueue: false
      });
      setAnalyticsState((prev) => ({ ...prev, dashboard: dashData.data }));
      setMessage(`Dashboard created: ${dash.data.dashboardId}`);
    });

  const createReportDefinition = () =>
    runAction(async () => {
      const reportDimensions = parseDimensions(analyticsForm.metricDimensions);
      const report = await apiRequest({
        path: '/analytics/reports',
        method: 'POST',
        csrfToken,
        body: {
          name: analyticsForm.reportName,
          dataset: analyticsForm.reportDataset,
          format: analyticsForm.reportFormat,
          dimensions: reportDimensions.length > 0 ? reportDimensions : undefined,
          groupBy: analyticsForm.metricGroupBy || undefined,
          schedule: { time: analyticsForm.reportTime, timezone: analyticsForm.reportTimezone }
        }
      });
      if (isQueued(report)) {
        setMessage('Report definition queued offline. It will sync when back online.');
        return;
      }
      setAnalyticsState((prev) => ({ ...prev, reportDefinition: report.data }));
      setMessage(`Report definition saved: ${report.data.reportId}`);
    });

  const runReportNow = () =>
    runAction(async () => {
      const reportId = analyticsState.reportDefinition?.reportId;
      if (!reportId) {
        throw new Error('Create report definition before running report');
      }
      const run = await apiRequest({
        path: `/analytics/reports/${reportId}/run`,
        method: 'POST',
        csrfToken,
        allowQueue: false
      });
      const runs = await apiRequest({ path: `/analytics/reports/${reportId}/runs`, method: 'GET', allowQueue: false });
      setAnalyticsState((prev) => ({ ...prev, lastRun: run.data, reportRuns: runs.data || [] }));
      setMessage(`Report run completed: ${run.data.runId}`);
    });

  return (
    <article className="card">
      <h2>Analytics Dashboards</h2>

      <section className="route-block">
        <h3>Step 1) Metric and Anomaly Rule</h3>
        <div className="row wrap">
          <input value={analyticsForm.metricKey} onChange={(e) => updateAnalytics('metricKey', e.target.value)} placeholder="metric key" />
          <input value={analyticsForm.metricDimensions} onChange={(e) => updateAnalytics('metricDimensions', e.target.value)} placeholder="dimensions (key:TYPE,...)" />
          <input value={analyticsForm.metricGroupBy} onChange={(e) => updateAnalytics('metricGroupBy', e.target.value)} placeholder="group by dimension" />
          <input value={analyticsForm.ruleKey} onChange={(e) => updateAnalytics('ruleKey', e.target.value)} placeholder="anomaly rule key" />
          <button onClick={saveMetricAndRule} disabled={pending}>{pending ? 'Saving...' : 'Save Metric + Rule'}</button>
        </div>
        <p className="small">Dimension format: <code>key:TYPE</code> comma-separated. Types: DATE, STRING, NUMBER, BOOLEAN.</p>
        <div className="summary-grid">
          <div className="summary-card">
            <p className="small">Metric</p>
            <p>{analyticsState.metric?.key || 'not created'}</p>
          </div>
          <div className="summary-card">
            <p className="small">Dimensions</p>
            <p>{analyticsState.metric?.dimensions?.length > 0 ? analyticsState.metric.dimensions.map((d) => `${d.key}:${d.type}`).join(', ') : 'none'}</p>
          </div>
          <div className="summary-card">
            <p className="small">Group By</p>
            <p>{analyticsState.metric?.groupBy || 'none'}</p>
          </div>
          <div className="summary-card">
            <p className="small">Anomaly rule</p>
            <p>{analyticsState.anomalyRule?.ruleKey || 'not created'}</p>
          </div>
        </div>
      </section>

      <section className="route-block">
        <h3>Step 2) Dashboard</h3>
        <div className="row wrap">
          <input value={analyticsForm.dashboardName} onChange={(e) => updateAnalytics('dashboardName', e.target.value)} placeholder="dashboard name" />
          <button onClick={createDashboard} disabled={pending}>{pending ? 'Creating...' : 'Create Dashboard'}</button>
        </div>
        <p className="small">Dashboard ID: {analyticsState.dashboard?.dashboardId || 'none'}</p>
        {(analyticsState.dashboard?.tiles || []).length > 0 ? (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current Value</th>
              </tr>
            </thead>
            <tbody>
              {analyticsState.dashboard.tiles.map((tile, index) => (
                <tr key={`${tile.metric}-${index}`}>
                  <td>{tile.metric}</td>
                  <td>{tile.value ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="small">No dashboard tile data loaded yet.</p>
        )}
        {(analyticsState.dashboard?.anomalies || []).length > 0 ? (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {analyticsState.dashboard.anomalies.map((item) => (
                <tr key={item.rule}>
                  <td>{item.rule}</td>
                  <td><span className={statusClass(item.status)}>{item.status}</span></td>
                  <td>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="route-block">
        <h3>Step 3) Report Definition and Runs</h3>
        <div className="row wrap">
          <input value={analyticsForm.reportName} onChange={(e) => updateAnalytics('reportName', e.target.value)} placeholder="report name" />
          <input value={analyticsForm.reportDataset} onChange={(e) => updateAnalytics('reportDataset', e.target.value)} placeholder="dataset" />
          <select value={analyticsForm.reportFormat} onChange={(e) => updateAnalytics('reportFormat', e.target.value)}>
            <option value="CSV">CSV</option>
            <option value="JSON">JSON</option>
          </select>
          <input value={analyticsForm.reportTime} onChange={(e) => updateAnalytics('reportTime', e.target.value)} placeholder="02:00" />
          <input value={analyticsForm.reportTimezone} onChange={(e) => updateAnalytics('reportTimezone', e.target.value)} placeholder="timezone" />
          <button onClick={createReportDefinition} disabled={pending}>{pending ? 'Saving...' : 'Save Report Definition'}</button>
          <button onClick={runReportNow} disabled={pending || !analyticsState.reportDefinition?.reportId}>{pending ? 'Running...' : 'Run Report Now'}</button>
        </div>

        <p className="small">Report ID: {analyticsState.reportDefinition?.reportId || 'none'}</p>
        {analyticsState.lastRun ? (
          <div className="summary-grid">
            <div className="summary-card"><p className="small">Last run</p><p>{analyticsState.lastRun.runId}</p></div>
            <div className="summary-card"><p className="small">Status</p><p><span className={statusClass(analyticsState.lastRun.status)}>{analyticsState.lastRun.status}</span></p></div>
            <div className="summary-card"><p className="small">Checksum</p><p>{analyticsState.lastRun.checksumSha256 || '-'}</p></div>
          </div>
        ) : null}

        {analyticsState.reportRuns.length > 0 ? (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Artifact</th>
              </tr>
            </thead>
            <tbody>
              {analyticsState.reportRuns.map((run) => (
                <tr key={run.runId}>
                  <td>{run.runId}</td>
                  <td><span className={statusClass(run.status)}>{run.status}</span></td>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td>{formatDateTime(run.finishedAt)}</td>
                  <td>{run.artifactPath || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="small">No report runs yet.</p>
        )}
      </section>
    </article>
  );
}

export default AnalyticsTab;
