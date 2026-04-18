const { randomUUID } = require('crypto');
const express = require('express');
const ExportJob = require('../models/export-job');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireStepUp } = require('../middleware/step-up');
const { STEP_UP_ACTIONS } = require('../constants/step-up-actions');
const { sendError } = require('../lib/http');
const {
  POLICY_VERSION,
  getParticipantsRows,
  applyFieldPolicy,
  exportRowsToArtifact
} = require('../services/exports');
const { logAuditEvent } = require('../services/events');
const { logError } = require('../lib/logger');

const router = express.Router();

const isAdministrator = (req) => (req.auth?.roles || []).includes('Administrator');

const processExportJob = async (jobId, userRoles) => {
  const job = await ExportJob.findOne({ export_job_id: jobId });
  if (!job) {
    return;
  }

  job.status = 'RUNNING';
  await job.save();

  try {
    let rows = [];
    if (job.resource === 'participants') {
      rows = await getParticipantsRows(job.filters);
    } else {
      throw new Error(`Unsupported export resource: ${job.resource}`);
    }

    const transformed = applyFieldPolicy({
      resource: job.resource,
      rows,
      requestedFields: job.fields,
      userRoles
    });

    const artifact = await exportRowsToArtifact({
      exportJobId: job.export_job_id,
      format: job.format,
      rows: transformed.transformedRows
    });

    job.status = 'COMPLETED';
    job.artifact_path = artifact.artifactPath;
    job.checksum_sha256 = artifact.checksumSha256;
    job.masking_preview = transformed.maskingPreview;
    await job.save();
  } catch (error) {
    job.status = 'FAILED';
    job.error_message = error.message;
    await job.save();
  }
};

router.use(requireAuth);

router.post('/', requirePermission('EXPORT_CREATE'), requireStepUp(STEP_UP_ACTIONS.EXPORT_CREATE), async (req, res) => {
  const { resource, format, filters, fields } = req.body || {};
  if (!resource || !['CSV', 'JSON'].includes(format)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'resource/format', issue: 'invalid export request' }
    ]);
  }

  const exportJobId = `exp_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const job = await ExportJob.create({
    export_job_id: exportJobId,
    requester_id: req.auth.userId,
    resource,
    format,
    filters: filters || {},
    fields: Array.isArray(fields) ? fields : [],
    mask_policy_version: POLICY_VERSION,
    status: 'QUEUED'
  });

  setImmediate(() => {
    processExportJob(exportJobId, req.auth.roles).catch((error) => {
      logError('exports', { message: 'Export processing failed', error });
    });
  });

  await logAuditEvent({
    actorId: req.auth.userId,
    action: 'EXPORT_REQUESTED',
    entityType: 'export_job',
    entityId: job.export_job_id,
    metadata: {
      resource,
      format,
      fields: job.fields,
      stepUp: true
    }
  });

  return res.status(202).json({
    data: {
      exportJobId,
      status: 'QUEUED'
    }
  });
});

router.get('/:exportJobId', requirePermission('EXPORT_READ'), async (req, res) => {
  const job = await ExportJob.findOne({ export_job_id: req.params.exportJobId }).lean();
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Export job not found');
  }

  const isOwner = String(job.requester_id) === String(req.auth.userId);
  if (!isOwner && !isAdministrator(req)) {
    return sendError(res, req, 403, 'FORBIDDEN', 'Cannot view export requested by another user');
  }

  return res.status(200).json({
    data: {
      exportJobId: job.export_job_id,
      status: job.status,
      artifactPath: job.artifact_path,
      checksumSha256: job.checksum_sha256,
      maskingPreview: job.masking_preview
    }
  });
});

module.exports = router;
