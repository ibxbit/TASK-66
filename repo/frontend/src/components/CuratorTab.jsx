import { useMemo, useState } from 'react';
import { EDGE_DEFAULTS, NODE_DEFAULTS } from '../constants/defaults';
import { useFormState } from '../hooks/useFormState';
import {
  tryParseJsonObject,
  validateEdgeForm,
  validateNodeForm
} from '../validators/forms';
import GraphSnapshot from './GraphSnapshot';
import ValidationIssuesPanel from './ValidationIssuesPanel';

const isQueued = (response) => response?.data?.queued === true;

const relationTypes = [
  'INFLUENCED_BY',
  'CREATED_BY',
  'ISSUED_IN',
  'PART_OF_SERIES',
  'DEPICTS',
  'RELATED_TO'
];

const toUiSnapshot = (draft) => {
  const snapshot = draft.data?.snapshot || { nodes: [], edges: [] };
  const nodes = (snapshot.nodes || []).map((node) => ({
    id: node.node_id,
    type: node.type,
    label: node.label,
    metadata: node.metadata || {}
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = (snapshot.edges || []).map((edge) => ({
    id: edge.edge_id,
    fromNodeId: edge.from_node_id,
    toNodeId: edge.to_node_id,
    fromLabel: nodeById.get(edge.from_node_id)?.label || edge.from_node_id,
    toLabel: nodeById.get(edge.to_node_id)?.label || edge.to_node_id,
    relationType: edge.relation_type,
    weight: edge.weight,
    constraints: edge.constraints || {}
  }));

  return {
    draftId: draft.data?.draftId || '',
    nodes,
    edges,
    validation: draft.data?.validation || { status: 'NOT_RUN', issues: [] }
  };
};

function CuratorTab({ apiRequest, csrfToken, acquireStepUpTokenFor, setMessage, setError }) {
  const [graphState, setGraphState] = useState({
    draftId: '',
    nodes: [],
    edges: [],
    validation: { status: 'NOT_RUN', issues: [] }
  });
  const [nodeForm, updateNodeForm, setNodeForm] = useFormState(NODE_DEFAULTS);
  const [edgeForm, updateEdgeForm, setEdgeForm] = useFormState(EDGE_DEFAULTS);
  const [editingNodeId, setEditingNodeId] = useState('');
  const [editingEdgeId, setEditingEdgeId] = useState('');
  const [pending, setPending] = useState('');

  const blockingIssues = useMemo(
    () => (graphState.validation?.issues || []).filter((issue) => issue.severity === 'BLOCKING'),
    [graphState.validation]
  );

  const issueNodeIds = blockingIssues.filter((item) => item.nodeId).map((item) => item.nodeId);
  const issueEdgeIds = blockingIssues.filter((item) => item.edgeId).map((item) => item.edgeId);
  const publishBlocked = !graphState.draftId || blockingIssues.length > 0 || pending !== '';

  const run = async (actionKey, fn) => {
    if (pending) {
      return;
    }
    setPending(actionKey);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setPending('');
    }
  };

  const refreshDraft = async (draftId = graphState.draftId) => {
    const response = await apiRequest({ path: `/graph/drafts/${draftId}`, method: 'GET', allowQueue: false });
    setGraphState(toUiSnapshot(response));
  };

  const createDraft = () =>
    run('create-draft', async () => {
      const response = await apiRequest({ path: '/graph/drafts', method: 'POST', csrfToken });
      if (isQueued(response)) {
        setMessage('Draft creation queued offline. It will sync when back online.');
        return;
      }
      await refreshDraft(response.data.draftId);
      setEditingNodeId('');
      setEditingEdgeId('');
      setNodeForm(NODE_DEFAULTS);
      setEdgeForm(EDGE_DEFAULTS);
      setMessage(`Draft created: ${response.data.draftId}`);
    });

  const saveNode = () =>
    run('save-node', async () => {
      if (!graphState.draftId) {
        throw new Error('Create a graph draft first');
      }

      const formIssue = validateNodeForm(nodeForm);
      if (formIssue) {
        throw new Error(formIssue);
      }

      const metadataParse = tryParseJsonObject(nodeForm.metadataText, 'Node metadata');
      if (metadataParse.error) {
        throw new Error(metadataParse.error);
      }

      let response;
      if (editingNodeId) {
        response = await apiRequest({
          path: `/graph/drafts/${graphState.draftId}/nodes/${editingNodeId}`,
          method: 'PATCH',
          csrfToken,
          body: {
            label: nodeForm.label.trim(),
            metadata: metadataParse.value
          }
        });
      } else {
        response = await apiRequest({
          path: `/graph/drafts/${graphState.draftId}/nodes`,
          method: 'POST',
          csrfToken,
          body: {
            type: nodeForm.type.trim(),
            label: nodeForm.label.trim(),
            metadata: metadataParse.value
          }
        });
      }

      if (isQueued(response)) {
        setMessage('Node change queued offline. It will sync when back online.');
        return;
      }

      setMessage(editingNodeId ? 'Node updated' : 'Node created');
      await refreshDraft();
      setEditingNodeId('');
      setNodeForm(NODE_DEFAULTS);
    });

  const deleteNode = (nodeId) =>
    run('delete-node', async () => {
      const response = await apiRequest({
        path: `/graph/drafts/${graphState.draftId}/nodes/${nodeId}`,
        method: 'DELETE',
        csrfToken
      });
      if (isQueued(response)) {
        setMessage('Node deletion queued offline. It will sync when back online.');
        return;
      }
      await refreshDraft();
      setMessage('Node deleted');
      if (editingNodeId === nodeId) {
        setEditingNodeId('');
        setNodeForm(NODE_DEFAULTS);
      }
    });

  const saveEdge = () =>
    run('save-edge', async () => {
      if (!graphState.draftId) {
        throw new Error('Create a graph draft first');
      }

      const formIssue = validateEdgeForm(edgeForm);
      if (formIssue) {
        throw new Error(formIssue);
      }

      const constraintsParse = tryParseJsonObject(edgeForm.constraintsText, 'Edge constraints');
      if (constraintsParse.error) {
        throw new Error(constraintsParse.error);
      }

      let response;
      if (editingEdgeId) {
        response = await apiRequest({
          path: `/graph/drafts/${graphState.draftId}/edges/${editingEdgeId}`,
          method: 'PATCH',
          csrfToken,
          body: {
            fromNodeId: edgeForm.fromNodeId,
            toNodeId: edgeForm.toNodeId,
            relationType: edgeForm.relationType,
            weight: Number(edgeForm.weight),
            constraints: constraintsParse.value
          }
        });
      } else {
        response = await apiRequest({
          path: `/graph/drafts/${graphState.draftId}/edges`,
          method: 'POST',
          csrfToken,
          body: {
            fromNodeId: edgeForm.fromNodeId,
            toNodeId: edgeForm.toNodeId,
            relationType: edgeForm.relationType,
            weight: Number(edgeForm.weight),
            constraints: constraintsParse.value
          }
        });
      }

      if (isQueued(response)) {
        setMessage('Edge change queued offline. It will sync when back online.');
        return;
      }

      setMessage(editingEdgeId ? 'Edge updated' : 'Edge created');
      await refreshDraft();
      setEditingEdgeId('');
      setEdgeForm(EDGE_DEFAULTS);
    });

  const deleteEdge = (edgeId) =>
    run('delete-edge', async () => {
      const response = await apiRequest({
        path: `/graph/drafts/${graphState.draftId}/edges/${edgeId}`,
        method: 'DELETE',
        csrfToken
      });
      if (isQueued(response)) {
        setMessage('Edge deletion queued offline. It will sync when back online.');
        return;
      }
      await refreshDraft();
      setMessage('Edge deleted');
      if (editingEdgeId === edgeId) {
        setEditingEdgeId('');
        setEdgeForm(EDGE_DEFAULTS);
      }
    });

  const validateGraph = () =>
    run('validate-graph', async () => {
      await apiRequest({
        path: `/graph/drafts/${graphState.draftId}/validate`,
        method: 'POST',
        csrfToken,
        allowQueue: false
      });
      await refreshDraft();
      setMessage('Validation completed');
    });

  const publishGraph = () =>
    run('publish-graph', async () => {
      if (blockingIssues.length > 0) {
        throw new Error('Cannot publish while blocking validation issues remain');
      }
      const stepUp = await acquireStepUpTokenFor('GRAPH_PUBLISH');
      const response = await apiRequest({
        path: `/graph/drafts/${graphState.draftId}/publish`,
        method: 'POST',
        csrfToken,
        stepUpToken: stepUp.stepUpToken,
        allowQueue: false
      });
      await refreshDraft();
      setMessage(`Graph published as version ${response.data.version}`);
    });

  return (
    <article className="card">
      <h2>Knowledge Graph Curation</h2>
      <p className="small">Manage nodes, edges, relation rules, and publish only after blocking issues are resolved.</p>

      <div className="row wrap">
        <button onClick={createDraft} disabled={pending !== ''}>{pending === 'create-draft' ? 'Creating...' : 'Create Draft'}</button>
        <button onClick={() => run('refresh-draft', () => refreshDraft())} disabled={!graphState.draftId || pending !== ''}>Refresh Draft</button>
        <button onClick={validateGraph} disabled={!graphState.draftId || pending !== ''}>{pending === 'validate-graph' ? 'Validating...' : 'Validate Draft'}</button>
        <button onClick={publishGraph} disabled={publishBlocked}>{pending === 'publish-graph' ? 'Publishing...' : 'Publish (Step-Up)'}</button>
      </div>
      <p className="small">Draft: {graphState.draftId || 'none'} | Validation: {graphState.validation?.status || 'NOT_RUN'} | Blocking issues: {blockingIssues.length}</p>

      <section className="route-block">
        <h3>Nodes</h3>
        <div className="row wrap">
          <input value={nodeForm.type} onChange={(e) => updateNodeForm('type', e.target.value)} placeholder="node type" />
          <input value={nodeForm.label} onChange={(e) => updateNodeForm('label', e.target.value)} placeholder="node label" />
          <input value={nodeForm.metadataText} onChange={(e) => updateNodeForm('metadataText', e.target.value)} placeholder="metadata JSON" />
          <button onClick={saveNode} disabled={!graphState.draftId || pending !== ''}>{pending === 'save-node' ? 'Saving...' : editingNodeId ? 'Update Node' : 'Create Node'}</button>
          {editingNodeId ? (
            <button className="ghost" onClick={() => {
              setEditingNodeId('');
              setNodeForm(NODE_DEFAULTS);
            }}>
              Cancel Edit
            </button>
          ) : null}
        </div>
        {graphState.nodes.length === 0 ? (
          <p className="small">No nodes yet.</p>
        ) : (
          <table className="segment-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {graphState.nodes.map((node) => (
                <tr key={node.id}>
                  <td>{node.label}</td>
                  <td>{node.type}</td>
                  <td>
                    <button onClick={() => {
                      setEditingNodeId(node.id);
                      setNodeForm({
                        type: node.type,
                        label: node.label,
                        metadataText: JSON.stringify(node.metadata || {}, null, 0)
                      });
                    }}>Edit</button>
                    <button onClick={() => deleteNode(node.id)} disabled={pending !== ''}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="route-block">
        <h3>Edges</h3>
        <div className="row wrap">
          <select value={edgeForm.fromNodeId} onChange={(e) => updateEdgeForm('fromNodeId', e.target.value)}>
            <option value="">From node</option>
            {graphState.nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.label}</option>
            ))}
          </select>
          <select value={edgeForm.toNodeId} onChange={(e) => updateEdgeForm('toNodeId', e.target.value)}>
            <option value="">To node</option>
            {graphState.nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.label}</option>
            ))}
          </select>
          <select value={edgeForm.relationType} onChange={(e) => updateEdgeForm('relationType', e.target.value)}>
            {relationTypes.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input value={edgeForm.weight} onChange={(e) => updateEdgeForm('weight', e.target.value)} placeholder="weight 0-100" />
          <input value={edgeForm.constraintsText} onChange={(e) => updateEdgeForm('constraintsText', e.target.value)} placeholder="constraints JSON" />
          <button onClick={saveEdge} disabled={!graphState.draftId || pending !== ''}>{pending === 'save-edge' ? 'Saving...' : editingEdgeId ? 'Update Edge' : 'Create Edge'}</button>
          {editingEdgeId ? (
            <button className="ghost" onClick={() => {
              setEditingEdgeId('');
              setEdgeForm(EDGE_DEFAULTS);
            }}>
              Cancel Edit
            </button>
          ) : null}
        </div>

        {graphState.edges.length === 0 ? (
          <p className="small">No edges yet.</p>
        ) : (
          <table className="segment-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Relation</th>
                <th>Weight</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {graphState.edges.map((edge) => (
                <tr key={edge.id}>
                  <td>{edge.fromLabel}</td>
                  <td>{edge.toLabel}</td>
                  <td>{edge.relationType}</td>
                  <td>{edge.weight}</td>
                  <td>
                    <button onClick={() => {
                      setEditingEdgeId(edge.id);
                      setEdgeForm({
                        fromNodeId: edge.fromNodeId,
                        toNodeId: edge.toNodeId,
                        relationType: edge.relationType,
                        weight: String(edge.weight),
                        constraintsText: JSON.stringify(edge.constraints || {}, null, 0)
                      });
                    }}>Edit</button>
                    <button onClick={() => deleteEdge(edge.id)} disabled={pending !== ''}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <GraphSnapshot
        draftId={graphState.draftId}
        nodes={graphState.nodes}
        edges={graphState.edges}
        issueNodeIds={issueNodeIds}
        issueEdgeIds={issueEdgeIds}
      />

      <ValidationIssuesPanel
        status={graphState.validation?.status}
        issues={graphState.validation?.issues || []}
      />

      {blockingIssues.length > 0 ? (
        <p className="notice err">Resolve blocking validation issues (duplicates, circular refs, orphan nodes, or rule conflicts) before publish.</p>
      ) : null}
    </article>
  );
}

export default CuratorTab;
