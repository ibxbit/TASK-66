const WaitlistEntry = require('../models/waitlist-entry');
const Registration = require('../models/registration');
const { createInboxMessage } = require('./inbox');
const config = require('../config');

const promotionExpiryMs = config.operations.waitlistPromotionExpiryMinutes * 60 * 1000;

const expirePendingPromotions = async (sessionId) => {
  const now = new Date();
  const expiredEntries = await WaitlistEntry.find({
    session_id: sessionId,
    status: 'PROMOTION_PENDING',
    promotion_expires_at: { $lte: now }
  });

  for (const entry of expiredEntries) {
    entry.status = 'EXPIRED';
    await entry.save();

    await Registration.findByIdAndUpdate(entry.registration_id, {
      status: 'WAITLISTED',
      promoted_at: null,
      promotion_expires_at: null
    });
  }
};

const promoteNextWaitlistEntry = async (session, reasonContext) => {
  await expirePendingPromotions(session._id);

  const next = await WaitlistEntry.findOne({
    session_id: session._id,
    status: 'WAITLISTED'
  }).sort({ position: 1 });

  if (!next) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + promotionExpiryMs);

  next.status = 'PROMOTION_PENDING';
  next.promoted_at = now;
  next.promotion_expires_at = expiresAt;
  await next.save();

  await Registration.findByIdAndUpdate(next.registration_id, {
    status: 'PROMOTION_PENDING',
    promoted_at: now,
    promotion_expires_at: expiresAt
  });

  await createInboxMessage({
    recipientId: next.participant_id,
    type: 'WAITLIST',
    title: 'Promotion pending',
    body: 'A seat opened up. Confirm before expiry to secure your spot.',
    payload: {
      reason: reasonContext,
      sessionId: String(session._id),
      expiresAt: expiresAt.toISOString(),
      printable: {
        noticeType: 'WAITLIST_PROMOTION',
        message: 'You have been promoted from the waitlist.',
        expiresAt: expiresAt.toISOString()
      }
    }
  });

  return {
    participantId: next.participant_id,
    status: 'PROMOTION_PENDING',
    expiresAt: expiresAt.toISOString(),
    entryId: String(next._id)
  };
};

module.exports = {
  expirePendingPromotions,
  promoteNextWaitlistEntry
};
