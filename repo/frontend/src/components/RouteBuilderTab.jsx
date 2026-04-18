import { useMemo, useState } from 'react';
import { validateRouteSegmentInput } from '../validators/forms';

const isQueued = (response) => response?.data?.queued === true;

const SEGMENT_TYPES = [
  { value: 'REQUIRED_NEXT', label: 'Required Next', color: '#1f7a4d' },
  { value: 'OPTIONAL_BRANCH', label: 'Optional Branch', color: '#2a6fb0' },
  { value: 'ACCESSIBILITY_DETOUR', label: 'Accessibility Detour', color: '#b24a2d' }
];

const typeMeta = Object.fromEntries(SEGMENT_TYPES.map((item) => [item.value, item]));

const layoutNode = (index, count) => {
  const columns = Math.max(2, Math.ceil(Math.sqrt(count || 1)));
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: 120 + column * 220,
    y: 90 + row * 120
  };
};

const reorderSegments = (segments) => segments.map((segment, index) => ({ ...segment, order: index + 1 }));

function RouteBuilderTab({ apiRequest, csrfToken, setMessage, setError, acquireStepUpTokenFor }) {
  const [setupForm, setSetupForm] = useState({
    venueName: 'Main Venue',
    timezone: 'America/New_York',
    hallName: 'Hall A',
    zoneName: 'Zone 1',
    routeName: 'Highlights Walk'
  });
  const [hierarchy, setHierarchy] = useState({
    venueId: '',
    hallId: '',
    zoneId: '',
    routeId: '',
    venueName: '',
    hallName: '',
    zoneName: '',
    routeName: ''
  });
  const [newCaseName, setNewCaseName] = useState('Case 1');
  const [cases, setCases] = useState([]);
  const [segmentForm, setSegmentForm] = useState({
    fromCaseId: '',
    toCaseId: '',
    segmentType: 'REQUIRED_NEXT',
    dwellMinutes: '4',
    distanceMeters: '40'
  });
  const [segments, setSegments] = useState([]);
  const [segmentsCommitted, setSegmentsCommitted] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  const [accessibilityMode, setAccessibilityMode] = useState(true);
  const [optionalBranchSelections, setOptionalBranchSelections] = useState({});
  const [nodePicker, setNodePicker] = useState({ fromCaseId: '', toCaseId: '' });
  const [localIssue, setLocalIssue] = useState('');
  const [pending, setPending] = useState('');

  const caseMap = useMemo(() => {
    const map = new Map();
    for (const item of cases) {
      map.set(item.id, item);
    }
    return map;
  }, [cases]);

  const canvasNodes = useMemo(
    () =>
      cases.map((item, index) => ({
        ...item,
        ...layoutNode(index, cases.length)
      })),
    [cases]
  );

  const run = async (key, fn) => {
    if (pending) {
      return;
    }
    setPending(key);
    setError('');
    setMessage('');
    setLocalIssue('');
    try {
      await fn();
    } catch (err) {
      const message = err.message || 'Route operation failed';
      setError(message);
      setLocalIssue(message);
    } finally {
      setPending('');
    }
  };

  const createHierarchy = () =>
    run('create-hierarchy', async () => {
      if (!setupForm.venueName.trim() || !setupForm.hallName.trim() || !setupForm.zoneName.trim() || !setupForm.routeName.trim()) {
        throw new Error('Venue, hall, zone, and route names are all required');
      }
      const venue = await apiRequest({
        path: '/venues',
        method: 'POST',
        csrfToken,
        body: {
          name: setupForm.venueName,
          timezone: setupForm.timezone,
          defaultPaceMph: 3
        }
      });
      if (isQueued(venue)) {
        setMessage('Hierarchy creation queued offline. It will sync when back online.');
        return;
      }
      const hall = await apiRequest({
        path: `/venues/${venue.data.id}/halls`,
        method: 'POST',
        csrfToken,
        body: { name: setupForm.hallName }
      });
      if (isQueued(hall)) {
        setMessage('Hierarchy creation partially queued offline. It will sync when back online.');
        return;
      }
      const zone = await apiRequest({
        path: `/halls/${hall.data.id}/zones`,
        method: 'POST',
        csrfToken,
        body: { name: setupForm.zoneName }
      });
      if (isQueued(zone)) {
        setMessage('Hierarchy creation partially queued offline. It will sync when back online.');
        return;
      }
      const route = await apiRequest({
        path: '/routes',
        method: 'POST',
        csrfToken,
        body: {
          venueId: venue.data.id,
          name: setupForm.routeName,
          strictSequence: false,
          defaultPaceMph: 3
        }
      });
      if (isQueued(route)) {
        setMessage('Route creation queued offline. It will sync when back online.');
        return;
      }

      setHierarchy({
        venueId: venue.data.id,
        hallId: hall.data.id,
        zoneId: zone.data.id,
        routeId: route.data.routeId,
        venueName: setupForm.venueName,
        hallName: setupForm.hallName,
        zoneName: setupForm.zoneName,
        routeName: setupForm.routeName
      });
      setCases([]);
      setSegments([]);
      setSegmentsCommitted(false);
      setItinerary(null);
      setOptionalBranchSelections({});
      setNodePicker({ fromCaseId: '', toCaseId: '' });
      setMessage(`Hierarchy ready. Route ${route.data.routeId} created.`);
    });

  const addCase = () =>
    run('add-case', async () => {
      if (!hierarchy.zoneId) {
        throw new Error('Create venue/hall/zone first.');
      }
      if (!newCaseName.trim()) {
        throw new Error('Case name is required.');
      }

      const response = await apiRequest({
        path: `/zones/${hierarchy.zoneId}/display-cases`,
        method: 'POST',
        csrfToken,
        body: { name: newCaseName.trim() }
      });

      if (isQueued(response)) {
        setMessage('Display case creation queued offline. It will sync when back online.');
        return;
      }
      setCases((prev) => [...prev, { id: response.data.id, name: response.data.name }]);
      setNewCaseName(`Case ${cases.length + 2}`);
      setMessage(`Added display case ${response.data.name}.`);
    });

  const onCanvasNodeClick = (caseId) => {
    setNodePicker((prev) => {
      if (!prev.fromCaseId || (prev.fromCaseId && prev.toCaseId)) {
        return { fromCaseId: caseId, toCaseId: '' };
      }
      if (prev.fromCaseId === caseId) {
        return { fromCaseId: caseId, toCaseId: '' };
      }
      return { fromCaseId: prev.fromCaseId, toCaseId: caseId };
    });
  };

  const pullPickerIntoForm = () => {
    if (!nodePicker.fromCaseId || !nodePicker.toCaseId) {
      setLocalIssue('Pick two nodes on the canvas first.');
      return;
    }
    setSegmentForm((prev) => ({
      ...prev,
      fromCaseId: nodePicker.fromCaseId,
      toCaseId: nodePicker.toCaseId
    }));
  };

  const addSegment = () => {
    if (segmentsCommitted) {
      setLocalIssue('Segments are committed. Create a new route to edit sequence.');
      return;
    }
    const fromCaseId = segmentForm.fromCaseId || nodePicker.fromCaseId;
    const toCaseId = segmentForm.toCaseId || nodePicker.toCaseId;
    const segmentIssue = validateRouteSegmentInput({
      fromCaseId,
      toCaseId,
      dwellMinutes: segmentForm.dwellMinutes,
      distanceMeters: segmentForm.distanceMeters
    });
    if (segmentIssue) {
      setLocalIssue(segmentIssue);
      return;
    }

    setLocalIssue('');
    const next = {
      localId: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromCaseId,
      toCaseId,
      segmentType: segmentForm.segmentType,
      dwellMinutes: Number(segmentForm.dwellMinutes || 0),
      distanceMeters: Number(segmentForm.distanceMeters || 0),
      order: segments.length + 1
    };
    setSegments((prev) => reorderSegments([...prev, next]));
    setSegmentForm((prev) => ({ ...prev, fromCaseId: '', toCaseId: '' }));
    setNodePicker({ fromCaseId: '', toCaseId: '' });
  };

  const removeSegment = (localId) => {
    if (segmentsCommitted) {
      setLocalIssue('Segments are committed. Remove requires creating a new route draft.');
      return;
    }
    setSegments((prev) => reorderSegments(prev.filter((segment) => segment.localId !== localId)));
  };

  const moveSegment = (localId, direction) => {
    if (segmentsCommitted) {
      setLocalIssue('Segments are committed. Reordering is disabled after commit.');
      return;
    }
    setSegments((prev) => {
      const index = prev.findIndex((segment) => segment.localId === localId);
      if (index === -1) {
        return prev;
      }
      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.splice(target, 0, item);
      return reorderSegments(updated);
    });
  };

  const commitSegmentsToRoute = () =>
    run('commit-segments', async () => {
      if (!hierarchy.routeId) {
        throw new Error('Create hierarchy first.');
      }
      if (segments.length === 0) {
        throw new Error('Add at least one segment.');
      }

      const ordered = reorderSegments(segments);
      for (const segment of ordered) {
        await apiRequest({
          path: `/routes/${hierarchy.routeId}/segments`,
          method: 'POST',
          csrfToken,
          body: {
            fromCaseId: segment.fromCaseId,
            toCaseId: segment.toCaseId,
            segmentType: segment.segmentType,
            dwellMinutes: segment.dwellMinutes,
            distanceMeters: segment.distanceMeters,
            order: segment.order
          },
          allowQueue: false
        });
      }

      setSegments(ordered);
      setSegmentsCommitted(true);
      setMessage(`Committed ${ordered.length} segments to route ${hierarchy.routeId}.`);
    });

  const applyRouteRule = () =>
    run('apply-rule', async () => {
      if (!hierarchy.routeId) {
        throw new Error('Create hierarchy first.');
      }
      const stepUpData = await acquireStepUpTokenFor('ROUTE_RULE_CHANGE');
      await apiRequest({
        path: `/routes/${hierarchy.routeId}`,
        method: 'PATCH',
        csrfToken,
        stepUpToken: stepUpData.stepUpToken,
        body: { strictSequence: true },
        allowQueue: false
      });
      setMessage('Strict sequence rule applied with step-up.');
    });

  const toggleOptionalSelection = (localId) => {
    setOptionalBranchSelections((prev) => ({ ...prev, [localId]: !prev[localId] }));
  };

  const generateItinerary = () =>
    run('generate-itinerary', async () => {
      if (!hierarchy.routeId || !segmentsCommitted) {
        throw new Error('Commit route segments before generating itinerary.');
      }

      const optionalBranchSelectionsPayload = segments
        .filter((segment) => segment.segmentType === 'OPTIONAL_BRANCH' && optionalBranchSelections[segment.localId])
        .map((segment) => ({
          fromCaseId: segment.fromCaseId,
          toCaseId: segment.toCaseId
        }));

      const response = await apiRequest({
        path: `/routes/${hierarchy.routeId}/itineraries`,
        method: 'POST',
        csrfToken,
        body: {
          accessibilityMode,
          branchSelections: optionalBranchSelectionsPayload
        },
        allowQueue: false
      });
      setItinerary(response.data.printable);
      setMessage(
        `Itinerary generated with ${response.data.printable.steps.length} steps, estimated walk time ${response.data.estimatedWalkMinutes} minutes.`
      );
    });

  return (
    <article className="card route-builder">
      <h2>Exhibit Route Builder</h2>
      <p className="small">Create hierarchy, add display cases, author sequence + branch rules, then generate itinerary pacing at default 3 mph plus dwell times.</p>

      {localIssue ? <p className="notice err">{localIssue}</p> : null}

      <section className="route-block">
        <h3>1) Hierarchy Setup</h3>
        <div className="row wrap">
          <input value={setupForm.venueName} onChange={(e) => setSetupForm((prev) => ({ ...prev, venueName: e.target.value }))} placeholder="venue" />
          <input value={setupForm.timezone} onChange={(e) => setSetupForm((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="timezone" />
          <input value={setupForm.hallName} onChange={(e) => setSetupForm((prev) => ({ ...prev, hallName: e.target.value }))} placeholder="hall" />
          <input value={setupForm.zoneName} onChange={(e) => setSetupForm((prev) => ({ ...prev, zoneName: e.target.value }))} placeholder="zone" />
          <input value={setupForm.routeName} onChange={(e) => setSetupForm((prev) => ({ ...prev, routeName: e.target.value }))} placeholder="route name" />
          <button onClick={createHierarchy} disabled={pending !== ''}>{pending === 'create-hierarchy' ? 'Creating...' : 'Create Hierarchy + Route'}</button>
          <button onClick={applyRouteRule} disabled={!hierarchy.routeId || pending !== ''}>{pending === 'apply-rule' ? 'Applying...' : 'Apply Strict Sequence'}</button>
        </div>
        {hierarchy.routeId ? (
          <div className="hierarchy-chip-grid">
            <span className="hierarchy-chip">Venue: {hierarchy.venueName}</span>
            <span className="hierarchy-chip">Hall: {hierarchy.hallName}</span>
            <span className="hierarchy-chip">Zone: {hierarchy.zoneName}</span>
            <span className="hierarchy-chip">Route: {hierarchy.routeName}</span>
          </div>
        ) : (
          <p className="small">No hierarchy yet. Start by creating venue/hall/zone/route.</p>
        )}
      </section>

      <section className="route-block route-layout">
        <div className="route-sidebar">
          <h3>2) Hierarchy Context</h3>
          <ul className="hierarchy-tree">
            <li><strong>{hierarchy.venueName || 'Venue'}</strong></li>
            <li className="nested">{hierarchy.hallName || 'Hall'}</li>
            <li className="nested2">{hierarchy.zoneName || 'Zone'}</li>
            {cases.map((item) => (
              <li key={item.id} className="nested3">Case: {item.name}</li>
            ))}
          </ul>

          <div className="row wrap">
            <input value={newCaseName} onChange={(e) => setNewCaseName(e.target.value)} placeholder="new display case" />
            <button onClick={addCase} disabled={!hierarchy.zoneId || pending !== ''}>{pending === 'add-case' ? 'Adding...' : 'Add Case Node'}</button>
          </div>

          <h3>Legend</h3>
          <ul className="legend-list">
            {SEGMENT_TYPES.map((item) => (
              <li key={item.value}>
                <span className="legend-color" style={{ backgroundColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="route-canvas-wrap">
          <h3>3) Visual Route Canvas</h3>
          {cases.length === 0 ? (
            <p className="small">Add display cases to see route nodes and connect them.</p>
          ) : (
            <svg className="route-canvas" viewBox="0 0 980 460" role="img" aria-label="Route node graph">
              <defs>
                <marker id="route-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L7,3 z" fill="#2f6f76" />
                </marker>
              </defs>

              {segments.map((segment) => {
                const fromNode = canvasNodes.find((node) => node.id === segment.fromCaseId);
                const toNode = canvasNodes.find((node) => node.id === segment.toCaseId);
                if (!fromNode || !toNode) {
                  return null;
                }
                const color = typeMeta[segment.segmentType]?.color || '#2f6f76';
                const midX = (fromNode.x + toNode.x) / 2;
                const midY = (fromNode.y + toNode.y) / 2;
                return (
                  <g key={segment.localId}>
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke={color}
                      strokeWidth="3"
                      markerEnd="url(#route-arrow)"
                    />
                    <text x={midX + 6} y={midY - 8} className="edge-label">
                      {segment.order}. {typeMeta[segment.segmentType]?.label || segment.segmentType}
                    </text>
                  </g>
                );
              })}

              {canvasNodes.map((node) => {
                const selected = nodePicker.fromCaseId === node.id || nodePicker.toCaseId === node.id;
                return (
                  <g key={node.id} onClick={() => onCanvasNodeClick(node.id)} className="node-clickable">
                    <circle cx={node.x} cy={node.y} r="28" className={selected ? 'node-circle selected' : 'node-circle'} />
                    <text x={node.x} y={node.y + 4} textAnchor="middle" className="node-label">
                      {node.name.slice(0, 12)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </section>

      <section className="route-block">
        <h3>4) Segment Editor</h3>
        <p className="small">Click two nodes on canvas to prefill From/To, then configure segment type, dwell, and distance.</p>
        <div className="row wrap">
          <select value={segmentForm.fromCaseId} onChange={(e) => setSegmentForm((prev) => ({ ...prev, fromCaseId: e.target.value }))}>
            <option value="">from case</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select value={segmentForm.toCaseId} onChange={(e) => setSegmentForm((prev) => ({ ...prev, toCaseId: e.target.value }))}>
            <option value="">to case</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select value={segmentForm.segmentType} onChange={(e) => setSegmentForm((prev) => ({ ...prev, segmentType: e.target.value }))}>
            {SEGMENT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <input value={segmentForm.dwellMinutes} onChange={(e) => setSegmentForm((prev) => ({ ...prev, dwellMinutes: e.target.value }))} placeholder="dwell minutes" />
          <input value={segmentForm.distanceMeters} onChange={(e) => setSegmentForm((prev) => ({ ...prev, distanceMeters: e.target.value }))} placeholder="distance meters" />
          <button onClick={pullPickerIntoForm} disabled={pending !== ''}>Use Node Picks</button>
          <button onClick={addSegment} disabled={segmentsCommitted || cases.length < 2 || pending !== ''}>Add Segment</button>
        </div>

        {segments.length === 0 ? (
          <p className="small">No segments yet. Add links to orchestrate visitor flow.</p>
        ) : (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
                <th>Dwell</th>
                <th>Distance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <tr key={segment.localId}>
                  <td>{segment.order}</td>
                  <td>{caseMap.get(segment.fromCaseId)?.name || segment.fromCaseId}</td>
                  <td>{caseMap.get(segment.toCaseId)?.name || segment.toCaseId}</td>
                  <td>{typeMeta[segment.segmentType]?.label || segment.segmentType}</td>
                  <td>{segment.dwellMinutes}</td>
                  <td>{segment.distanceMeters}</td>
                  <td>
                    <button onClick={() => moveSegment(segment.localId, -1)} disabled={segmentsCommitted || pending !== ''}>Up</button>
                    <button onClick={() => moveSegment(segment.localId, 1)} disabled={segmentsCommitted || pending !== ''}>Down</button>
                    <button onClick={() => removeSegment(segment.localId)} disabled={segmentsCommitted || pending !== ''}>Remove</button>
                    {segment.segmentType === 'OPTIONAL_BRANCH' ? (
                      <label className="branch-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(optionalBranchSelections[segment.localId])}
                          onChange={() => toggleOptionalSelection(segment.localId)}
                          disabled={pending !== ''}
                        />
                        include
                      </label>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="row wrap">
          <button onClick={commitSegmentsToRoute} disabled={segmentsCommitted || segments.length === 0 || pending !== ''}>{pending === 'commit-segments' ? 'Committing...' : 'Commit Segments To API'}</button>
          <label className="branch-toggle">
            <input type="checkbox" checked={accessibilityMode} onChange={(e) => setAccessibilityMode(e.target.checked)} disabled={pending !== ''} />
            accessibility mode
          </label>
          <button onClick={generateItinerary} disabled={!segmentsCommitted || pending !== ''}>{pending === 'generate-itinerary' ? 'Generating...' : 'Generate Itinerary'}</button>
        </div>

        {itinerary ? (
          <div>
            <h3>5) Printable Itinerary Preview</h3>
            <p className="small">Estimated walk time: {itinerary.estimatedWalkMinutes} minutes (3 mph pace baseline + dwell minutes).</p>
            <ol>
              {itinerary.steps.map((step) => (
                <li key={`${step.step}-${step.fromCaseId}-${step.toCaseId}`}>
                  <strong>{step.segmentType}</strong> {caseMap.get(step.fromCaseId)?.name || step.fromCaseId} {'->'} {caseMap.get(step.toCaseId)?.name || step.toCaseId} ({step.distanceMeters}m, {step.dwellMinutes}m dwell)
                </li>
              ))}
            </ol>
            {import.meta?.env?.MODE !== 'production' ? (
              <details>
                <summary>Advanced debug JSON (dev only)</summary>
                <pre>{JSON.stringify(itinerary, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="small">Commit segments and generate itinerary to view print output.</p>
        )}
      </section>
    </article>
  );
}

export default RouteBuilderTab;
