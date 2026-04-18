const crypto = require('crypto');
const express = require('express');
const MetricDefinition = require('../models/metric-definition');
const DimensionDefinition = require('../models/dimension-definition');
const DashboardDefinition = require('../models/dashboard-definition');
const AnomalyRule = require('../models/anomaly-rule');
const AnomalyDispatch = require('../models/anomaly-dispatch');
const ReportDefinition = require('../models/report-definition');
const ReportRun = require('../models/report-run');
const User = require('../models/user');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireCsrf } = require('../middleware/auth');
const { sendError } = require('../lib/http');
const { countWeeklyBookings, evaluateWowDropRule } = require('../services/analytics');
const { runReportDefinition } = require('../services/reports');
const { createInboxMessage } = require('../services/inbox');
const { logError } = require('../lib/logger');
const config = require('../config');

const router = express.Router();

const validReportFormats = ['CSV', 'JSON'];

const dispatchAnomalyInbox = async ({ dashboard, rule, metricResult, evaluation }) => {
  if (evaluation.status !== 'TRIGGERED') {
    return;
  }

  const periodKey = metricResult?.period?.currentWeekStart || metricResult?.currentWeekStart || new Date().toISOString().slice(0, 10);
  const recipients = new Set([String(dashboard.created_by)]);

  const privileged = await User.find({ roles: { $in: ['Administrator', 'Auditor'] }, status: 'ACTIVE' }, { _id: 1 }).lean();
  for (const user of privileged) {
    recipients.add(String(user._id));
  }

  for (const recipientId of recipients) {
    const dedupeKey = `${dashboard.dashboard_id}:${rule.rule_key}:${periodKey}:${recipientId}`;

    try {
      await AnomalyDispatch.create({
        dedupe_key: dedupeKey,
        dashboard_id: dashboard.dashboard_id,
        rule_key: rule.rule_key,
        period_key: String(periodKey),
        recipient_id: recipientId,
        message_id: null
      });

      const message = await createInboxMessage({
        recipientId,
        type: 'ANOMALY',
        title: `Anomaly triggered: ${rule.rule_key}`,
        body: evaluation.message,
        payload: {
          dashboardId: dashboard.dashboard_id,
          rule: rule.rule_key,
          metricKey: rule.metric_key,
          periodKey,
          printable: {
            noticeType: 'ANOMALY_ALERT',
            rule: rule.rule_key,
            message: evaluation.message,
            periodKey
          }
        }
      });

      await AnomalyDispatch.updateOne({ dedupe_key: dedupeKey }, {
        $set: {
        message_id: message._id
        }
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }
};

router.use(requireAuth);
router.use(requireCsrf);

router.post('/metrics', requirePermission('ANALYTICS_METRIC_MANAGE'), async (req, res) => {
  const { key, name, description, dataset, aggregation } = req.body || {};
  if (!key || !name || !dataset || !aggregation) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'key/name/dataset/aggregation', issue: 'required fields missing' }
    ]);
  }

  const dimensions = Array.isArray(req.body.dimensions) ? req.body.dimensions : [];
  const groupBy = req.body.groupBy || null;

  // Normalize dimensions properly
  const normalizedDimensions = dimensions.map(d => {
    if (typeof d === 'string') {
      return { key: d, type: 'STRING' };
    }
    return {
      key: d.key || d,
      type: d.type || 'STRING'
    };
  });

  const metric = await MetricDefinition.create({
    key,
    name,
    description: description || '',
    dataset,
    aggregation,
    dimensions: normalizedDimensions,
    group_by: groupBy,
    filter_template: req.body.filterTemplate || {},
    active: true
  });

  return res.status(201).json({
    data: {
      id: String(metric._id),
      key: metric.key,
      name: metric.name,
      dimensions: metric.dimensions || [],
      groupBy: metric.group_by || null
    }
  });
});

router.post('/dimensions', requirePermission('ANALYTICS_DIMENSION_MANAGE'), async (req, res) => {
  const { key, name, dataset, field, dataType } = req.body || {};
  if (!key || !name || !dataset || !field || !dataType) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'key/name/dataset/field/dataType', issue: 'required fields missing' }
    ]);
  }

  const dimension = await DimensionDefinition.create({
    key,
    name,
    dataset,
    field,
    data_type: dataType,
    active: true
  });

  return res.status(201).json({
    data: {
      id: String(dimension._id),
      key: dimension.key,
      name: dimension.name
    }
  });
});

router.post('/anomaly-rules', requirePermission('ANALYTICS_METRIC_MANAGE'), async (req, res) => {
  const { ruleKey, metricKey, thresholdPercent, minBaselineCount } = req.body || {};
  if (!ruleKey || !metricKey) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'ruleKey/metricKey', issue: 'required fields missing' }
    ]);
  }

  const rule = await AnomalyRule.create({
    rule_key: ruleKey,
    metric_key: metricKey,
    threshold_percent: Number(thresholdPercent || 30),
    min_baseline_count: Number(minBaselineCount || 20),
    enabled: true
  });

  return res.status(201).json({
    data: {
      id: String(rule._id),
      ruleKey: rule.rule_key
    }
  });
});

