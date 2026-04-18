const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

const createIssue = ({ code, severity = 'BLOCKING', message, nodeId, edgeId, metadata }) => ({
  code,
  severity,
  message,
  ...(nodeId ? { nodeId } : {}),
  ...(edgeId ? { edgeId } : {}),
  ...(metadata ? { metadata } : {})
});

const buildNodeLookup = (nodes) => {
  const map = new Map();
  for (const node of nodes) {
    map.set(node.node_id, node);
  }
  return map;
};

const findDuplicates = (nodes) => {
  const seen = new Map();
  const issues = [];

  for (const node of nodes) {
    const key = `${node.type}:${normalizeLabel(node.label)}`;
    if (seen.has(key)) {
      issues.push({
        code: 'DUPLICATE_NODE',
        severity: 'BLOCKING',
        message: `Duplicate node label for type ${node.type}`,
        nodeId: node.node_id,
        metadata: {
          duplicateOfNodeId: seen.get(key),
          type: node.type,
          label: node.label
        }
      });
    } else {
      seen.set(key, node.node_id);
    }
  }

  return issues;
};

const findOrphans = (nodes, edges) => {
  const linked = new Set();
  for (const edge of edges) {
    linked.add(edge.from_node_id);
    linked.add(edge.to_node_id);
  }

  return nodes
    .filter((node) => !linked.has(node.node_id))
    .map((node) => ({
      code: 'ORPHAN_NODE',
      severity: 'BLOCKING',
      message: `Node ${node.node_id} is not connected by any edge`,
      nodeId: node.node_id
    }));
};

const findCycles = (nodes, edges, code = 'CYCLE') => {
  const adjacency = new Map();
  const edgeByPair = new Map();
  nodes.forEach((node) => adjacency.set(node.node_id, []));
  edges.forEach((edge) => {
    if (adjacency.has(edge.from_node_id)) {
      adjacency.get(edge.from_node_id).push(edge.to_node_id);
      edgeByPair.set(`${edge.from_node_id}->${edge.to_node_id}`, edge.edge_id);
    }
  });

  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const issues = [];

  const dfs = (nodeId) => {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycleNodes = cycleStart >= 0 ? path.slice(cycleStart).concat(nodeId) : [nodeId];
      const cycleEdgeIds = [];
      for (let i = 0; i < cycleNodes.length - 1; i += 1) {
        const edgeId = edgeByPair.get(`${cycleNodes[i]}->${cycleNodes[i + 1]}`);
        if (edgeId) {
          cycleEdgeIds.push(edgeId);
        }
      }
      issues.push(
        createIssue({
          code,
          severity: 'BLOCKING',
          message: `Cycle detected: ${cycleNodes.join(' -> ')}`,
          nodeId: nodeId,
          metadata: { cycleNodes, cycleEdgeIds }
        })
      );
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);
    path.push(nodeId);

    for (const next of adjacency.get(nodeId) || []) {
      dfs(next);
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of nodes) {
    if (!visited.has(node.node_id)) {
      dfs(node.node_id);
    }
  }

  return issues;
};

