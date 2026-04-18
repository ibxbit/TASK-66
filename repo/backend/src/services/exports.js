const crypto = require('crypto');
const ParticipantProfile = require('../models/participant-profile');
const Registration = require('../models/registration');
const { toCsv, writeArtifactAtomic } = require('./reconciliation');

const maskPhoneLast4 = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) {
    return '***-***-0000';
  }
  return `***-***-${digits.slice(-4)}`;
};

const hashValue = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);

const POLICY_VERSION = 'v1';

const FIELD_POLICIES = {
  participants: {
    publicFields: ['participantId', 'name'],
    sensitiveFields: ['phone', 'email', 'notes']
  }
};

const rolePolicy = {
  Administrator: {
    phone: (value) => maskPhoneLast4(value),
    email: (value) => hashValue(value),
    notes: () => '[REDACTED]'
  },
  Auditor: {
    phone: (value) => maskPhoneLast4(value),
    email: () => '[OMITTED]',
    notes: () => '[REDACTED]'
  }
};

const getDominantRolePolicy = (roles) => {
  if (roles.includes('Administrator')) {
    return rolePolicy.Administrator;
  }
  if (roles.includes('Auditor')) {
    return rolePolicy.Auditor;
  }
  return null;
};

const getParticipantsRows = async (filters) => {
  const query = {};
  if (filters?.participantId) {
    query.participant_id = String(filters.participantId);
  }

  const profiles = await ParticipantProfile.find(query).sort({ participant_id: 1 }).lean();
  if (profiles.length > 0) {
    return profiles.map((profile) => ({
      participantId: profile.participant_id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      notes: profile.notes
    }));
  }

  const registrations = await Registration.find({}).sort({ participant_id: 1 }).lean();
  const unique = new Map();
  for (const registration of registrations) {
    if (!unique.has(registration.participant_id)) {
      unique.set(registration.participant_id, {
        participantId: registration.participant_id,
        name: `Participant ${registration.participant_id}`,
        phone: '000-000-0000',
        email: `${registration.participant_id}@example.local`,
        notes: ''
      });
    }
  }

  return [...unique.values()];
};

const applyFieldPolicy = ({ resource, rows, requestedFields, userRoles }) => {
  const policy = FIELD_POLICIES[resource];
  if (!policy) {
    throw new Error(`Unsupported export resource: ${resource}`);
  }

  const roleTransform = getDominantRolePolicy(userRoles || []);
  if (!roleTransform) {
    throw new Error('No export mask policy for role');
  }

  const fields = requestedFields && requestedFields.length > 0 ? requestedFields : policy.publicFields;

  const sanitizedFields = fields.filter((field) => {
    if (policy.publicFields.includes(field)) return true;
    return policy.sensitiveFields.includes(field);
  });

  const transformedRows = rows.map((row) => {
    const output = {};
    for (const field of sanitizedFields) {
      if (policy.publicFields.includes(field)) {
        output[field] = row[field] ?? '';
      } else if (policy.sensitiveFields.includes(field)) {
        output[field] = roleTransform[field] ? roleTransform[field](row[field]) : '[DENIED]';
      }
    }
    return output;
  });

  const maskingPreview = policy.sensitiveFields
    .filter((field) => sanitizedFields.includes(field))
    .map((field) => ({
      field,
      rule: roleTransform[field] ? (field === 'phone' ? 'last4' : field === 'email' ? 'partial' : 'redacted') : 'denied'
    }));

  return {
    transformedRows,
    fields: sanitizedFields,
    maskingPreview
  };
};

const exportRowsToArtifact = async ({ exportJobId, format, rows }) => {
  const extension = format.toLowerCase();
  const fileName = `${exportJobId}.${extension}`;
  const content = format === 'CSV' ? toCsv(rows) : JSON.stringify({ data: rows }, null, 2);
  return writeArtifactAtomic({ subdir: 'exports', fileName, content });
};

module.exports = {
  POLICY_VERSION,
  getParticipantsRows,
  applyFieldPolicy,
  exportRowsToArtifact
};
