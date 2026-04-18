const express = require('express');
const { DateTime } = require('luxon');
const Coach = require('../models/coach');
const CoachAvailability = require('../models/coach-availability');
const Program = require('../models/program');
const ProgramSession = require('../models/program-session');
const Registration = require('../models/registration');
const WaitlistEntry = require('../models/waitlist-entry');
const CreditLedger = require('../models/credit-ledger');
const CreditLedgerEntry = require('../models/credit-ledger-entry');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { sendError } = require('../lib/http');
const config = require('../config');
const { applyCreditEntry } = require('../services/credits');
const { createInboxMessage } = require('../services/inbox');
const { logAuditEvent } = require('../services/events');
const {
  expirePendingPromotions,
  promoteNextWaitlistEntry
} = require('../services/program-waitlist');

const router = express.Router();

const getHoursBeforeStart = (session) => {
  const nowInZone = DateTime.utc().setZone(session.timezone);
  const startInZone = DateTime.fromJSDate(session.start_at_utc).setZone(session.timezone);
  return startInZone.diff(nowInZone, 'hours').hours;
};

router.use(requireAuth);

router.post('/programs', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const { type, title, capacity } = req.body || {};
  if (!type || !title || !Number.isInteger(capacity) || capacity < 1) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'type/title/capacity', issue: 'valid type, title, and capacity required' }
    ]);
  }

  const program = await Program.create({
    type,
    title,
    capacity,
    cancellation_policy: {
      late_cancel_hours: 12,
      late_cancel_deduct: 1,
      no_show_deduct: 2
    }
  });

  return res.status(201).json({
    data: {
      id: String(program._id),
      type: program.type,
      title: program.title,
      capacity: program.capacity
    }
  });
});

router.post('/coaches', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const { name, qualifications, contact } = req.body || {};
  if (!name) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'name', issue: 'is required' }
    ]);
  }

  const coach = await Coach.create({
    name,
    qualifications: Array.isArray(qualifications) ? qualifications : [],
    contact: contact || '',
    active: true
  });

  return res.status(201).json({
    data: {
      id: String(coach._id),
      name: coach.name,
      qualifications: coach.qualifications,
      contact: coach.contact
    }
  });
});

router.post('/coaches/:coachId/availability', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const coach = await Coach.findById(req.params.coachId).lean();
  if (!coach) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Coach not found');
  }

  const { startAtUtc, endAtUtc, timezone, recurrence } = req.body || {};
  if (!startAtUtc || !endAtUtc || !timezone) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'startAtUtc/endAtUtc/timezone', issue: 'required fields missing' }
    ]);
  }

  const availability = await CoachAvailability.create({
    coach_id: coach._id,
    start_at_utc: new Date(startAtUtc),
    end_at_utc: new Date(endAtUtc),
    timezone,
    recurrence: recurrence || null,
    venue_constraints: Array.isArray(req.body.venueConstraints) ? req.body.venueConstraints : [],
    program_constraints: Array.isArray(req.body.programConstraints) ? req.body.programConstraints : []
  });

  return res.status(201).json({
    data: {
      id: String(availability._id),
      coachId: String(coach._id),
      startAtUtc: availability.start_at_utc.toISOString(),
      endAtUtc: availability.end_at_utc.toISOString(),
      timezone: availability.timezone
    }
  });
});