const evaluateConstraintIssues = (nodes, edges) => {
  const nodeById = buildNodeLookup(nodes);
  const issues = [];

  const relationOutCounts = new Map();
  for (const edge of edges) {
    const key = `${edge.from_node_id}:${edge.relation_type}`;
    relationOutCounts.set(key, (relationOutCounts.get(key) || 0) + 1);
  }

  const maxOutgoingReported = new Set();
  const requiredRules = new Map();
  const cycleScopedRelations = new Set();

  for (const edge of edges) {
    const constraints = edge.constraints || {};
    const toNode = nodeById.get(edge.to_node_id);
    const fromNode = nodeById.get(edge.from_node_id);

    if (Array.isArray(constraints.allowedTargetTypes) && constraints.allowedTargetTypes.length > 0 && toNode) {
      if (!constraints.allowedTargetTypes.includes(toNode.type)) {
        issues.push(
          createIssue({
            code: 'CONSTRAINT_ALLOWED_TARGET_TYPES',
            severity: 'BLOCKING',
            edgeId: edge.edge_id,
            nodeId: edge.to_node_id,
            message: `Edge target type ${toNode.type} is not allowed for relation ${edge.relation_type}`,
            metadata: {
              allowedTargetTypes: constraints.allowedTargetTypes,
              actualTargetType: toNode.type
            }
          })
        );
      }
    }

    if (Number.isInteger(constraints.maxOutgoingPerRelation) && constraints.maxOutgoingPerRelation >= 0) {
      const key = `${edge.from_node_id}:${edge.relation_type}`;
      const actual = relationOutCounts.get(key) || 0;
      if (actual > constraints.maxOutgoingPerRelation) {
        const reportKey = `${key}:${constraints.maxOutgoingPerRelation}`;
        if (!maxOutgoingReported.has(reportKey)) {
          maxOutgoingReported.add(reportKey);
          issues.push(
            createIssue({
              code: 'CONSTRAINT_MAX_OUTGOING_PER_RELATION',
              severity: 'BLOCKING',
              edgeId: edge.edge_id,
              nodeId: edge.from_node_id,
              message: `Node ${edge.from_node_id} has ${actual} outgoing ${edge.relation_type} edges; max is ${constraints.maxOutgoingPerRelation}`,
              metadata: {
                relationType: edge.relation_type,
                actualOutgoing: actual,
                maxOutgoingPerRelation: constraints.maxOutgoingPerRelation
              }
            })
          );
        }
      }
    }

    if (constraints.forbidCircular === true) {
      cycleScopedRelations.add(edge.relation_type);
    }

    if (constraints.required === true && fromNode && toNode) {
      const key = `${edge.relation_type}:${fromNode.type}:${toNode.type}`;
      requiredRules.set(key, {
        relationType: edge.relation_type,
        fromType: fromNode.type,
        toType: toNode.type
      });
    }
  }

  for (const relationType of cycleScopedRelations) {
    const scopedEdges = edges.filter((edge) => edge.relation_type === relationType);
    const scopedCycleIssues = findCycles(nodes, scopedEdges, 'CONSTRAINT_FORBID_CIRCULAR').map((issue) => ({
      ...issue,
      message: `${issue.message} for relation ${relationType}`,
      metadata: {
        ...(issue.metadata || {}),
        relationType
      }
    }));
    issues.push(...scopedCycleIssues);
  }

  for (const rule of requiredRules.values()) {
    const candidateSources = nodes.filter((node) => node.type === rule.fromType);
    for (const sourceNode of candidateSources) {
      const hasRequiredEdge = edges.some((edge) => {
        if (edge.from_node_id !== sourceNode.node_id || edge.relation_type !== rule.relationType) {
          return false;
        }
        const targetNode = nodeById.get(edge.to_node_id);
        return targetNode?.type === rule.toType;
      });

      if (!hasRequiredEdge) {
        issues.push(
          createIssue({
            code: 'CONSTRAINT_REQUIRED_RELATION_MISSING',
            severity: 'BLOCKING',
            nodeId: sourceNode.node_id,
            message: `Node ${sourceNode.node_id} requires relation ${rule.relationType} to target type ${rule.toType}`,
            metadata: {
              relationType: rule.relationType,
              requiredTargetType: rule.toType,
              sourceType: rule.fromType
            }
          })
        );
      }
    }
  }

  return issues;
};

const validateGraphSnapshot = (snapshot) => {
  const nodes = snapshot?.nodes || [];
  const edges = snapshot?.edges || [];

  const missingNodeIssues = edges
    .filter((edge) => {
      const hasFrom = nodes.some((node) => node.node_id === edge.from_node_id);
      const hasTo = nodes.some((node) => node.node_id === edge.to_node_id);
      return !hasFrom || !hasTo;
    })
    .map((edge) =>
      createIssue({
        code: 'EDGE_NODE_NOT_FOUND',
        severity: 'BLOCKING',
        edgeId: edge.edge_id,
        message: `Edge ${edge.edge_id} references a missing node`
      })
    );

  const issues = [
    ...findDuplicates(nodes),
    ...findCycles(nodes, edges),
    ...findOrphans(nodes, edges),
    ...missingNodeIssues,
    ...evaluateConstraintIssues(nodes, edges)
  ];

  const blockingIssueCount = issues.filter((issue) => issue.severity === 'BLOCKING').length;

  return {
    status: blockingIssueCount > 0 ? 'INVALID' : 'VALID',
    issues
  };
};

module.exports = {
  validateGraphSnapshot
};
