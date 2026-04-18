const { randomUUID } = require('crypto');
const { DateTime } = require('luxon');
const ReportDefinition = require('../models/report-definition');
const ReportRun = require('../models/report-run');
const Registration = require('../models/registration');
const ProgramSession = require('../models/program-session');
const Job = require('../models/job');
const config = require('../config');
const { isDbReady } = require('../db');
const { toCsv, writeArtifactAtomic } = require('./reconciliation');
const { logInfo, logError } = require('../lib/logger');
const { createInboxMessage } = require('./inbox');
const { logAuditEvent } = require('./events');

let schedulerIntervalHandle = null;

const retryBackoffMs = (attempt) => (attempt === 1 ? 60 * 1000 : 5 * 60 * 1000);

const DimensionDefinition = require('../models/dimension-definition');

const resolveReportModel = (dataset) => {
  const map = {
    program_registrations: Registration,
    registrations: Registration,
    sessions: ProgramSession,
    staffing_jobs: Job
  };
  return map[dataset] || null;
};

const ALLOWED_FILTER_FIELDS = new Set([
  'status', 'created_at', 'updated_at', 'participant_id', 'session_id',
  'program_id', 'coach_id', 'department', 'current_state', 'start_at_utc'
]);
const ALLOWED_FILTER_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']);

const buildReportFilter = (definition) => {
  const filter = {};
  const tpl = definition.filter_template;
  if (!tpl || typeof tpl !== 'object') return filter;

  for (const [key, value] of Object.entries(tpl)) {
    if (!ALLOWED_FILTER_FIELDS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const safeOps = {};
      for (const [op, opVal] of Object.entries(value)) {
        if (ALLOWED_FILTER_OPERATORS.has(op)) safeOps[op] = opVal;
      }
      if (Object.keys(safeOps).length > 0) filter[key] = safeOps;
    } else {
      filter[key] = value;
    }
  }
  return filter;
};

const resolveDimensionField = async (dimensionKey, dataset) => {
  const dim = await DimensionDefinition.findOne({ key: dimensionKey, dataset, active: true }).lean();
  return dim ? dim.field : null;
};

const buildGroupedReportRows = async (definition) => {
  const Model = resolveReportModel(definition.dataset);
  if (!Model) throw new Error(`Unsupported dataset: ${definition.dataset}`);

  const filter = buildReportFilter(definition);

  let resolvedGroupField = definition.group_by;
  if (definition.group_by) {
    const dimField = await resolveDimensionField(definition.group_by, definition.dataset);
    if (dimField) resolvedGroupField = dimField;
  }

  const pipeline = [];
  if (Object.keys(filter).length > 0) pipeline.push({ $match: filter });
  pipeline.push({
    $group: {
      _id: resolvedGroupField ? `$${resolvedGroupField}` : null,
      count: { $sum: 1 }
    }
  });
  pipeline.push({ $sort: { _id: 1 } });

  const groups = await Model.aggregate(pipeline);
  return groups.map((g) => ({
    groupKey: g._id || 'all',
    count: g.count
  }));
};

const buildFlatReportRows = async (definition) => {
  const filter = buildReportFilter(definition);

  if (definition.dataset === 'program_registrations' || definition.dataset === 'registrations') {
    const rows = await Registration.find(filter).sort({ created_at: 1, _id: 1 }).lean();
    return rows.map((row) => ({
      registrationId: String(row._id),
      sessionId: String(row.session_id),
      participantId: row.participant_id,
      status: row.status,
      createdAt: row.created_at.toISOString()
    }));
  }

  if (definition.dataset === 'sessions') {
    const rows = await ProgramSession.find(filter).sort({ start_at_utc: 1, _id: 1 }).lean();
    return rows.map((row) => ({
      sessionId: String(row._id),
      programId: String(row.program_id),
      coachId: String(row.coach_id),
      startAtUtc: row.start_at_utc.toISOString(),
      status: row.status,
      capacity: row.capacity
    }));
  }

  if (definition.dataset === 'staffing_jobs') {
    const rows = await Job.find(filter).sort({ created_at: 1, _id: 1 }).lean();
    return rows.map((row) => ({
      jobId: String(row._id),
      title: row.title,
      department: row.department,
      state: row.current_state,
      createdAt: row.created_at.toISOString()
    }));
  }

  throw new Error(`Unsupported dataset: ${definition.dataset}`);
};

