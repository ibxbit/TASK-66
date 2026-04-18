const { randomUUID } = require('crypto');
const express = require('express');
const Venue = require('../models/venue');
const Hall = require('../models/hall');
const Zone = require('../models/zone');
const DisplayCase = require('../models/display-case');
const Route = require('../models/route');
const RouteSegment = require('../models/route-segment');
const Itinerary = require('../models/itinerary');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireStepUp } = require('../middleware/step-up');
const { STEP_UP_ACTIONS } = require('../constants/step-up-actions');
const { sendError } = require('../lib/http');
const { logAuditEvent } = require('../services/events');

const router = express.Router();

const METERS_PER_MINUTE_AT_3MPH = 80.4672;

/* --- Authenticated route-read endpoints (ROUTE_READ permission required) --- */

router.get('/routes', requireAuth, requirePermission('ROUTE_READ'), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const skip = (page - 1) * pageSize;

  const filter = {};
  if (req.query.venueId) filter.venue_id = req.query.venueId;
  if (req.query.status) filter.status = req.query.status;

  const [routes, total] = await Promise.all([
    Route.find(filter).sort({ _id: -1 }).skip(skip).limit(pageSize).lean(),
    Route.countDocuments(filter)
  ]);

  return res.status(200).json({
    data: routes.map((route) => ({
      routeId: route.route_id,
      venueId: String(route.venue_id),
      name: route.name,
      strictSequence: route.strict_sequence,
      defaultPaceMph: route.default_pace_mph,
      status: route.status
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
});

router.get('/routes/:routeId', requireAuth, requirePermission('ROUTE_READ'), async (req, res) => {
  const route = await Route.findOne({ route_id: req.params.routeId }).lean();
  if (!route) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
  }

  const segments = await RouteSegment.find({ route_id: route.route_id }).sort({ order: 1 }).lean();
  return res.status(200).json({
    data: {
      routeId: route.route_id,
      venueId: String(route.venue_id),
      name: route.name,
      strictSequence: route.strict_sequence,
      defaultPaceMph: route.default_pace_mph,
      status: route.status,
      segments: segments.map((segment) => ({
        id: String(segment._id),
        fromCaseId: String(segment.from_case_id),
        toCaseId: String(segment.to_case_id),
        segmentType: segment.segment_type,
        dwellMinutes: segment.dwell_minutes,
        distanceMeters: segment.distance_meters,
        order: segment.order
      }))
    }
  });
});

router.get('/routes/:routeId/itineraries', requireAuth, requirePermission('ROUTE_READ'), async (req, res) => {
  const route = await Route.findOne({ route_id: req.params.routeId }).lean();
  if (!route) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
  }

  const itineraries = await Itinerary.find({ route_id: route.route_id }).sort({ generated_at: -1 }).limit(20).lean();
  return res.status(200).json({
    data: itineraries.map((item) => ({
      itineraryId: item.itinerary_id,
      routeId: item.route_id,
      estimatedWalkMinutes: item.estimated_walk_minutes,
      generatedAt: item.generated_at,
      printable: item.printable_payload
    }))
  });
});

/* --- Write endpoints below (require VENUE_MANAGE or ROUTE_RULE_CHANGE) --- */

router.use(requireAuth);

router.post('/venues', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const { name, timezone, defaultPaceMph } = req.body || {};
  if (!name || !timezone) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name/timezone', issue: 'required fields missing' }
    ]);
  }

  const venue = await Venue.create({
    name,
    timezone,
    default_pace_mph: defaultPaceMph || 3
  });

  return res.status(201).json({
    data: {
      id: String(venue._id),
      name: venue.name,
      timezone: venue.timezone,
      defaultPaceMph: venue.default_pace_mph
    }
  });
});

router.post('/venues/:venueId/halls', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const venue = await Venue.findById(req.params.venueId).lean();
  if (!venue) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Venue not found');
  }
  if (!req.body?.name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const hall = await Hall.create({ venue_id: venue._id, name: req.body.name });
  return res.status(201).json({ data: { id: String(hall._id), venueId: String(venue._id), name: hall.name } });
});

