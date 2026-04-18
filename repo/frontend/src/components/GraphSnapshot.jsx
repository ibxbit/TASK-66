function GraphSnapshot({ draftId, nodes, edges, issueNodeIds = [], issueEdgeIds = [] }) {
  if (!draftId) {
    return <p className="small">Create a draft to see a graph preview.</p>;
  }

  const issueNodeSet = new Set(issueNodeIds);
  const issueEdgeSet = new Set(issueEdgeIds);

  return (
    <div className="mini-graph">
      <p className="small">Draft: {draftId}</p>
      <div className="mini-graph-grid">
        <section>
          <h3>Nodes</h3>
          <ul>
            {nodes.map((node) => (
              <li key={node.id} className={issueNodeSet.has(node.id) ? 'issue-item' : ''}>
                <strong>{node.label}</strong>
                <span className="small"> ({node.type})</span>
              </li>
            ))}
            {nodes.length === 0 ? <li className="small">No nodes yet</li> : null}
          </ul>
        </section>
        <section>
          <h3>Edges</h3>
          <ul>
            {edges.map((edge) => (
              <li key={edge.id} className={issueEdgeSet.has(edge.id) ? 'issue-item' : ''}>
                {edge.fromLabel} -&gt; {edge.toLabel}
                <span className="small"> ({edge.relationType}, weight {edge.weight})</span>
              </li>
            ))}
            {edges.length === 0 ? <li className="small">No edges yet</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default GraphSnapshot;
