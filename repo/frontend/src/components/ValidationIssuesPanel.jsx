const severityOrder = ['BLOCKING', 'WARNING', 'INFO'];

const actionByCode = {
  DUPLICATE_NODE: 'Rename or merge duplicated nodes with the same type/label.',
  CYCLE: 'Break the cycle by removing or redirecting one edge in the loop.',
  ORPHAN_NODE: 'Connect the node with at least one incoming or outgoing edge.',
  EDGE_NODE_NOT_FOUND: 'Update the edge to reference existing nodes or recreate the missing node.',
  CONSTRAINT_ALLOWED_TARGET_TYPES: 'Update edge target node type or adjust allowedTargetTypes rule.',
  CONSTRAINT_MAX_OUTGOING_PER_RELATION: 'Reduce outgoing relation count or increase the maxOutgoingPerRelation rule.',
  CONSTRAINT_FORBID_CIRCULAR: 'Remove circular relation in the constrained relation type.',
  CONSTRAINT_REQUIRED_RELATION_MISSING: 'Add the missing required relation edge for this source node.'
};

const groupIssues = (issues) => {
  const grouped = new Map();
  for (const issue of issues) {
    const severity = issue.severity || 'INFO';
    const code = issue.code || 'UNKNOWN';
    const groupKey = `${severity}:${code}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, { severity, code, issues: [] });
    }
    grouped.get(groupKey).issues.push(issue);
  }

  return [...grouped.values()].sort((left, right) => {
    const leftIndex = severityOrder.indexOf(left.severity);
    const rightIndex = severityOrder.indexOf(right.severity);
    const severitySort = (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    if (severitySort !== 0) {
      return severitySort;
    }
    return left.code.localeCompare(right.code);
  });
};

function ValidationIssuesPanel({ status, issues }) {
  const grouped = groupIssues(issues || []);

  return (
    <section className="validation-panel">
      <h3>Validation Issues</h3>
      <p className="small">Status: {status || 'NOT_RUN'}</p>
      {grouped.length === 0 ? (
        <p className="small">No issues reported.</p>
      ) : (
        grouped.map((group) => (
          <div key={`${group.severity}-${group.code}`} className="validation-group">
            <p>
              <strong>{group.severity}</strong> - <code>{group.code}</code> ({group.issues.length})
            </p>
            <ul>
              {group.issues.map((issue, index) => (
                <li key={`${group.code}-${index}`}>
                  {issue.message || 'No message'}
                  <span className="small">
                    {issue.nodeId ? ` | node: ${issue.nodeId}` : ''}
                    {issue.edgeId ? ` | edge: ${issue.edgeId}` : ''}
                  </span>
                  {actionByCode[group.code] ? <p className="small">Action: {actionByCode[group.code]}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export default ValidationIssuesPanel;
