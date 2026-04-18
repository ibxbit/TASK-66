const { randomUUID } = require('crypto');
const express = require('express');
const Job = require('../models/job');
const JobVersion = require('../models/job-version');
const JobWorkflowEvent = require('../models/job-workflow-event');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireStepUp } = require('../middleware/step-up');
const { STEP_UP_ACTIONS } = require('../constants/step-up-actions');
const { sendError } = require('../lib/http');
const { createInboxMessage } = require('../services/inbox');
const { logAuditEvent } = require('../services/events');

const router = express.Router();

const isAdministrator = (req) => (req.auth?.roles || []).includes('Administrator');
const isEmployer = (req) => (req.auth?.roles || []).includes('Employer');

const requireJobOwnershipForEmployer = (req, res, job, actionLabel) => {
  if (isAdministrator(req)) {
    return true;
  }

  if (isEmployer(req) && String(job.created_by) !== String(req.auth.userId)) {
    sendError(res, req, 403, 'FORBIDDEN', `Employer cannot ${actionLabel} jobs created by another user`);
    return false;
  }

  return true;
};

const ALLOWED_TRANSITIONS = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['TAKEDOWN'],
  TAKEDOWN: ['APPEAL_PENDING'],
  APPEAL_PENDING: ['REJECTED_APPEAL', 'REPUBLISHED_NEW_VERSION'],
  REJECTED_APPEAL: [],
  REPUBLISHED_NEW_VERSION: []
};

const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

const createVersion = async (job, actorId, reason) => {
  const latest = await JobVersion.findOne({ job_id: job._id }).sort({ version: -1 }).lean();
  const version = (latest?.version || 0) + 1;
  return JobVersion.create({
    job_id: job._id,
    version,
    snapshot: {
      department: job.department,
      title: job.title,
      description: job.description,
      shiftInfo: job.shift_info,
      state: job.current_state
    },
    actor_id: String(actorId),
    reason
  });
};

const recordTransition = async ({ job, fromState, toState, actorId, comment = '', metadata = {} }) => {
  await JobWorkflowEvent.create({
    job_id: job._id,
    from_state: fromState,
    to_state: toState,
    actor_id: String(actorId),
    comment,
    metadata
  });
};

router.use(requireAuth);

router.get('/', requirePermission('JOB_READ'), async (req, res) => {
  const query = {};

  const state =
    req.query['filter[state]'] || req.query?.filter?.state || req.query.state;
  if (state) {
    query.current_state = state;
  }

  const department =
    req.query['filter[department]'] ||
    req.query?.filter?.department ||
    req.query.department;
  if (department) {
    query.department = department;
  }

  if (isEmployer(req) && !isAdministrator(req)) {
    query.created_by = String(req.auth.userId);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(51, Math.max(1, Number(req.query.pageSize) || 20));
  const sortField = req.query.sort === 'oldest' ? { created_at: 1 } : { created_at: -1 };

  const [total, docs] = await Promise.all([
    Job.countDocuments(query),
    Job.find(query)
      .sort(sortField)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);

  return res.status(200).json({
    data: docs.map((job) => ({
      jobId: String(job._id),
      department: job.department,
      title: job.title,
      description: job.description,
      shiftInfo: job.shift_info,
      state: job.current_state,
      createdBy: job.created_by,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  });
});

router.post('/', requirePermission('JOB_EDIT'), async (req, res) => {
  const { department, title, description, shiftInfo } = req.body || {};
  if (!department || !title || !description || !shiftInfo) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'department/title/description/shiftInfo', issue: 'required fields missing' }
    ]);
  }

  const job = await Job.create({
    department,
    title,
    description,
    shift_info: shiftInfo,
    current_state: 'DRAFT',
    created_by: req.auth.userId
  });

  await createVersion(job, req.auth.userId, 'Initial draft');

  return res.status(201).json({
    data: {
      jobId: String(job._id),
      state: job.current_state
    }
  });
});

router.patch('/:jobId', requirePermission('JOB_EDIT'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }

  if (!requireJobOwnershipForEmployer(req, res, job, 'edit')) {
    return;
  }

  if (!['DRAFT', 'TAKEDOWN', 'REJECTED_APPEAL'].includes(job.current_state)) {
    return sendError(res, req, 409, 'CONFLICT', 'Job state does not allow edit');
  }

  if (req.body.department !== undefined) job.department = req.body.department;
  if (req.body.title !== undefined) job.title = req.body.title;
  if (req.body.description !== undefined) job.description = req.body.description;
  if (req.body.shiftInfo !== undefined) job.shift_info = req.body.shiftInfo;

  await job.save();
  await createVersion(job, req.auth.userId, 'Draft updated');

  return res.status(200).json({
    data: {
      jobId: String(job._id),
      state: job.current_state
    }
  });
});

router.post('/:jobId/submit', requirePermission('JOB_EDIT'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }

  if (!requireJobOwnershipForEmployer(req, res, job, 'submit')) {
    return;
  }

  if (!canTransition(job.current_state, 'PENDING_APPROVAL')) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const fromState = job.current_state;
  job.current_state = 'PENDING_APPROVAL';
  await job.save();
  await recordTransition({
    job,
    fromState,
    toState: 'PENDING_APPROVAL',
    actorId: req.auth.userId,
    comment: 'Submitted for approval'
  });

  await createInboxMessage({
    recipientId: req.auth.userId,
    type: 'WORKFLOW',
    title: 'Job submitted',
    body: 'Job moved to pending approval.',
    payload: { jobId: String(job._id) }
  });

  return res.status(200).json({
    data: {
      jobId: String(job._id),
      state: job.current_state
    }
  });
});

