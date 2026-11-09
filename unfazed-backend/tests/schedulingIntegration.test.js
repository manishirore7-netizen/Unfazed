const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Availability = require("../src/models/Availability");
const AvailabilityOverride = require("../src/models/AvailabilityOverride");
const BlockedSlot = require("../src/models/BlockedSlot");
const Booking = require("../src/models/Booking");
const { getUtcFromLocal } = require("../src/utils/timezoneUtils");

async function runSchedulingIntegrationSuite() {
  console.log("\n========================================================");
  console.log("Starting Module 2 — Scheduling Live Integration Tests");
  console.log("========================================================\n");

  let server;
  let baseUrl;
  let testTherapist;
  let authToken;
  const uniqueId = Date.now();
  const testEmail = `dr.sched.${uniqueId}@example.com`;
  const testPassword = "SchedPassword123!";
  const testName = `Dr. Sched Test ${uniqueId}`;

  const results = [];

  function assert(condition, message, expected = true, actual = condition) {
    results.push({ message, pass: Boolean(condition) });
    const icon = condition ? "✓ PASS" : "✗ FAIL";
    console.log(`[${icon}] ${message}`);
    if (!condition) {
      console.log(`         Expected: ${expected} | Actual: ${actual}`);
    }
  }

  try {
    // 1. Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas.");

    // Ensure all model indexes (especially Booking partial unique multikey index) are built
    await Promise.all([
      Availability.syncIndexes(),
      AvailabilityOverride.syncIndexes(),
      BlockedSlot.syncIndexes(),
      Booking.syncIndexes(),
    ]);
    console.log("Synced Mongoose indexes with MongoDB Atlas.");

    // 2. Start Express app on an ephemeral port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
    console.log(`Ephemeral test server running at ${baseUrl}\n`);

    // 3. Register & Login test therapist
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, "Test therapist registered successfully");
    const therapistSlug = regData.data.slug;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token), "Test therapist logged in and obtained JWT");
    authToken = loginData.token;
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    };

    // 4. Test GET /api/scheduling/availability (Default state)
    const getAvailRes = await fetch(`${baseUrl}/scheduling/availability`, {
      headers: authHeaders,
    });
    const getAvailData = await getAvailRes.json();
    assert(getAvailRes.status === 200, "GET /api/scheduling/availability returns HTTP 200");
    assert(
      Array.isArray(getAvailData.data.sessionDurations) &&
        getAvailData.data.sessionDurations.length === 4,
      "Default sessionDurations include 30, 45, 60, 90"
    );

    // 5. Test PUT /api/scheduling/availability
    const putAvailRes = await fetch(`${baseUrl}/scheduling/availability`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        timezone: "Asia/Kolkata",
        sessionDurations: [45, 60],
        bufferTimeMinutes: 15,
        noticePeriodHours: 2,
        bookingWindowDays: 45,
        weeklySchedule: [
          { dayOfWeek: 0, isOpen: false, timeSlots: [] }, // Sun
          { dayOfWeek: 1, isOpen: true, timeSlots: [{ startTime: "10:00", endTime: "16:00" }] }, // Mon
          { dayOfWeek: 2, isOpen: true, timeSlots: [{ startTime: "10:00", endTime: "16:00" }] },
          { dayOfWeek: 3, isOpen: true, timeSlots: [{ startTime: "10:00", endTime: "16:00" }] },
          { dayOfWeek: 4, isOpen: true, timeSlots: [{ startTime: "10:00", endTime: "16:00" }] },
          { dayOfWeek: 5, isOpen: true, timeSlots: [{ startTime: "10:00", endTime: "16:00" }] },
          { dayOfWeek: 6, isOpen: false, timeSlots: [] }, // Sat
        ],
      }),
    });
    const putAvailData = await putAvailRes.json();
    assert(putAvailRes.status === 200, "PUT /api/scheduling/availability updates settings successfully");
    assert(putAvailData.data.bufferTimeMinutes === 15, "Buffer time set to 15 minutes");

    // 6. Test POST /api/scheduling/overrides
    const postOverrideRes = await fetch(`${baseUrl}/scheduling/overrides`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        date: "2026-11-23", // A future Monday
        isBlocked: true,
        reason: "Personal Day Off",
      }),
    });
    const postOverrideData = await postOverrideRes.json();
    assert(postOverrideRes.status === 200, "POST /api/scheduling/overrides creates day override");
    const overrideId = postOverrideData.data._id;

    // 7. Test GET & DELETE /api/scheduling/overrides
    const getOverridesRes = await fetch(`${baseUrl}/scheduling/overrides`, {
      headers: authHeaders,
    });
    const getOverridesData = await getOverridesRes.json();
    assert(getOverridesData.data.length >= 1, "GET /api/scheduling/overrides lists active overrides");

    const delOverrideRes = await fetch(`${baseUrl}/scheduling/overrides/${overrideId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert(delOverrideRes.status === 200, "DELETE /api/scheduling/overrides/:id removes override");

    // 8. Test POST /api/scheduling/blocks
    // Block future Monday 2026-11-16 from 12:00 to 13:00 IST
    const blockStart = getUtcFromLocal("2026-11-16", "12:00", "Asia/Kolkata");
    const blockEnd = getUtcFromLocal("2026-11-16", "13:00", "Asia/Kolkata");

    const postBlockRes = await fetch(`${baseUrl}/scheduling/blocks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        startTime: blockStart.toISOString(),
        endTime: blockEnd.toISOString(),
        reason: "Clinical Supervision",
      }),
    });
    const postBlockData = await postBlockRes.json();
    assert(postBlockRes.status === 201, "POST /api/scheduling/blocks creates blocked slot");
    const blockId = postBlockData.data._id;

    // 9. Test Public Slot Discovery: GET /api/scheduling/public/:slug/slots
    // Target: Monday 2026-11-16 in Asia/Kolkata
    const slotsRes = await fetch(
      `${baseUrl}/scheduling/public/${therapistSlug}/slots?date=2026-11-16&duration=60&timezone=Asia/Kolkata`
    );
    const slotsData = await slotsRes.json();
    assert(slotsRes.status === 200, "GET /api/scheduling/public/:slug/slots returns HTTP 200");
    assert(slotsData.data.slots.length > 0, "Public slots array is non-empty");

    // Confirm that 12:00 IST (blocked) is NOT in the available slots
    const hasBlocked12 = slotsData.data.slots.some((s) => s.clientStartTime === "12:00");
    assert(!hasBlocked12, "Blocked time slot (12:00 IST) is omitted from public slots");

    // 10. Test Public Booking Creation: POST /api/scheduling/public/:slug/book
    // Pick the first available slot
    const targetSlot = slotsData.data.slots[0];
    const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Alex Patient",
        clientEmail: "alex.patient@example.com",
        clientPhone: "+15551234567",
        clientNotes: "First therapy session inquiry.",
        duration: 60,
        startTime: targetSlot.startTime,
      }),
    });
    const bookData = await bookRes.json();
    assert(bookRes.status === 201, "POST /api/scheduling/public/:slug/book confirms instant booking");
    assert(bookData.data.status === "confirmed", "Booking status is 'confirmed'");
    const createdBookingId = bookData.data.id;

    // 11. Test Sequential Overlapping Booking Rejection (HTTP 409 Conflict)
    const duplicateRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Second Client",
        clientEmail: "second.client@example.com",
        duration: 45, // Overlapping duration at same start time
        startTime: targetSlot.startTime,
      }),
    });
    assert(duplicateRes.status === 409, "Overlapping booking attempt is rejected with HTTP 409 Conflict");

    // 12. Test Concurrent Race Condition (Simultaneous Booking Attempts)
    // Find another available slot
    const refreshedSlotsRes = await fetch(
      `${baseUrl}/scheduling/public/${therapistSlug}/slots?date=2026-11-16&duration=60&timezone=Asia/Kolkata`
    );
    const refreshedSlotsData = await refreshedSlotsRes.json();
    const concurrentSlot = refreshedSlotsData.data.slots[1]; // Pick second open slot

    // Fire two identical booking requests in parallel
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Racer Alpha",
          clientEmail: "racer.alpha@example.com",
          duration: 60,
          startTime: concurrentSlot.startTime,
        }),
      }),
      fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Racer Beta",
          clientEmail: "racer.beta@example.com",
          duration: 60,
          startTime: concurrentSlot.startTime,
        }),
      }),
    ]);

    const statuses = [concurrentRes1.status, concurrentRes2.status].sort();
    assert(
      statuses[0] === 201 && statuses[1] === 409,
      "Concurrent booking race condition: exactly one succeeds (201) and one is rejected (409)",
      "201 and 409",
      `${statuses[0]} and ${statuses[1]}`
    );

    // 13. Test Therapist Booking List & Cancellation
    const bookingsListRes = await fetch(`${baseUrl}/scheduling/bookings`, {
      headers: authHeaders,
    });
    const bookingsListData = await bookingsListRes.json();
    assert(bookingsListData.data.length >= 2, "Therapist can list their confirmed bookings");

    const cancelRes = await fetch(`${baseUrl}/scheduling/bookings/${createdBookingId}/cancel`, {
      method: "PATCH",
      headers: authHeaders,
    });
    const cancelData = await cancelRes.json();
    assert(cancelRes.status === 200, "Therapist can cancel booking via PATCH /bookings/:id/cancel");
    assert(cancelData.data.status === "cancelled", "Cancelled booking status is updated to 'cancelled'");

    // 14. Confirm that the cancelled slot can now be booked again
    const rebookRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Rebook Client",
        clientEmail: "rebook.client@example.com",
        duration: 60,
        startTime: targetSlot.startTime,
      }),
    });
    assert(
      rebookRes.status === 201,
      "Previously cancelled slot is immediately rebookable (partial unique index releases slot)"
    );

    // 15. Test validation: Reject non-15-minute aligned start time (HTTP 400)
    const unalignedRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Unaligned Tester",
        clientEmail: "unaligned@example.com",
        duration: 60,
        startTime: "2026-11-16T04:37:00.000Z", // :37 is not 15-min aligned
      }),
    });
    assert(unalignedRes.status === 400, "Unaligned start time is rejected with HTTP 400");

    // 16. Test validation: Reject duration not offered by therapist (HTTP 400)
    const unofferedDurationRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Duration Tester",
        clientEmail: "duration@example.com",
        duration: 90, // Therapist only enabled [45, 60] in Test 5
        startTime: "2026-11-16T08:00:00.000Z",
      }),
    });
    assert(unofferedDurationRes.status === 400, "Unoffered duration is rejected with HTTP 400");

    // 17. Test validation: Booking directly on a blocked slot returns HTTP 409
    const blockedBookingRes = await fetch(`${baseUrl}/scheduling/public/${therapistSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Blocked Tester",
        clientEmail: "blocked@example.com",
        duration: 60,
        startTime: blockStart.toISOString(), // 12:00 IST (previously blocked)
      }),
    });
    assert(blockedBookingRes.status === 409, "Booking directly on a blocked slot is rejected with HTTP 409");

    // Cleanup created test records
    await Promise.all([
      Therapist.deleteOne({ _id: testTherapist?._id }),
      Availability.deleteMany({ therapistId: testTherapist?._id }),
      AvailabilityOverride.deleteMany({ therapistId: testTherapist?._id }),
      BlockedSlot.deleteMany({ therapistId: testTherapist?._id }),
      Booking.deleteMany({ therapistId: testTherapist?._id }),
    ]);

  } catch (error) {
    console.error("Test execution encountered an error:", error);
    assert(false, `Unexpected exception: ${error.message}`);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB Atlas and shut down test server.");
  }

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;
  console.log("\n--------------------------------------------------------");
  console.log(`Integration Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log("--------------------------------------------------------\n");

  if (failedCount > 0) process.exit(1);
}

runSchedulingIntegrationSuite();
