const REDACTED = '[REDACTED]';
const sensitiveKeyPattern = /(password|token|cookie)/i;

const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        output[key] = REDACTED;
      } else {
        output[key] = sanitizeValue(nestedValue);
      }
    }
    return output;
  }

  return value;
};

const redactError = (error) => {
  if (!error) {
    return null;
  }

  return sanitizeValue({
    name: error.name || 'Error',
    message: error.message || 'Unexpected error'
  });
};

const logInfo = (category, fields = {}) => {
  console.log(
    JSON.stringify({
      level: 'info',
      category,
      timestamp: new Date().toISOString(),
      ...sanitizeValue(fields)
    })
  );
};

const logError = (category, fields = {}) => {
  console.error(
    JSON.stringify({
      level: 'error',
      category,
      timestamp: new Date().toISOString(),
      ...sanitizeValue(fields),
      ...(fields.error ? { error: redactError(fields.error) } : {})
    })
  );
};

module.exports = {
  sanitizeValue,
  logInfo,
  logError
};