router.post('/:jobId/approve', requirePermission('JOB_APPROVE'), requireStepUp(STEP_UP_ACTIONS.JOB_APPROVE), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }
  if (!canTransition(job.current_state, 'PUBLISHED')) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const fromState = job.current_state;
  job.current_state = 'PUBLISHED';
  await job.save();

  await recordTransition({
    job,
    fromState,
    toState: 'PUBLISHED',
    actorId: req.auth.userId,
    comment: req.body?.comment || 'Approved',
    metadata: { stepUp: true }
  });
  await createVersion(job, req.auth.userId, 'Approved and published');
  await logAuditEvent({
    actorId: req.auth.userId,
    action: 'JOB_APPROVE',
    entityType: 'job',
    entityId: String(job._id),
    metadata: { stepUp: true }
  });

  return res.status(200).json({ data: { jobId: String(job._id), state: job.current_state } });
});

router.post('/:jobId/reject', requirePermission('JOB_APPROVE'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }
  if (!canTransition(job.current_state, 'DRAFT')) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const fromState = job.current_state;
  job.current_state = 'DRAFT';
  await job.save();
  await recordTransition({
    job,
    fromState,
    toState: 'DRAFT',
    actorId: req.auth.userId,
    comment: req.body?.comment || 'Rejected'
  });

  return res.status(200).json({ data: { jobId: String(job._id), state: job.current_state } });
});

router.post('/:jobId/takedown', requirePermission('JOB_APPROVE'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }
  if (!canTransition(job.current_state, 'TAKEDOWN')) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const fromState = job.current_state;
  job.current_state = 'TAKEDOWN';
  await job.save();
  await recordTransition({
    job,
    fromState,
    toState: 'TAKEDOWN',
    actorId: req.auth.userId,
    comment: req.body?.reason || 'Policy takedown',
    metadata: {
      policyCode: req.body?.policyCode || null
    }
  });

  return res.status(200).json({ data: { jobId: String(job._id), state: job.current_state } });
});

router.post('/:jobId/appeals', requirePermission('JOB_EDIT'), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }

  if (!requireJobOwnershipForEmployer(req, res, job, 'appeal')) {
    return;
  }
  if (!canTransition(job.current_state, 'APPEAL_PENDING')) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const appealId = `apl_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const fromState = job.current_state;
  job.current_state = 'APPEAL_PENDING';
  job.current_appeal_id = appealId;
  await job.save();

  await recordTransition({
    job,
    fromState,
    toState: 'APPEAL_PENDING',
    actorId: req.auth.userId,
    comment: req.body?.comment || 'Appeal submitted',
    metadata: { appealId }
  });

  return res.status(201).json({ data: { appealId, state: job.current_state } });
});

router.post('/:jobId/appeals/:appealId/decide', requirePermission('JOB_APPROVE'), requireStepUp(STEP_UP_ACTIONS.JOB_APPEAL_DECIDE), async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }

  if (job.current_state !== 'APPEAL_PENDING' || job.current_appeal_id !== req.params.appealId) {
    return sendError(res, req, 409, 'CONFLICT', 'Appeal is not pending for this job');
  }

  const decision = req.body?.decision;
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'decision', issue: 'must be APPROVE or REJECT' }
    ]);
  }

  const toState = decision === 'APPROVE' ? 'REPUBLISHED_NEW_VERSION' : 'REJECTED_APPEAL';
  if (!canTransition(job.current_state, toState)) {
    return sendError(res, req, 409, 'CONFLICT', 'Invalid workflow transition');
  }

  const fromState = job.current_state;
  job.current_state = toState;
  await job.save();

  await recordTransition({
    job,
    fromState,
    toState,
    actorId: req.auth.userId,
    comment: req.body?.comment || '',
    metadata: { appealId: req.params.appealId, stepUp: true }
  });

  if (decision === 'APPROVE') {
    await createVersion(job, req.auth.userId, 'Appeal approved, republished new version');
  }

  await logAuditEvent({
    actorId: req.auth.userId,
    action: 'JOB_APPEAL_DECISION',
    entityType: 'job',
    entityId: String(job._id),
    metadata: { appealId: req.params.appealId, decision, stepUp: true }
  });

  return res.status(200).json({
    data: {
      jobId: String(job._id),
      state: job.current_state
    }
  });
});

router.get('/:jobId/history', requirePermission('JOB_READ'), async (req, res) => {
  const job = await Job.findById(req.params.jobId).lean();
  if (!job) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Job not found');
  }

  if (!requireJobOwnershipForEmployer(req, res, job, 'view history for')) {
    return;
  }

  const [versions, events] = await Promise.all([
    JobVersion.find({ job_id: job._id }).sort({ version: 1 }).lean(),
    JobWorkflowEvent.find({ job_id: job._id }).sort({ created_at: 1 }).lean()
  ]);

  return res.status(200).json({
    data: {
      jobId: String(job._id),
      state: job.current_state,
      versions: versions.map((version) => ({
        version: version.version,
        snapshot: version.snapshot,
        actorId: version.actor_id,
        reason: version.reason,
        createdAt: version.created_at
      })),
      workflowEvents: events.map((event) => ({
        id: String(event._id),
        fromState: event.from_state,
        toState: event.to_state,
        actorId: event.actor_id,
        comment: event.comment,
        metadata: event.metadata,
        createdAt: event.created_at
      }))
    }
  });
});

module.exports = router;
