export const clampPageSize = (value, max = 51) => {
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), max);
};

export const parsePositiveInt = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const tryParseJsonObject = (value, fieldLabel) => {
  if (!value || !value.trim()) {
    return { value: {}, error: null };
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: `${fieldLabel} must be a JSON object` };
    }
    return { value: parsed, error: null };
  } catch {
    return { value: null, error: `${fieldLabel} must be valid JSON` };
  }
};

export const validateNodeForm = (form) => {
  if (!form.type || !form.type.trim()) {
    return 'Node type is required';
  }
  if (!form.label || !form.label.trim()) {
    return 'Node label is required';
  }
  return null;
};

export const validateEdgeForm = (form) => {
  if (!form.fromNodeId || !form.toNodeId) {
    return 'Both source and target nodes are required';
  }
  if (form.fromNodeId === form.toNodeId) {
    return 'Source and target nodes must be different';
  }
  if (!form.relationType || !form.relationType.trim()) {
    return 'Relation type is required';
  }
  const weight = Number(form.weight);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    return 'Weight must be an integer between 0 and 100';
  }
  return null;
};

export const validateProgramDraft = ({ type, title, capacity }) => {
  if (!type || !type.trim()) return 'Program type is required';
  if (!title || !title.trim()) return 'Program title is required';
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1) return 'Capacity must be a positive integer';
  return null;
};

export const validateSessionDraft = ({ venueId, startAtUtc, endAtUtc, capacity }) => {
  if (!venueId || !venueId.trim()) return 'Venue is required';
  if (!startAtUtc || !startAtUtc.trim()) return 'Session start time is required';
  if (!endAtUtc || !endAtUtc.trim()) return 'Session end time is required';
  if (startAtUtc >= endAtUtc) return 'Session end must be after session start';
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1) return 'Capacity must be a positive integer';
  return null;
};

export const validateJobDraft = ({ department, title, description }) => {
  if (!department || !department.trim()) return 'Department is required';
  if (!title || !title.trim()) return 'Job title is required';
  if (!description || !description.trim()) return 'Job description is required';
  return null;
};

export const validateRouteSegmentInput = ({ fromCaseId, toCaseId, dwellMinutes, distanceMeters }) => {
  if (!fromCaseId || !toCaseId) {
    return 'Select both From and To display cases';
  }
  if (fromCaseId === toCaseId) {
    return 'From and To display cases must be different';
  }

  const dwell = Number(dwellMinutes);
  const distance = Number(distanceMeters);
  if (!Number.isFinite(dwell) || dwell < 0) {
    return 'Dwell minutes must be a non-negative number';
  }
  if (!Number.isFinite(distance) || distance < 0) {
    return 'Distance meters must be a non-negative number';
  }
  return null;
};