router.post('/program-sessions', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const { programId, coachId, venueId, startAtUtc, endAtUtc, timezone, capacity } = req.body || {};
  if (!programId || !coachId || !venueId || !startAtUtc || !endAtUtc || !timezone || !Number.isInteger(capacity)) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'session', issue: 'invalid session payload' }
    ]);
  }

  const timezoneCheck = DateTime.now().setZone(timezone);
  if (!timezoneCheck.isValid) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'timezone', issue: 'must be a valid IANA timezone' }
    ]);
  }

  const startUtc = DateTime.fromISO(String(startAtUtc), { setZone: true }).toUTC();
  const endUtc = DateTime.fromISO(String(endAtUtc), { setZone: true }).toUTC();
  if (!startUtc.isValid || !endUtc.isValid || endUtc <= startUtc) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'startAtUtc/endAtUtc', issue: 'must be valid ISO times with end after start' }
    ]);
  }

  const [program, coach] = await Promise.all([
    Program.findById(programId).lean(),
    Coach.findById(coachId).lean()
  ]);

  if (!program || !coach) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Program or coach not found');
  }

  const availabilityWindow = await CoachAvailability.findOne({
    coach_id: coach._id,
    start_at_utc: { $lte: startUtc.toJSDate() },
    end_at_utc: { $gte: endUtc.toJSDate() }
  }).lean();

  if (!availabilityWindow) {
    return sendError(res, req, 422, 'COACH_UNAVAILABLE', 'Coach is unavailable for the requested session window', [
      {
        field: 'startAtUtc/endAtUtc',
        issue: 'must fall within a declared coach availability window'
      }
    ]);
  }

  const session = await ProgramSession.create({
    program_id: program._id,
    coach_id: coach._id,
    venue_id: venueId,
    start_at_utc: startUtc.toJSDate(),
    end_at_utc: endUtc.toJSDate(),
    timezone,
    capacity,
    status: 'SCHEDULED'
  });

  return res.status(201).json({
    data: {
      id: String(session._id),
      programId: String(session.program_id),
      coachId: String(session.coach_id),
      startAtUtc: session.start_at_utc.toISOString(),
      endAtUtc: session.end_at_utc.toISOString(),
      timezone: session.timezone,
      capacity: session.capacity
    }
  });
});

router.post('/program-sessions/:sessionId/registrations', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const session = await ProgramSession.findById(req.params.sessionId).lean();
  if (!session) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Program session not found');
  }

  const participantId = req.body?.participantId;
  if (!participantId) {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'participantId', issue: 'is required' }
    ]);
  }

  const existing = await Registration.findOne({
    session_id: session._id,
    participant_id: String(participantId)
  }).lean();
  if (existing) {
    return sendError(res, req, 409, 'CONFLICT', 'Participant already registered for session');
  }

  await expirePendingPromotions(session._id);

  const activeSeatCount = await Registration.countDocuments({
    session_id: session._id,
    status: { $in: ['REGISTERED', 'ATTENDED', 'PROMOTION_PENDING'] }
  });

  if (activeSeatCount >= session.capacity) {
    const last = await WaitlistEntry.findOne({ session_id: session._id }).sort({ position: -1 }).lean();
    const nextPosition = (last?.position || 0) + 1;

    const registration = await Registration.create({
      session_id: session._id,
      participant_id: String(participantId),
      status: 'WAITLISTED',
      waitlist_position: nextPosition
    });

    await WaitlistEntry.create({
      session_id: session._id,
      participant_id: String(participantId),
      registration_id: registration._id,
      position: nextPosition,
      status: 'WAITLISTED'
    });

    await createInboxMessage({
      recipientId: participantId,
      type: 'WAITLIST',
      title: 'Added to waitlist',
      body: 'The session is full. You have been added to the waitlist.',
      payload: {
        sessionId: String(session._id),
        waitlistPosition: nextPosition,
        printable: {
          noticeType: 'WAITLIST_ADDED',
          message: `You are waitlist position ${nextPosition}.`
        }
      }
    });

    return res.status(201).json({
      data: {
        registrationId: String(registration._id),
        status: 'WAITLISTED',
        waitlistPosition: nextPosition
      }
    });
  }

  const registration = await Registration.create({
    session_id: session._id,
    participant_id: String(participantId),
    status: 'REGISTERED'
  });

  await createInboxMessage({
    recipientId: participantId,
    type: 'SYSTEM',
    title: 'Registration confirmed',
    body: 'Your registration is confirmed.',
    payload: {
      sessionId: String(session._id),
      printable: {
        noticeType: 'REGISTRATION_CONFIRMED',
        message: 'Your session registration has been confirmed.'
      }
    }
  });

  return res.status(201).json({
    data: {
      registrationId: String(registration._id),
      status: 'REGISTERED'
    }
  });
});