const buildReportRows = async (definition) => {
  if (definition.group_by) {
    return buildGroupedReportRows(definition);
  }
  return buildFlatReportRows(definition);
};

const buildReportContent = (rows, format) => {
  if (format === 'CSV') {
    return toCsv(rows);
  }
  return JSON.stringify({ data: rows }, null, 2);
};

const runReportDefinition = async (definition, triggerType, attempt = 1) => {
  if (!isDbReady()) {
    throw new Error('Database not ready for report execution');
  }

  const runId = `rr_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const startedAt = new Date();

  const run = await ReportRun.create({
    run_id: runId,
    report_id: definition.report_id,
    trigger_type: triggerType,
    status: 'RUNNING',
    started_at: startedAt,
    attempt
  });

  try {
    const rows = await buildReportRows(definition);
    const content = buildReportContent(rows, definition.format);
    const suffix = definition.format.toLowerCase();
    const fileName = `${definition.report_id}_${DateTime.utc().toFormat('yyyyLLdd_HHmmss')}.${suffix}`;
    const artifact = await writeArtifactAtomic({
      subdir: 'reports',
      fileName,
      content
    });

    run.status = 'SUCCESS';
    run.artifact_path = artifact.artifactPath;
    run.checksum_sha256 = artifact.checksumSha256;
    run.finished_at = new Date();
    await run.save();

    if (triggerType !== 'MANUAL') {
      definition.last_scheduled_run_date = DateTime.now()
        .setZone(definition.schedule.timezone)
        .toFormat('yyyy-LL-dd');
      await definition.save();
    }

    return run;
  } catch (error) {
    run.status = 'FAILED';
    run.error_message = error.message;
    run.finished_at = new Date();
    await run.save();

    await createInboxMessage({
      recipientId: definition.created_by,
      type: 'ANOMALY',
      title: 'Scheduled report failed',
      body: `${definition.name} failed: ${error.message}`,
      payload: {
        reportId: definition.report_id,
        runId,
        attempt,
        printable: {
          noticeType: 'REPORT_FAILURE',
          message: `${definition.name} failed at attempt ${attempt}.`,
          error: error.message
        }
      }
    });

    await logAuditEvent({
      actorId: definition.created_by,
      action: 'REPORT_RUN_FAILED',
      entityType: 'report_definition',
      entityId: definition.report_id,
      metadata: { runId, attempt, error: error.message }
    });

    if (attempt < 3) {
      const delayMs = retryBackoffMs(attempt);
      setTimeout(() => {
        runReportDefinition(definition, 'RETRY', attempt + 1).catch((err) => {
          logError('reports', { message: 'Retry report run failed', error: err });
        });
      }, delayMs);
    }

    throw error;
  }
};

const shouldRunNow = (definition, nowUtc) => {
  if (!definition.active) {
    return false;
  }

  const [hour, minute] = String(definition.schedule.time || config.reporting.scheduleTime)
    .split(':')
    .map((value) => Number(value));

  const nowLocal = nowUtc.setZone(definition.schedule.timezone || config.reporting.scheduleTimezone);
  const todayLocal = nowLocal.toFormat('yyyy-LL-dd');

  if (definition.last_scheduled_run_date === todayLocal) {
    return false;
  }

  return nowLocal.hour === hour && nowLocal.minute === minute;
};

const tickScheduler = async () => {
  if (!isDbReady()) {
    return;
  }

  const definitions = await ReportDefinition.find({ active: true });
  const nowUtc = DateTime.utc();

  for (const definition of definitions) {
    if (shouldRunNow(definition, nowUtc)) {
      runReportDefinition(definition, 'SCHEDULED').catch((error) => {
        logError('reports', { message: 'Scheduled report execution failed', error });
      });
    }
  }
};

const startReportScheduler = async () => {
  if (schedulerIntervalHandle) {
    return;
  }

  schedulerIntervalHandle = setInterval(() => {
    tickScheduler().catch((error) => {
      logError('reports', { message: 'Report scheduler tick failed', error });
    });
  }, 60 * 1000);

  await tickScheduler().catch((error) => {
    logError('reports', { message: 'Initial report scheduler tick failed', error });
  });
  logInfo('reports', { message: 'Report scheduler started' });
};

module.exports = {
  runReportDefinition,
  startReportScheduler,
  shouldRunNow,
  retryBackoffMs
};
