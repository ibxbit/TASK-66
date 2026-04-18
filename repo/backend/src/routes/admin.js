const express = require('express');
const SearchCache = require('../models/search-cache');
const ReportRun = require('../models/report-run');
const ExportJob = require('../models/export-job');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireStepUp } = require('../middleware/step-up');
const { STEP_UP_ACTIONS } = require('../constants/step-up-actions');
const { sendError } = require('../lib/http');

const router = express.Router();

router.use(requireAuth);

router.get('/config', requirePermission('ANALYTICS_REPORT_MANAGE'), async (req, res) => {
  return res.status(200).json({
    data: {
      searchCacheTtlSeconds: config.search.cacheTtlSeconds,
      reportScheduleTimezone: config.reporting.scheduleTimezone,
      waitlistPromotionExpiryMinutes: config.operations.waitlistPromotionExpiryMinutes,
      inboxRetentionDays: config.operations.inboxRetentionDays
    }
  });
});

router.patch('/config', requirePermission('ANALYTICS_REPORT_MANAGE'), requireStepUp(STEP_UP_ACTIONS.ADMIN_CONFIG_UPDATE), async (req, res) => {
  const updatable = ['searchCacheTtlSeconds', 'reportScheduleTimezone', 'waitlistPromotionExpiryMinutes', 'inboxRetentionDays'];
  const updates = {};
  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'No valid config keys provided', [
      { field: 'body', issue: `updatable keys: ${updatable.join(', ')}` }
    ]);
  }

  if (updates.searchCacheTtlSeconds !== undefined) {
    config.search.cacheTtlSeconds = Number(updates.searchCacheTtlSeconds);
  }
  if (updates.reportScheduleTimezone !== undefined) {
    config.reporting.scheduleTimezone = String(updates.reportScheduleTimezone);
  }
  if (updates.waitlistPromotionExpiryMinutes !== undefined) {
    config.operations.waitlistPromotionExpiryMinutes = Number(updates.waitlistPromotionExpiryMinutes);
  }
  if (updates.inboxRetentionDays !== undefined) {
    config.operations.inboxRetentionDays = Number(updates.inboxRetentionDays);
  }

  const { logAuditEvent } = require('../services/events');
  await logAuditEvent({
    actorId: req.auth.userId,
    action: 'ADMIN_CONFIG_UPDATE',
    entityType: 'system_config',
    entityId: 'runtime',
    metadata: updates
  });

  return res.status(200).json({
    data: {
      searchCacheTtlSeconds: config.search.cacheTtlSeconds,
      reportScheduleTimezone: config.reporting.scheduleTimezone,
      waitlistPromotionExpiryMinutes: config.operations.waitlistPromotionExpiryMinutes,
      inboxRetentionDays: config.operations.inboxRetentionDays
    }
  });
});

router.post('/cache/invalidate', requirePermission('CATALOG_CURATION'), async (req, res) => {
  const scope = req.body?.scope;
  if (scope === 'CATALOG_SEARCH') {
    await SearchCache.deleteMany({});
    return res.status(200).json({ data: { invalidated: 'CATALOG_SEARCH' } });
  }
  return res.status(200).json({ data: { invalidated: 'NONE' } });
});

router.get('/reconciliation/artifacts', requirePermission('RECONCILIATION_READ'), async (req, res) => {
  const [reportRuns, exportJobs] = await Promise.all([
    ReportRun.find({ status: 'SUCCESS' }).sort({ started_at: -1 }).limit(100).lean(),
    ExportJob.find({ status: 'COMPLETED' }).sort({ updated_at: -1 }).limit(100).lean()
  ]);

  const artifacts = [
    ...reportRuns.map((run) => ({
      type: 'REPORT',
      id: run.run_id,
      status: run.status,
      artifactPath: run.artifact_path,
      checksumSha256: run.checksum_sha256,
      createdAt: run.finished_at || run.started_at
    })),
    ...exportJobs.map((job) => ({
      type: 'EXPORT',
      id: job.export_job_id,
      status: job.status,
      artifactPath: job.artifact_path,
      checksumSha256: job.checksum_sha256,
      createdAt: job.updated_at
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.status(200).json({ data: artifacts });
});

module.exports = router;