router.post(
  '/program-sessions/:sessionId/registrations/:registrationId/cancel',
  requirePermission('PROGRAM_MANAGE'),
  async (req, res) => {
    const session = await ProgramSession.findById(req.params.sessionId).lean();
    if (!session) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Program session not found');
    }

    const program = await Program.findById(session.program_id).lean();
    const registration = await Registration.findOne({
      _id: req.params.registrationId,
      session_id: session._id
    });

    if (!registration) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Registration not found');
    }

    if (!['REGISTERED', 'PROMOTION_PENDING'].includes(registration.status)) {
      return sendError(res, req, 409, 'CONFLICT', 'Only active registrations can be marked no-show');
    }

    if (['CANCELLED', 'LATE_CANCEL', 'NO_SHOW'].includes(registration.status)) {
      return sendError(res, req, 409, 'CONFLICT', 'Registration is already closed');
    }

    const previousStatus = registration.status;
    const hoursBeforeStart = getHoursBeforeStart(session);
    const isLate = previousStatus !== 'WAITLISTED' && hoursBeforeStart <= 12;
    const newStatus = isLate ? 'LATE_CANCEL' : 'CANCELLED';
    registration.status = newStatus;
    await registration.save();

    if (previousStatus === 'WAITLISTED') {
      await WaitlistEntry.findOneAndUpdate(
        { registration_id: registration._id },
        { status: 'CANCELLED' }
      );
    }

    let creditsDeducted = 0;
    if (isLate) {
      creditsDeducted = program?.cancellation_policy?.late_cancel_deduct || 1;
      await applyCreditEntry({
        participantId: registration.participant_id,
        programType: program.type,
        entryType: 'DEDUCT',
        amount: creditsDeducted,
        reasonCode: 'LATE_CANCEL',
        relatedRegistrationId: registration._id,
        createdBy: req.auth.userId
      });
    }

    let waitlistPromotion = null;
    if (['REGISTERED', 'PROMOTION_PENDING'].includes(previousStatus)) {
      waitlistPromotion = await promoteNextWaitlistEntry(session, 'CANCELLATION');
    }

    await createInboxMessage({
      recipientId: registration.participant_id,
      type: 'SYSTEM',
      title: 'Registration cancelled',
      body: isLate
        ? 'Late cancellation recorded and credit deduction applied.'
        : 'Cancellation recorded.',
      payload: {
        sessionId: String(session._id),
        status: newStatus,
        creditsDeducted,
        printable: {
          noticeType: 'REGISTRATION_CANCELLATION',
          message: `Status: ${newStatus}`,
          creditsDeducted
        }
      }
    });

    return res.status(200).json({
      data: {
        status: newStatus,
        creditsDeducted,
        policyTimezone: session.timezone,
        hoursBeforeStart: Number(hoursBeforeStart.toFixed(2)),
        waitlistPromotion
      }
    });
  }
);

router.post(
  '/program-sessions/:sessionId/registrations/:registrationId/no-show',
  requirePermission('PROGRAM_MANAGE'),
  async (req, res) => {
    const session = await ProgramSession.findById(req.params.sessionId).lean();
    if (!session) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Program session not found');
    }

    const program = await Program.findById(session.program_id).lean();
    const registration = await Registration.findOne({
      _id: req.params.registrationId,
      session_id: session._id
    });

    if (!registration) {
      return sendError(res, req, 404, 'NOT_FOUND', 'Registration not found');
    }

    if (registration.status === 'NO_SHOW') {
      return res.status(200).json({
        data: {
          status: 'NO_SHOW',
          creditsDeducted: 0,
          waitlistPromotion: null,
          idempotent: true
        }
      });
    }

    if (!['REGISTERED', 'PROMOTION_PENDING'].includes(registration.status)) {
      return sendError(res, req, 409, 'CONFLICT', 'Only active registrations can be marked no-show');
    }

    registration.status = 'NO_SHOW';
    await registration.save();

    const creditsDeducted = program?.cancellation_policy?.no_show_deduct || 2;
    await applyCreditEntry({
      participantId: registration.participant_id,
      programType: program.type,
      entryType: 'DEDUCT',
      amount: creditsDeducted,
      reasonCode: 'NO_SHOW',
      relatedRegistrationId: registration._id,
      createdBy: req.auth.userId
    });

    const waitlistPromotion = await promoteNextWaitlistEntry(session, 'NO_SHOW');

    await createInboxMessage({
      recipientId: registration.participant_id,
      type: 'SYSTEM',
      title: 'No-show recorded',
      body: 'No-show was recorded and credits were deducted.',
      payload: {
        sessionId: String(session._id),
        creditsDeducted,
        printable: {
          noticeType: 'NO_SHOW',
          message: `Credits deducted: ${creditsDeducted}`
        }
      }
    });

    return res.status(200).json({
      data: {
        status: 'NO_SHOW',
        creditsDeducted,
        waitlistPromotion
      }
    });
  }
);

