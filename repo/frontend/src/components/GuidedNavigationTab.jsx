import { useState } from 'react';

function GuidedNavigationTab({ apiRequest, setMessage, setError }) {
  const [routeId, setRouteId] = useState('');
  const [routeData, setRouteData] = useState(null);
  const [itineraries, setItineraries] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [pending, setPending] = useState(false);
  const [discoveryPending, setDiscoveryPending] = useState(false);

  const discoverRoutes = async () => {
    if (discoveryPending) return;
    setDiscoveryPending(true);
    try {
      const response = await apiRequest({ path: '/routes', method: 'GET', query: { pageSize: 50 }, allowQueue: false });
      const routes = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setAvailableRoutes(routes);
      setMessage(`Found ${routes.length} available route(s)`);
    } catch (err) {
      setError(err.message || 'Failed to discover routes');
    } finally {
      setDiscoveryPending(false);
    }
  };

  const loadRoute = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (!routeId) {
        throw new Error('Enter a route id first');
      }
      const route = await apiRequest({ path: `/routes/${routeId}`, method: 'GET', allowQueue: false });
      const itineraryList = await apiRequest({ path: `/routes/${routeId}/itineraries`, method: 'GET', allowQueue: false });
      setRouteData(route.data);
      setItineraries(itineraryList.data || []);
      setMessage(`Loaded guided navigation for route ${routeId}`);
    } catch (err) {
      setError(err.message || 'Failed to load route');
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="card">
      <h2>Guided Navigation</h2>
      <p className="small">Read-only route consumption for operational users with ROUTE_READ.</p>
      <div className="row wrap">
        <button onClick={discoverRoutes} disabled={discoveryPending}>{discoveryPending ? 'Discovering...' : 'Discover Routes'}</button>
        {availableRoutes.length > 0 ? (
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Select a route</option>
            {availableRoutes.map((r) => (
              <option key={r.routeId || r.id} value={r.routeId || r.id}>{r.name || r.routeId || r.id}</option>
            ))}
          </select>
        ) : null}
        <input value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="route id (e.g. rte_xxxxxxxx)" />
        <button onClick={loadRoute} disabled={pending}>{pending ? 'Loading...' : 'Load Route'}</button>
      </div>

      {routeData ? (
        <div>
          <h3>{routeData.name}</h3>
          <p className="small">Route: {routeData.routeId} | strictSequence: {String(routeData.strictSequence)} | pace: {routeData.defaultPaceMph} mph</p>
          <h3>Segments</h3>
          <ol>
            {(routeData.segments || []).map((segment) => (
              <li key={segment.id}>
                <strong>{segment.segmentType}</strong> {segment.fromCaseId} {'->'} {segment.toCaseId} ({segment.distanceMeters}m, {segment.dwellMinutes}m dwell)
              </li>
            ))}
          </ol>

          <h3>Printable Itineraries</h3>
          {itineraries.length === 0 ? <p className="small">No generated itineraries yet for this route.</p> : null}
          {itineraries.map((item) => (
            <details key={item.itineraryId}>
              <summary>{item.itineraryId} - {item.estimatedWalkMinutes} min (generated {new Date(item.generatedAt).toLocaleString()})</summary>
              <ol>
                {(item.printable?.steps || []).map((step) => (
                  <li key={`${item.itineraryId}-${step.step}-${step.fromCaseId}-${step.toCaseId}`}>
                    <strong>{step.segmentType}</strong> {step.fromCaseId} {'->'} {step.toCaseId} ({step.distanceMeters}m, {step.dwellMinutes}m dwell)
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default GuidedNavigationTab;
