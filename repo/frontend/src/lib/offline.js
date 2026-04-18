const QUEUE_KEY = 'museum_ops_write_queue_v1';

const SENSITIVE_KEY_PATTERN = /(password|token|cookie|csrf|stepup)/i;

const readQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
};

const writeQueue = (items) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
};

const sanitizeBody = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBody(item));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      output[key] = sanitizeBody(nested);
    }
    return output;
  }
  return value;
};

export const enqueueWrite = (item) => {
  const queue = readQueue();
  queue.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    path: item.path,
    method: item.method,
    body: sanitizeBody(item.body || null),
    userScope: item.userScope || 'anonymous',
    retryCount: Number(item.retryCount || 0)
  });
  writeQueue(queue);
  return queue.length;
};

export const getQueueSize = () => readQueue().length;

export const clearQueuedWrites = () => {
  writeQueue([]);
};

export const syncQueuedWrites = async ({ execute, canReplay } = {}) => {
  if (!navigator.onLine) {
    return { synced: 0, remaining: getQueueSize() };
  }

  const executeRequest =
    typeof execute === 'function'
      ? execute
      : async ({ path, url, method, body, headers }) =>
          fetch(url || path, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(headers || {})
            },
            body
          });

  const queue = readQueue();
  if (queue.length === 0) {
    return { synced: 0, remaining: 0, blocked: 0 };
  }

  const remaining = [];
  let synced = 0;
  let blocked = 0;

  const resolveQueuedBody = (body) => {
    if (body === undefined || body === null) {
      return undefined;
    }
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  };

  for (const item of queue) {
    if (typeof canReplay === 'function' && !canReplay(item)) {
      blocked += 1;
      continue;
    }

    try {
      const response = await executeRequest({
        path: item.path,
        url: item.url,
        method: item.method,
        headers: item.headers,
        body: resolveQueuedBody(item.body)
      });

      if (response.ok) {
        synced += 1;
      } else {
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      }
    } catch (error) {
      remaining.push({ ...item, retryCount: item.retryCount + 1 });
    }
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length, blocked };
};