router.post('/program-sessions/:sessionId/waitlist/:entryId/confirm', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const entry = await WaitlistEntry.findOne({
    _id: req.params.entryId,
    session_id: req.params.sessionId
  });

  if (!entry) {
    return sendError(res, req, 404, 'NOT_FOUND', 'Waitlist entry not found');
  }

  if (entry.status !== 'PROMOTION_PENDING') {
    return sendError(res, req, 409, 'CONFLICT', 'Waitlist entry is not pending confirmation');
  }

  if (entry.promotion_expires_at && entry.promotion_expires_at.getTime() <= Date.now()) {
    entry.status = 'EXPIRED';
    await entry.save();
    await Registration.findByIdAndUpdate(entry.registration_id, {
      status: 'WAITLISTED',
      promoted_at: null,
      promotion_expires_at: null
    });
    return sendError(res, req, 409, 'CONFLICT', 'Promotion window expired');
  }

  entry.status = 'CONFIRMED';
  await entry.save();

  const registration = await Registration.findByIdAndUpdate(
    entry.registration_id,
    {
      status: 'REGISTERED',
      waitlist_position: null,
      promotion_expires_at: null
    },
    { new: true }
  );

  await createInboxMessage({
    recipientId: entry.participant_id,
    type: 'WAITLIST',
    title: 'Waitlist promotion confirmed',
    body: 'Your promoted seat has been confirmed.',
    payload: {
      sessionId: req.params.sessionId,
      registrationId: String(registration._id),
      printable: {
        noticeType: 'WAITLIST_CONFIRMED',
        message: 'Your waitlist promotion has been confirmed.'
      }
    }
  });

  return res.status(200).json({
    data: {
      registrationId: String(registration._id),
      status: registration.status
    }
  });
});

router.get('/participants/:participantId/credits', requirePermission('PROGRAM_MANAGE'), async (req, res) => {
  const ledgers = await CreditLedger.find({ participant_id: String(req.params.participantId) }).lean();

  const data = [];
  for (const ledger of ledgers) {
    const entries = await CreditLedgerEntry.find({ ledger_id: ledger._id }).sort({ created_at: -1 }).lean();
    data.push({
      participantId: ledger.participant_id,
      programType: ledger.program_type,
      balance: ledger.balance,
      entries: entries.map((entry) => ({
        entryType: entry.entry_type,
        amount: entry.amount,
        reasonCode: entry.reason_code,
        createdAt: entry.created_at
      }))
    });
  }

  if (data.length === 0) {
    return res.status(200).json({ data: null });
  }

  return res.status(200).json({ data: data.length === 1 ? data[0] : data });
});

router.post(
  '/participants/:participantId/credits/adjustments',
  requirePermission('PROGRAM_MANAGE'),
  async (req, res) => {
    const { entryType, amount, reasonCode, notes, programType } = req.body || {};
    if (!['ADJUST', 'REVERSE', 'GRANT', 'DEDUCT'].includes(entryType) || !Number.isFinite(amount) || !reasonCode) {
      return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
        { field: 'entryType/amount/reasonCode', issue: 'invalid adjustment payload' }
      ]);
    }

    if (!programType) {
      return sendError(res, req, 400, 'VALIDATION_ERROR', 'Request validation failed', [
        { field: 'programType', issue: 'is required' }
      ]);
    }

    const { ledger, entry } = await applyCreditEntry({
      participantId: req.params.participantId,
      programType,
      entryType,
      amount,
      reasonCode,
      createdBy: req.auth.userId,
      notes: notes || ''
    });

    await logAuditEvent({
      actorId: req.auth.userId,
      action: 'CREDIT_ADJUSTMENT',
      entityType: 'credit_ledger_entry',
      entityId: String(entry._id),
      metadata: {
        participantId: req.params.participantId,
        entryType,
        amount,
        reasonCode,
        programType
      }
    });

    return res.status(201).json({
      data: {
        participantId: ledger.participant_id,
        programType: ledger.program_type,
        balance: ledger.balance,
        entry: {
          id: String(entry._id),
          entryType: entry.entry_type,
          amount: entry.amount,
          reasonCode: entry.reason_code,
          createdAt: entry.created_at
        }
      }
    });
  }
);

module.exports = router;
