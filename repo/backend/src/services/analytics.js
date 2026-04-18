const { DateTime } = require('luxon');
const Registration = require('../models/registration');

const countWeeklyBookings = async () => {
  const now = DateTime.utc();
  const currentWeekStart = now.startOf('week');
  const previousWeekStart = currentWeekStart.minus({ weeks: 1 });
  const previousWeekEnd = currentWeekStart.minus({ milliseconds: 1 });

  const [current, previous] = await Promise.all([
    Registration.countDocuments({
      created_at: { $gte: currentWeekStart.toJSDate() },
      status: { $in: ['REGISTERED', 'ATTENDED', 'PROMOTION_PENDING'] }
    }),
    Registration.countDocuments({
      created_at: {
        $gte: previousWeekStart.toJSDate(),
        $lte: previousWeekEnd.toJSDate()
      },
      status: { $in: ['REGISTERED', 'ATTENDED', 'PROMOTION_PENDING'] }
    })
  ]);

  return {
    metricKey: 'weekly_bookings',
    current: current || 0,
    previous: previous || 0,
    period: {
      currentWeekStart: currentWeekStart.toISO(),
      previousWeekStart: previousWeekStart.toISO()
    }
  };
};

const evaluateWowDropRule = ({ current, previous, thresholdPercent, minBaselineCount }) => {
  if (previous === 0 || previous < minBaselineCount) {
    return {
      status: 'INCONCLUSIVE',
      message: 'Insufficient baseline volume to evaluate rule'
    };
  }

  const drop = ((previous - current) / previous) * 100;
  if (thresholdPercent < 0 || drop > thresholdPercent) {
    return {
      status: 'TRIGGERED',
      message: `Bookings dropped ${drop.toFixed(1)}% week-over-week`
    };
  }

  return {
    status: 'OK',
    message: `Bookings change ${drop.toFixed(1)}% week-over-week`
  };
};

module.exports = {
  countWeeklyBookings,
  evaluateWowDropRule
};