router.post('/dashboards', requirePermission('ANALYTICS_DASHBOARD_MANAGE'), async (req, res) => {
  const { name, tiles, anomalyRules } = req.body || {};
  if (!name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const dashboardId = `dash_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const dashboard = await DashboardDefinition.create({
    dashboard_id: dashboardId,
    name,
    tiles: Array.isArray(tiles) ? tiles : [],
    anomaly_rules: Array.isArray(anomalyRules) ? anomalyRules : [],
    created_by: req.auth.userId,
    active: true
  });

  return res.status(201).json({
    data: {
      dashboardId: dashboard.dashboard_id,
      name: dashboard.name
    }
  });
});

const resolveModel = (dataset) => {
  const Registration = require('../models/registration');
  const ProgramSession = require('../models/program-session');
  const Job = require('../models/job');
  const map = {
    registrations: Registration,
    program_registrations: Registration,
    participants: require('../models/participant-profile'),
    sessions: ProgramSession,
    staffing_jobs: Job
  };
  return map[dataset] || null;
};

const ALLOWED_FILTER_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']);
const ALLOWED_FILTER_FIELDS = new Set([
  'status', 'created_at', 'updated_at', 'participant_id', 'session_id',
  'program_id', 'coach_id', 'department', 'current_state', 'start_at_utc'
]);

const validateAndBuildFilter = (filterTemplate) => {
  const filter = {};
  if (!filterTemplate || typeof filterTemplate !== 'object') return filter;

  for (const [key, value] of Object.entries(filterTemplate)) {
    if (!ALLOWED_FILTER_FIELDS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const safeOps = {};
      for (const [op, opVal] of Object.entries(value)) {
        if (ALLOWED_FILTER_OPERATORS.has(op)) {
          safeOps[op] = opVal;
        }
      }
      if (Object.keys(safeOps).length > 0) {
        filter[key] = safeOps;
      }
    } else {
      filter[key] = value;
    }
  }
  return filter;
};

const resolveDimensionField = async (dimensionKey, dataset) => {
  const dim = await DimensionDefinition.findOne({
    key: dimensionKey,
    dataset,
    active: true
  }).lean();
  return dim ? dim.field : null;
};

const buildGroupPipeline = async (metricDef, filter) => {
  const pipeline = [];
  if (Object.keys(filter).length > 0) {
    pipeline.push({ $match: filter });
  }

  let resolvedGroupField = null;
  if (metricDef.group_by) {
    resolvedGroupField = await resolveDimensionField(metricDef.group_by, metricDef.dataset);
    if (!resolvedGroupField) {
      resolvedGroupField = metricDef.group_by;
    }
  }

  const groupId = resolvedGroupField ? `$${resolvedGroupField}` : null;

  let resolvedValueField = null;
  if (['sum', 'avg'].includes(metricDef.aggregation) && metricDef.dimensions?.length > 0) {
    const valueDimKey = metricDef.dimensions[0]?.key;
    if (valueDimKey) {
      resolvedValueField = await resolveDimensionField(valueDimKey, metricDef.dataset);
      if (!resolvedValueField) resolvedValueField = valueDimKey;
    }
  }

  if (metricDef.aggregation === 'count') {
    pipeline.push({ $group: { _id: groupId, value: { $sum: 1 } } });
  } else if (metricDef.aggregation === 'sum' && resolvedValueField) {
    pipeline.push({ $group: { _id: groupId, value: { $sum: `$${resolvedValueField}` } } });
  } else if (metricDef.aggregation === 'avg' && resolvedValueField) {
    pipeline.push({ $group: { _id: groupId, value: { $avg: `$${resolvedValueField}` } } });
  } else {
    pipeline.push({ $group: { _id: groupId, value: { $sum: 1 } } });
  }

  pipeline.push({ $sort: { _id: 1 } });
  return pipeline;
};

const computeMetricValue = async (metricKey) => {
  const metricDef = await MetricDefinition.findOne({ key: metricKey, active: true }).lean();
  if (!metricDef) return null;

  const Model = resolveModel(metricDef.dataset);
  if (!Model) return { value: 0, result: { current: 0, previous: 0 } };

  const filter = validateAndBuildFilter(metricDef.filter_template);

  if (metricDef.group_by) {
    const pipeline = await buildGroupPipeline(metricDef, filter);
    const groups = await Model.aggregate(pipeline).catch(() => []);
    const total = groups.reduce((sum, g) => sum + (g.value || 0), 0);
    return { value: total, groups, result: { current: total, previous: 0 } };
  }

  if (metricDef.aggregation === 'count') {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    const currentFilter = { ...filter, created_at: { $gte: weekAgo } };
    const current = await Model.countDocuments(currentFilter).catch(() => 0);
    
    const previousFilter = { ...filter, created_at: { $gte: twoWeeksAgo, $lt: weekAgo } };
    const previous = await Model.countDocuments(previousFilter).catch(() => 0);
    
    return { 
      value: current, 
      result: { current, previous },
      period: {
        currentWeekStart: weekAgo.toISOString(),
        previousWeekStart: twoWeeksAgo.toISOString()
      }
    };
  }

  const pipeline = await buildGroupPipeline(metricDef, filter);
  const agg = await Model.aggregate(pipeline).catch(() => []);
  const value = agg.length > 0 ? agg[0].value : 0;
  return { value, result: { current: value, previous: 0 } };
};

router.get('/dashboards/:dashboardId', requirePermission('ANALYTICS_DASHBOARD_READ'), async (req, res) => {
  const dashboard = await DashboardDefinition.findOne({ dashboard_id: req.params.dashboardId }).lean();
  if (!dashboard) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Dashboard not found');
  }

  const metricResults = {};
  const metricsToCompute = new Set((dashboard.tiles || []).map((tile) => tile.metric).filter(Boolean));

  for (const metricKey of metricsToCompute) {
    const computed = await computeMetricValue(metricKey);
    if (computed) {
      metricResults[metricKey] = computed;
    }
  }

  const tiles = (dashboard.tiles || []).map((tile) => {
    const computed = metricResults[tile.metric];
    return {
      metric: tile.metric,
      value: computed ? computed.value : null
    };
  });

  const rules = await AnomalyRule.find({ rule_key: { $in: dashboard.anomaly_rules }, enabled: true }).lean();
  const anomalies = [];

  for (const rule of rules) {
    const computed = metricResults[rule.metric_key];
    if (!computed) continue;

    const result = computed.result;
    const evaluation = evaluateWowDropRule({
      current: result.current,
      previous: result.previous || 0,
      thresholdPercent: rule.threshold_percent,
      minBaselineCount: rule.min_baseline_count
    });

    anomalies.push({
      rule: rule.rule_key,
      status: evaluation.status,
      message: evaluation.message
    });

    try {
      await dispatchAnomalyInbox({
        dashboard,
        rule,
        metricResult: result,
        evaluation
      });
    } catch (error) {
      logError('analytics', { message: 'Failed to dispatch anomaly inbox', error: error.message });
    }
  }

  return res.status(200).json({
    data: {
      dashboardId: dashboard.dashboard_id,
      tiles,
      anomalies
    }
  });
});

router.post('/reports', requirePermission('ANALYTICS_REPORT_MANAGE'), async (req, res) => {
  const { name, dataset, format, schedule } = req.body || {};
  if (!name || !dataset || !format) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Name, dataset, and format are required');
  }

  if (!validReportFormats.includes(format)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Invalid report format');
  }

  const reportDimensions = Array.isArray(req.body.dimensions) ? req.body.dimensions : [];
  const reportGroupBy = req.body.groupBy || null;
  const reportFilterTemplate = req.body.filterTemplate || {};

  const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  try {
    const definition = await ReportDefinition.create({
      report_id: reportId,
      name,
      dataset,
      format,
      dimensions: reportDimensions,
      group_by: reportGroupBy,
      filter_template: reportFilterTemplate,
      schedule: {
        time: schedule?.time || config.reporting.scheduleTime,
        timezone: schedule?.timezone || config.reporting.scheduleTimezone
      },
      created_by: req.auth.userId,
      active: true
    });

    return res.status(201).json({
      data: {
        reportId: definition.report_id,
        name: definition.name,
        dataset: definition.dataset,
        format: definition.format,
        dimensions: definition.dimensions || [],
        groupBy: definition.group_by || null,
        schedule: definition.schedule
      }
    });
  } catch (error) {
    logError('analytics', { message: 'Failed to create report definition', error: error.message, stack: error.stack });
    throw error;
  }
});

router.post('/reports/:reportId/run', requirePermission('ANALYTICS_REPORT_MANAGE'), async (req, res) => {
  const definition = await ReportDefinition.findOne({ report_id: req.params.reportId });
  if (!definition) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Report definition not found');
  }

  try {
    const run = await runReportDefinition(definition, 'MANUAL', 1);
    return res.status(200).json({
      data: {
        runId: run.run_id,
        status: run.status,
        artifactPath: run.artifact_path,
        checksumSha256: run.checksum_sha256,
        startedAt: run.started_at,
        finishedAt: run.finished_at
      }
    });
  } catch (error) {
    return sendError(res, req, 500, 'REPORT_RUN_FAILED', error.message);
  }
});

router.get('/reports/:reportId/runs', requirePermission('ANALYTICS_REPORT_READ'), async (req, res) => {
  const definition = await ReportDefinition.findOne({ report_id: req.params.reportId }).lean();
  if (!definition) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Report definition not found');
  }

  const runs = await ReportRun.find({ report_id: definition.report_id }).sort({ started_at: -1 }).lean();
  return res.status(200).json({
    data: runs.map((run) => ({
      runId: run.run_id,
      status: run.status,
      artifactPath: run.artifact_path,
      checksumSha256: run.checksum_sha256,
      startedAt: run.started_at,
      finishedAt: run.finished_at
    }))
  });
});

module.exports = router;