router.post('/halls/:hallId/zones', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const hall = await Hall.findById(req.params.hallId).lean();
  if (!hall) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Hall not found');
  }
  if (!req.body?.name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const zone = await Zone.create({ hall_id: hall._id, name: req.body.name });
  return res.status(201).json({ data: { id: String(zone._id), hallId: String(hall._id), name: zone.name } });
});

router.post('/zones/:zoneId/display-cases', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const zone = await Zone.findById(req.params.zoneId).lean();
  if (!zone) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Zone not found');
  }
  if (!req.body?.name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const displayCase = await DisplayCase.create({ zone_id: zone._id, name: req.body.name });
  return res.status(201).json({
    data: {
      id: String(displayCase._id),
      zoneId: String(zone._id),
      name: displayCase.name
    }
  });
});

router.post('/routes', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const { venueId, name, strictSequence, defaultPaceMph } = req.body || {};
  if (!venueId || !name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'venueId/name', issue: 'required fields missing' }
    ]);
  }

  const venue = await Venue.findById(venueId).lean();
  if (!venue) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Venue not found');
  }

  const route = await Route.create({
    route_id: `rte_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
    venue_id: venue._id,
    name,
    strict_sequence: Boolean(strictSequence),
    default_pace_mph: defaultPaceMph || 3,
    status: 'ACTIVE'
  });

  return res.status(201).json({
    data: {
      routeId: route.route_id,
      venueId: String(route.venue_id),
      name: route.name,
      strictSequence: route.strict_sequence,
      defaultPaceMph: route.default_pace_mph
    }
  });
});

router.post('/routes/:routeId/segments', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const route = await Route.findOne({ route_id: req.params.routeId }).lean();
  if (!route) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
  }

  const { fromCaseId, toCaseId, segmentType, dwellMinutes, distanceMeters, order } = req.body || {};
  const validTypes = ['REQUIRED_NEXT', 'OPTIONAL_BRANCH', 'ACCESSIBILITY_DETOUR'];
  const dwell = Number(dwellMinutes ?? 0);
  const distance = Number(distanceMeters ?? 0);

  if (!fromCaseId || !toCaseId || !validTypes.includes(segmentType) || !Number.isInteger(order) || order < 1) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'segment', issue: 'invalid segment payload' }
    ]);
  }

  if (!Number.isFinite(dwell) || !Number.isFinite(distance) || dwell < 0 || distance < 0) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'dwellMinutes/distanceMeters', issue: 'must be non-negative numbers' }
    ]);
  }

  const [fromCase, toCase] = await Promise.all([
    DisplayCase.findById(fromCaseId).lean(),
    DisplayCase.findById(toCaseId).lean()
  ]);

  if (!fromCase || !toCase) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Display case not found');
  }

  const segment = await RouteSegment.create({
    route_id: route.route_id,
    from_case_id: fromCase._id,
    to_case_id: toCase._id,
    segment_type: segmentType,
    dwell_minutes: dwell,
    distance_meters: distance,
    order
  });

  return res.status(201).json({
    data: {
      id: String(segment._id),
      routeId: segment.route_id,
      fromCaseId: String(segment.from_case_id),
      toCaseId: String(segment.to_case_id),
      segmentType: segment.segment_type,
      dwellMinutes: segment.dwell_minutes,
      distanceMeters: segment.distance_meters,
      order: segment.order
    }
  });
});

router.patch(
  '/routes/:routeId',
  requirePermission('ROUTE_RULE_CHANGE'),
  requireStepUp(STEP_UP_ACTIONS.ROUTE_RULE_CHANGE),
  async (req, res) => {
    const updates = {};
    if (req.body.strictSequence !== undefined) updates.strict_sequence = Boolean(req.body.strictSequence);
    if (req.body.defaultPaceMph !== undefined) updates.default_pace_mph = req.body.defaultPaceMph;

    const route = await Route.findOneAndUpdate({ route_id: req.params.routeId }, updates, {
      new: true
    }).lean();

    if (!route) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
    }

    await logAuditEvent({
      actorId: req.auth.userId,
      action: 'ROUTE_RULE_CHANGE',
      entityType: 'route',
      entityId: route.route_id,
      metadata: { strictSequence: route.strict_sequence, defaultPaceMph: route.default_pace_mph, stepUp: true }
    });

    return res.status(200).json({
      data: {
        routeId: route.route_id,
        strictSequence: route.strict_sequence,
        defaultPaceMph: route.default_pace_mph
      }
    });
  }
);

router.post('/routes/:routeId/itineraries', requirePermission('VENUE_MANAGE'), async (req, res) => {
  const route = await Route.findOne({ route_id: req.params.routeId }).lean();
  if (!route) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Route not found');
  }

  const segments = await RouteSegment.find({ route_id: route.route_id }).sort({ order: 1 }).lean();
  const branchSelections = Array.isArray(req.body?.branchSelections) ? req.body.branchSelections : [];
  const accessibilityMode = Boolean(req.body?.accessibilityMode);

  if (!branchSelections.every((item) => item && item.fromCaseId && item.toCaseId)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'branchSelections', issue: 'each selection requires fromCaseId and toCaseId' }
    ]);
  }

  const optionalKeys = new Set(
    segments
      .filter((segment) => segment.segment_type === 'OPTIONAL_BRANCH')
      .map((segment) => `${String(segment.from_case_id)}:${String(segment.to_case_id)}`)
  );
  const invalidBranch = branchSelections.find(
    (item) => !optionalKeys.has(`${String(item.fromCaseId)}:${String(item.toCaseId)}`)
  );
  if (invalidBranch) {
    return sendError(res, req, 400, 'INVALID_BRANCH_SELECTION', 'Optional branch selection does not exist on route', [
      {
        field: 'branchSelections',
        issue: `${String(invalidBranch.fromCaseId)}:${String(invalidBranch.toCaseId)} is not an OPTIONAL_BRANCH segment`
      }
    ]);
  }

  const selected = [];
  const selectedBranchKey = new Set(
    branchSelections.map((item) => `${String(item.fromCaseId)}:${String(item.toCaseId)}`)
  );

  for (const segment of segments) {
    if (segment.segment_type === 'OPTIONAL_BRANCH') {
      const key = `${String(segment.from_case_id)}:${String(segment.to_case_id)}`;
      if (selectedBranchKey.has(key)) {
        selected.push(segment);
      }
      continue;
    }

    if (segment.segment_type === 'ACCESSIBILITY_DETOUR') {
      if (accessibilityMode) {
        selected.push(segment);
      }
      continue;
    }

    if (segment.segment_type === 'REQUIRED_NEXT') {
      if (accessibilityMode) {
        const replacement = segments.find(
          (candidate) =>
            candidate.segment_type === 'ACCESSIBILITY_DETOUR' &&
            String(candidate.from_case_id) === String(segment.from_case_id)
        );
        if (replacement) {
          continue;
        }
      }
      selected.push(segment);
    }
  }

  const pace = route.default_pace_mph || 3;
  const metersPerMinute = (pace / 3) * METERS_PER_MINUTE_AT_3MPH;
  const dwellMinutes = selected.reduce((acc, segment) => acc + (segment.dwell_minutes || 0), 0);
  const walkMinutes = selected.reduce(
    (acc, segment) => acc + (segment.distance_meters || 0) / metersPerMinute,
    0
  );
  const estimatedWalkMinutes = Number((dwellMinutes + walkMinutes).toFixed(1));

  const itineraryId = `iti_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const printablePayload = {
    itineraryId,
    routeId: route.route_id,
    title: route.name,
    accessibilityMode,
    generatedAt: new Date().toISOString(),
    estimatedWalkMinutes,
    steps: selected.map((segment, index) => ({
      step: index + 1,
      segmentType: segment.segment_type,
      fromCaseId: String(segment.from_case_id),
      toCaseId: String(segment.to_case_id),
      dwellMinutes: segment.dwell_minutes,
      distanceMeters: segment.distance_meters
    }))
  };

  await Itinerary.create({
    itinerary_id: itineraryId,
    route_id: route.route_id,
    accessibility_mode: accessibilityMode,
    estimated_walk_minutes: estimatedWalkMinutes,
    printable_payload: printablePayload
  });

  return res.status(201).json({
    data: {
      itineraryId,
      estimatedWalkMinutes,
      printable: printablePayload
    }
  });
});

module.exports = router;
