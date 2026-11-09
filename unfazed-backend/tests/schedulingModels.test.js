const mongoose = require("mongoose");
const Availability = require("../src/models/Availability");
const AvailabilityOverride = require("../src/models/AvailabilityOverride");
const BlockedSlot = require("../src/models/BlockedSlot");
const Booking = require("../src/models/Booking");
const {
  isValidTimezone,
  getLocalParts,
  getUtcFromLocal,
  is15MinAligned,
  generateBookedBuckets,
} = require("../src/utils/timezoneUtils");

async function runModelTests() {
  console.log("=== Testing Scheduling Models & Timezone Utilities ===");
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

  async function validateThrows(doc) {
    try {
      await doc.validate();
      return false;
    } catch {
      return true;
    }
  }

  // 1. Timezone Utils
  assert(isValidTimezone("Asia/Kolkata"), "isValidTimezone returns true for Asia/Kolkata");
  assert(isValidTimezone("America/New_York"), "isValidTimezone returns true for America/New_York");
  assert(!isValidTimezone("Fake/Timezone"), "isValidTimezone returns false for invalid timezone");

  assert(is15MinAligned("09:00"), "is15MinAligned returns true for 09:00");
  assert(is15MinAligned("09:45"), "is15MinAligned returns true for 09:45");
  assert(!is15MinAligned("09:10"), "is15MinAligned returns false for 09:10");

  const utcTest = getUtcFromLocal("2026-11-10", "10:00", "America/New_York");
  assert(utcTest.toISOString() === "2026-11-10T15:00:00.000Z", "getUtcFromLocal converts NY 10:00 to 15:00 UTC");

  const localParts = getLocalParts(utcTest, "America/New_York");
  assert(
    localParts.dateString === "2026-11-10" && localParts.timeString === "10:00",
    "getLocalParts rounds back to 2026-11-10 10:00"
  );

  const buckets = generateBookedBuckets(new Date("2026-11-10T10:00:00.000Z"), 45, 15);
  assert(buckets.length === 4, "generateBookedBuckets produces 4 buckets for 45min + 15min buffer");
  assert(
    buckets[0] === "2026-11-10T10:00:00.000Z" && buckets[3] === "2026-11-10T10:45:00.000Z",
    "Buckets start at 10:00 and include 10:45 buffer slot"
  );

  // 2. Availability Model Validation
  const validAvail = new Availability({
    therapistId: new mongoose.Types.ObjectId(),
    timezone: "Asia/Kolkata",
    sessionDurations: [45, 60],
    bufferTimeMinutes: 15,
  });
  let hasError = await validateThrows(validAvail);
  assert(!hasError, "Valid Availability instance passes validation");

  const invalidAvailTz = new Availability({
    therapistId: new mongoose.Types.ObjectId(),
    timezone: "Mars/Olympus_Mons",
  });
  assert(await validateThrows(invalidAvailTz), "Invalid timezone fails Availability validation");

  const invalidAvailDuration = new Availability({
    therapistId: new mongoose.Types.ObjectId(),
    sessionDurations: [25], // 25 is not allowed
  });
  assert(await validateThrows(invalidAvailDuration), "Invalid duration (25m) fails Availability validation");

  // 3. AvailabilityOverride Model Validation
  const validOverride = new AvailabilityOverride({
    therapistId: new mongoose.Types.ObjectId(),
    date: "2026-12-25",
    isBlocked: true,
    reason: "Christmas Day",
  });
  assert(!(await validateThrows(validOverride)), "Valid blocked AvailabilityOverride passes validation");

  const invalidOverrideSlot = new AvailabilityOverride({
    therapistId: new mongoose.Types.ObjectId(),
    date: "2026-12-26",
    isBlocked: false,
    timeSlots: [{ startTime: "14:00", endTime: "12:00" }], // End before start
  });
  assert(await validateThrows(invalidOverrideSlot), "Overlapping/reversed timeSlots fail Override validation");

  // 4. BlockedSlot Model Validation
  const validBlock = new BlockedSlot({
    therapistId: new mongoose.Types.ObjectId(),
    startTime: new Date("2026-11-10T14:00:00.000Z"),
    endTime: new Date("2026-11-10T15:30:00.000Z"),
  });
  assert(!(await validateThrows(validBlock)), "Valid BlockedSlot passes validation");

  const invalidBlockAlignment = new BlockedSlot({
    therapistId: new mongoose.Types.ObjectId(),
    startTime: new Date("2026-11-10T14:07:00.000Z"), // Not 15-min aligned
    endTime: new Date("2026-11-10T15:00:00.000Z"),
  });
  assert(await validateThrows(invalidBlockAlignment), "Unaligned BlockedSlot fails validation");

  // 5. Booking Model Validation
  const validBooking = new Booking({
    therapistId: new mongoose.Types.ObjectId(),
    clientName: "Jane Doe",
    clientEmail: "jane.doe@example.com",
    duration: 60,
    startTime: new Date("2026-11-10T14:00:00.000Z"),
    endTime: new Date("2026-11-10T15:00:00.000Z"),
    bookedBuckets: generateBookedBuckets(new Date("2026-11-10T14:00:00.000Z"), 60, 15),
  });
  assert(!(await validateThrows(validBooking)), "Valid Booking passes validation");

  const invalidBookingDuration = new Booking({
    therapistId: new mongoose.Types.ObjectId(),
    clientName: "Jane Doe",
    clientEmail: "jane.doe@example.com",
    duration: 50, // Not allowed
    startTime: new Date("2026-11-10T14:00:00.000Z"),
    endTime: new Date("2026-11-10T14:50:00.000Z"),
    bookedBuckets: ["2026-11-10T14:00:00.000Z"],
  });
  assert(await validateThrows(invalidBookingDuration), "Invalid duration (50m) fails Booking validation");

  console.log(`\nModel Validation Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runModelTests();
