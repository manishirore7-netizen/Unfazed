const { calculateAvailableSlots } = require("../src/utils/slotCalculator");
const { getUtcFromLocal, generateBookedBuckets } = require("../src/utils/timezoneUtils");

function runSlotCalculatorTests() {
  console.log("=== Testing Slot Calculation Engine ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Base availability: Mon - Fri, 09:00 - 17:00 in Asia/Kolkata, 15m buffer, 2h notice
  const baseAvailability = {
    timezone: "Asia/Kolkata",
    bufferTimeMinutes: 15,
    noticePeriodHours: 2,
    bookingWindowDays: 60,
    sessionDurations: [30, 45, 60, 90],
    weeklySchedule: [
      { dayOfWeek: 0, isOpen: false, timeSlots: [] }, // Sun
      { dayOfWeek: 1, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "12:00" }] }, // Mon: 09:00 - 12:00
      { dayOfWeek: 2, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
      { dayOfWeek: 3, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
      { dayOfWeek: 4, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
      { dayOfWeek: 5, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
      { dayOfWeek: 6, isOpen: false, timeSlots: [] }, // Sat
    ],
  };

  // Fixed reference point: 2026-11-15 00:00 UTC (Sunday)
  const fixedNow = new Date("2026-11-15T00:00:00.000Z");

  // Test 1: Slots on Monday 2026-11-16 (09:00 - 12:00 IST), 60-min duration
  // In 3 hours (180 mins), with 15-minute step and 60-min duration, slots can start at 09:00, 09:15, ..., up to 11:00 (ends at 12:00).
  const slots60 = calculateAvailableSlots({
    availability: baseAvailability,
    queryDate: "2026-11-16",
    duration: 60,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });

  assert(slots60.length > 0, "Generates available slots on open Monday");
  assert(slots60[0].clientStartTime === "09:00", "First slot starts at 09:00 IST");
  assert(slots60[slots60.length - 1].clientEndTime === "12:00", "Last 60m slot finishes by 12:00 IST");

  // Test 2: Closed day (Sunday 2026-11-15) returns 0 slots
  const closedSlots = calculateAvailableSlots({
    availability: baseAvailability,
    queryDate: "2026-11-15",
    duration: 60,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });
  assert(closedSlots.length === 0, "Closed Sunday produces 0 slots");

  // Test 3: Date Override (Blocked Day)
  const overrideBlocked = [
    { date: "2026-11-16", isBlocked: true, reason: "Festival Holiday" },
  ];
  const blockedDaySlots = calculateAvailableSlots({
    availability: baseAvailability,
    overrides: overrideBlocked,
    queryDate: "2026-11-16",
    duration: 60,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });
  assert(blockedDaySlots.length === 0, "Override with isBlocked: true suppresses all slots on that date");

  // Test 4: Date Override (Custom hours on Sunday)
  const overrideSunday = [
    { date: "2026-11-15", isBlocked: false, timeSlots: [{ startTime: "14:00", endTime: "16:00" }] },
  ];
  const customSundaySlots = calculateAvailableSlots({
    availability: baseAvailability,
    overrides: overrideSunday,
    queryDate: "2026-11-15",
    duration: 60,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });
  assert(customSundaySlots.length > 0, "Custom Sunday override enables slots");
  assert(customSundaySlots[0].clientStartTime === "14:00", "Custom Sunday slot starts at 14:00");

  // Test 5: BlockedSlot exclusion
  // Block 10:00 - 11:00 IST on Monday 2026-11-16
  const blockStartUtc = getUtcFromLocal("2026-11-16", "10:00", "Asia/Kolkata");
  const blockEndUtc = getUtcFromLocal("2026-11-16", "11:00", "Asia/Kolkata");
  const blockedSlots = [
    { startTime: blockStartUtc, endTime: blockEndUtc, reason: "Dentist Appointment" },
  ];

  const slotsWithBlock = calculateAvailableSlots({
    availability: baseAvailability,
    blockedSlots,
    queryDate: "2026-11-16",
    duration: 60,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });

  const hasConflictingStart = slotsWithBlock.some(
    (s) => s.clientStartTime === "10:00" || s.clientStartTime === "10:15" || s.clientStartTime === "09:30"
  );
  assert(!hasConflictingStart, "Candidate slots overlapping BlockedSlot (including 09:30-10:30) are excluded");

  // Test 6: Existing confirmed Booking exclusion (including buffer)
  // Book 09:00 - 09:45 (45 min) + 15 min buffer (until 10:00)
  const bookingStartUtc = getUtcFromLocal("2026-11-16", "09:00", "Asia/Kolkata");
  const bookingBuckets = generateBookedBuckets(bookingStartUtc, 45, 15);
  const bookings = [
    {
      status: "confirmed",
      startTime: bookingStartUtc,
      endTime: new Date(bookingStartUtc.getTime() + 45 * 60 * 1000),
      bookedBuckets: bookingBuckets,
    },
  ];

  const slotsWithBooking = calculateAvailableSlots({
    availability: baseAvailability,
    bookings,
    queryDate: "2026-11-16",
    duration: 45,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });

  const booksAt0900 = slotsWithBooking.some((s) => s.clientStartTime === "09:00");
  const booksAt0915 = slotsWithBooking.some((s) => s.clientStartTime === "09:15");
  const booksAt1000 = slotsWithBooking.some((s) => s.clientStartTime === "10:00");

  assert(!booksAt0900, "09:00 slot is occupied and excluded");
  assert(!booksAt0915, "09:15 slot is within existing session and excluded");
  assert(booksAt1000, "10:00 slot starting right after buffer is available");

  // Test 7: Client in New York timezone (cross-day calculation)
  // 09:00 IST on Nov 16 is 22:30 EST on Nov 15!
  const nySlots = calculateAvailableSlots({
    availability: baseAvailability,
    queryDate: "2026-11-15", // In NY, this matches Sunday night IST Monday morning!
    duration: 60,
    clientTimezone: "America/New_York",
    now: fixedNow,
  });

  assert(nySlots.length > 0, "NY client gets slots on local Sunday corresponding to IST Monday morning");
  assert(nySlots[0].clientStartTime === "22:30", "First NY slot is at 22:30 EST");

  // Test 8: Notice Period exclusion
  // If `now` is Monday 09:30 IST, and notice is 2 hours, slots before 11:30 IST must be excluded
  const nowMondayMorning = getUtcFromLocal("2026-11-16", "09:30", "Asia/Kolkata");
  const noticeSlots = calculateAvailableSlots({
    availability: baseAvailability,
    queryDate: "2026-11-16",
    duration: 30,
    clientTimezone: "Asia/Kolkata",
    now: nowMondayMorning,
  });

  assert(
    noticeSlots.every((s) => s.clientStartTime >= "11:30"),
    "All available slots respect 2-hour notice period"
  );

  // Test 9: Multi-duration overlap collision test
  // An existing 60m booking at 10:00 (ends 11:00) with 15m buffer (until 11:15)
  const bStart = getUtcFromLocal("2026-11-16", "10:00", "Asia/Kolkata");
  const bBuckets = generateBookedBuckets(bStart, 60, 15);
  const existing60mBooking = [
    {
      status: "confirmed",
      startTime: bStart,
      endTime: new Date(bStart.getTime() + 60 * 60 * 1000),
      bookedBuckets: bBuckets,
    },
  ];

  // Request 30m duration slots
  const slots30m = calculateAvailableSlots({
    availability: baseAvailability,
    bookings: existing60mBooking,
    queryDate: "2026-11-16",
    duration: 30,
    clientTimezone: "Asia/Kolkata",
    now: fixedNow,
  });

  // Verify that slots starting inside [10:00, 11:15) are strictly omitted
  const hasCollision30m = slots30m.some(
    (s) =>
      s.clientStartTime === "10:00" ||
      s.clientStartTime === "10:15" ||
      s.clientStartTime === "10:30" ||
      s.clientStartTime === "10:45" ||
      s.clientStartTime === "11:00"
  );
  assert(!hasCollision30m, "All overlapping 30m slots inside 10:00 - 11:15 are excluded");

  // Verify that slot starting immediately at 11:15 (post-buffer) IS available
  const has1115Slot = slots30m.some((s) => s.clientStartTime === "11:15");
  assert(has1115Slot, "30m slot starting right at 11:15 (after 60m session + 15m buffer) is available");

  // Test 10: Daylight Saving Time transition handling (March 8, 2026 spring-forward in NY)
  const nyAvailability = {
    timezone: "America/New_York",
    bufferTimeMinutes: 15,
    noticePeriodHours: 0,
    bookingWindowDays: 365,
    sessionDurations: [60],
    weeklySchedule: [
      { dayOfWeek: 0, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "12:00" }] }, // Sunday March 8, 2026
      { dayOfWeek: 1, isOpen: false, timeSlots: [] },
      { dayOfWeek: 2, isOpen: false, timeSlots: [] },
      { dayOfWeek: 3, isOpen: false, timeSlots: [] },
      { dayOfWeek: 4, isOpen: false, timeSlots: [] },
      { dayOfWeek: 5, isOpen: false, timeSlots: [] },
      { dayOfWeek: 6, isOpen: false, timeSlots: [] },
    ],
  };

  const dstSlots = calculateAvailableSlots({
    availability: nyAvailability,
    queryDate: "2026-03-08",
    duration: 60,
    clientTimezone: "America/New_York",
    now: new Date("2026-03-01T00:00:00.000Z"),
  });
  assert(dstSlots.length > 0, "Generates valid slots on Daylight Saving transition Sunday (March 8, 2026)");
  assert(dstSlots[0].clientStartTime === "09:00", "First DST slot aligns to 09:00 local time");
  // 09:00 EDT (UTC-4) on March 8 is 13:00 UTC
  assert(dstSlots[0].startTime === "2026-03-08T13:00:00.000Z", "DST slot UTC timestamp reflects transition to EDT (UTC-4)");

  // Test 11: Trans-Pacific Date Line conversion (Tokyo vs Honolulu, 19-hour time difference)
  const tokyoAvailability = {
    timezone: "Asia/Tokyo",
    bufferTimeMinutes: 15,
    noticePeriodHours: 0,
    bookingWindowDays: 60,
    sessionDurations: [60],
    weeklySchedule: [
      { dayOfWeek: 0, isOpen: false, timeSlots: [] },
      { dayOfWeek: 1, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "12:00" }] }, // Monday morning JST
      { dayOfWeek: 2, isOpen: false, timeSlots: [] },
      { dayOfWeek: 3, isOpen: false, timeSlots: [] },
      { dayOfWeek: 4, isOpen: false, timeSlots: [] },
      { dayOfWeek: 5, isOpen: false, timeSlots: [] },
      { dayOfWeek: 6, isOpen: false, timeSlots: [] },
    ],
  };

  // Monday 09:00 JST on 2026-11-16 is Sunday 14:00 HST on 2026-11-15 in Honolulu
  const honoluluSlots = calculateAvailableSlots({
    availability: tokyoAvailability,
    queryDate: "2026-11-15",
    duration: 60,
    clientTimezone: "Pacific/Honolulu",
    now: fixedNow,
  });
  assert(honoluluSlots.length > 0, "Client across Date Line in Honolulu gets slots on local Sunday matching Tokyo Monday");
  assert(honoluluSlots[0].clientStartTime === "14:00", "Tokyo Monday 09:00 JST correctly maps to Honolulu Sunday 14:00 HST");

  console.log(`\nSlot Calculation Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runSlotCalculatorTests();
