const {
  isValidTimezone,
  getLocalParts,
  getUtcFromLocal,
  generateBookedBuckets,
} = require("./timezoneUtils");

/**
 * Slot Calculation Engine for Unfazed
 * Computes available booking slots for a requested calendar date and duration,
 * taking into account:
 * - Recurring weekly schedule
 * - One-time date overrides (custom hours or blocked day)
 * - Blocked slots (intraday unavailable periods)
 * - Existing confirmed bookings (including buffer times)
 * - Notice periods (minimum advance booking notice)
 * - Booking window (maximum future booking horizon)
 * - Timezone conversions between therapist and client
 */

/**
 * Calculates available slots for a specific target date in the client's timezone.
 *
 * @param {Object} params
 * @param {Object} params.availability - Therapist Availability document
 * @param {Array} params.overrides - Array of AvailabilityOverride documents
 * @param {Array} params.blockedSlots - Array of BlockedSlot documents
 * @param {Array} params.bookings - Array of confirmed Booking documents
 * @param {string} params.queryDate - Target date "YYYY-MM-DD" in client timezone
 * @param {number} params.duration - Desired duration in minutes (30, 45, 60, 90)
 * @param {string} params.clientTimezone - IANA timezone of the client (defaults to therapist timezone)
 * @param {Date} [params.now] - Current UTC timestamp (defaults to new Date())
 * @returns {Array<{ startTime: string, endTime: string, clientDate: string, clientStartTime: string, clientEndTime: string }>}
 */
const calculateAvailableSlots = ({
  availability,
  overrides = [],
  blockedSlots = [],
  bookings = [],
  queryDate,
  date,
  duration,
  clientTimezone,
  now = new Date(),
}) => {
  const effectiveDate = queryDate || date;
  if (!availability) {
    throw new Error("Therapist availability configuration is required.");
  }

  const therapistTz = availability.timezone || "Asia/Kolkata";
  const clientTz = isValidTimezone(clientTimezone) ? clientTimezone : therapistTz;

  const bufferMinutes = availability.bufferTimeMinutes ?? 15;
  const noticeHours = availability.noticePeriodHours ?? 2;
  const bookingWindowDays = availability.bookingWindowDays ?? 60;
  const stepMinutes = 15; // 15-minute slot alignment step

  // Earliest and latest allowed start times
  const earliestAllowedTime = new Date(now.getTime() + noticeHours * 60 * 60 * 1000);
  const latestAllowedTime = new Date(
    now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000
  );

  // Define client target day window in UTC
  const clientDayStart = getUtcFromLocal(effectiveDate, "00:00", clientTz);
  const clientDayEnd = new Date(clientDayStart.getTime() + 24 * 60 * 60 * 1000);

  // Map client day window to therapist local calendar dates (can cross midnight)
  const tStartDateParts = getLocalParts(clientDayStart, therapistTz);
  const tEndDateParts = getLocalParts(clientDayEnd, therapistTz);

  const therapistDatesSet = new Set([
    tStartDateParts.dateString,
    tEndDateParts.dateString,
  ]);

  // Index existing booked buckets and blocked ranges for O(1) / fast collision checks
  const existingBookedBuckets = new Set();
  for (const b of bookings) {
    if (b.status === "confirmed" && Array.isArray(b.bookedBuckets)) {
      for (const bucket of b.bookedBuckets) {
        existingBookedBuckets.add(bucket);
      }
    }
  }

  // Pre-index overrides by therapist date string
  const overrideMap = new Map();
  for (const o of overrides) {
    overrideMap.set(o.date, o);
  }

  const availableSlots = [];

  // Iterate over each overlapping therapist calendar date
  for (const tDateStr of therapistDatesSet) {
    const override = overrideMap.get(tDateStr);

    let activeIntervals = [];

    if (override) {
      if (override.isBlocked) {
        // Therapist is completely off on this date
        activeIntervals = [];
      } else if (Array.isArray(override.timeSlots)) {
        // Use custom override hours
        activeIntervals = override.timeSlots;
      }
    } else {
      // Lookup day of week in therapist's weekly schedule
      const [year, month, day] = tDateStr.split("-").map(Number);
      // Construct a safe midday UTC to determine day of week in therapist timezone
      const testMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const dayOfWeek = getLocalParts(testMidday, therapistTz).dayOfWeek;

      const dayConfig = availability.weeklySchedule?.find(
        (d) => d.dayOfWeek === dayOfWeek
      );

      if (dayConfig && dayConfig.isOpen && Array.isArray(dayConfig.timeSlots)) {
        activeIntervals = dayConfig.timeSlots;
      }
    }

    // Generate candidate slots for each active interval
    for (const interval of activeIntervals) {
      let intervalStartUtc;
      let intervalEndUtc;

      try {
        intervalStartUtc = getUtcFromLocal(tDateStr, interval.startTime, therapistTz);
        intervalEndUtc = getUtcFromLocal(tDateStr, interval.endTime, therapistTz);
      } catch {
        // Skip invalid local intervals (e.g. DST gap)
        continue;
      }

      const durationMs = duration * 60 * 1000;
      const stepMs = stepMinutes * 60 * 1000;

      // Candidate slot start pointer
      let candidateStartMs = intervalStartUtc.getTime();

      while (candidateStartMs + durationMs <= intervalEndUtc.getTime()) {
        const candidateStart = new Date(candidateStartMs);
        const candidateEnd = new Date(candidateStartMs + durationMs);

        // Check 1: Must fall on the client's requested date in client timezone
        const clientParts = getLocalParts(candidateStart, clientTz);
        if (clientParts.dateString === queryDate) {
          // Check 2: Must be within allowed notice & booking window
          if (
            candidateStart >= earliestAllowedTime &&
            candidateStart <= latestAllowedTime
          ) {
            // Check 3: Collision check against BlockedSlots
            const candidateWindowEnd = new Date(
              candidateStartMs + (duration + bufferMinutes) * 60 * 1000
            );

            const hasBlockedCollision = blockedSlots.some(
              (block) =>
                block.startTime < candidateWindowEnd && block.endTime > candidateStart
            );

            if (!hasBlockedCollision) {
              // Check 4: Collision check against Bookings via bookedBuckets
              const candidateBuckets = generateBookedBuckets(
                candidateStart,
                duration,
                bufferMinutes
              );

              const hasBookingCollision = candidateBuckets.some((bucket) =>
                existingBookedBuckets.has(bucket)
              );

              if (!hasBookingCollision) {
                const endClientParts = getLocalParts(candidateEnd, clientTz);

                availableSlots.push({
                  startTime: candidateStart.toISOString(),
                  endTime: candidateEnd.toISOString(),
                  clientDate: clientParts.dateString,
                  clientStartTime: clientParts.timeString,
                  clientEndTime: endClientParts.timeString,
                });
              }
            }
          }
        }

        candidateStartMs += stepMs;
      }
    }
  }

  // Sort slots chronologically
  availableSlots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return availableSlots;
};

module.exports = {
  calculateAvailableSlots,
};
