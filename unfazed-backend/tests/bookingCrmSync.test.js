const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const http = require("http");
const app = require("../src/app");
const Booking = require("../src/models/Booking");
const Client = require("../src/models/Client");
const Availability = require("../src/models/Availability");
const BlockedSlot = require("../src/models/BlockedSlot");
const AvailabilityOverride = require("../src/models/AvailabilityOverride");

async function runBookingCrmSyncTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Public Booking & CRM Synchronization Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

  const therapistA = {
    name: "Dr. Sync Lead Practitioner",
    email: `dr.sync.a.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  const therapistB = {
    name: "Dr. Isolated Practitioner",
    email: `dr.sync.b.${uniqueId}@example.com`,
    password: "Password123!",
    slug: null,
    token: null,
    id: null,
  };

  async function testCase(id, description, fn) {
    try {
      const res = await fn();
      results.push({ id, description, ...res });
      const statusIcon = res.pass ? "✓ PASS" : "✗ FAIL";
      console.log(`[${statusIcon}] Test ${id}: ${description}`);
      if (!res.pass) {
        console.log(`         Expected: ${res.expected} | Actual: ${res.actual}`);
      }
    } catch (err) {
      results.push({
        id,
        description,
        expected: "N/A",
        actual: "Error: " + err.message,
        pass: false,
      });
      console.log(`[✗ FAIL] Test ${id}: ${description} (Threw Error: ${err.message})`);
    }
  }

  try {
    // 1. Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas.");

    await Promise.all([
      Availability.syncIndexes(),
      AvailabilityOverride.syncIndexes(),
      BlockedSlot.syncIndexes(),
      Booking.syncIndexes(),
      Client.syncIndexes(),
    ]);

    // 2. Start ephemeral test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
    console.log(`Test server running at ${baseUrl}\n`);

    // 3. Register & Login Therapist A and Therapist B
    const regARes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistA.name,
        email: therapistA.email,
        password: therapistA.password,
      }),
    });
    const regAData = await regARes.json();
    therapistA.slug = regAData.data?.slug;
    therapistA.id = regAData.data?.id;

    const loginARes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: therapistA.email, password: therapistA.password }),
    });
    const loginAData = await loginARes.json();
    therapistA.token = loginAData.token;

    const regBRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: therapistB.name,
        email: therapistB.email,
        password: therapistB.password,
      }),
    });
    const regBData = await regBRes.json();
    therapistB.slug = regBData.data?.slug;
    therapistB.id = regBData.data?.id;

    const loginBRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: therapistB.email, password: therapistB.password }),
    });
    const loginBData = await loginBRes.json();
    therapistB.token = loginBData.token;

    // 4. Configure open weekly availability for Therapist A (all 7 days 09:00 - 18:00)
    await fetch(`${baseUrl}/scheduling/availability`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${therapistA.token}`,
      },
      body: JSON.stringify({
        timezone: "Asia/Kolkata",
        sessionDurations: [30, 45, 60, 90],
        bufferTimeMinutes: 15,
        noticePeriodHours: 1,
        bookingWindowDays: 60,
        weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          isOpen: true,
          timeSlots: [{ startTime: "09:00", endTime: "18:00" }],
        })),
      }),
    });

    // Pick target dates safely in the future (within booking window)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toISOString().split("T")[0];

    // Compute UTC timestamps for 10:00 AM IST and 12:00 PM IST (IST is UTC+5:30)
    // 10:00 IST = 04:30 UTC
    const slot1Utc = `${dateStr}T04:30:00.000Z`;
    // 12:00 IST = 06:30 UTC
    const slot2Utc = `${dateStr}T06:30:00.000Z`;
    // 14:00 IST = 08:30 UTC
    const slot3Utc = `${dateStr}T08:30:00.000Z`;

    let emilyClientId = null;
    let marcusClientId = null;

    // ==========================================================
    // TEST 1: New public booking automatically creates CRM client
    // ==========================================================
    const emilyEmail = `emily.davis.${uniqueId}@example.com`;
    await testCase("SYNC-01", "New public booking creates CRM client automatically", async () => {
      const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Emily Davis",
          clientEmail: emilyEmail,
          clientPhone: "+1-555-4321",
          clientNotes: "First session for stress management.",
          startTime: slot1Utc,
          duration: 60,
        }),
      });
      const bookData = await bookRes.json();
      const bookingSuccess = bookRes.status === 201 && bookData.success;
      const returnedClientId = bookData.data?.clientId;

      // Verify client in CRM
      const crmRes = await fetch(`${baseUrl}/clients`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const crmData = await crmRes.json();
      const emilyRecord = crmData.data?.find((c) => c.email === emilyEmail.toLowerCase());

      if (emilyRecord) {
        emilyClientId = emilyRecord._id;
      }

      const pass =
        bookingSuccess &&
        Boolean(returnedClientId) &&
        Boolean(emilyRecord) &&
        emilyRecord.name === "Emily Davis" &&
        emilyRecord.phone === "+1-555-4321" &&
        emilyRecord.status === "active" &&
        returnedClientId.toString() === emilyRecord._id.toString();

      return {
        pass,
        expected: "201 with Client created in CRM and linked by clientId",
        actual: `Status: ${bookRes.status}, ClientId: ${returnedClientId}, CRM match: ${Boolean(emilyRecord)}`,
      };
    });

    // ==========================================================
    // TEST 2: Repeat booking does not duplicate CRM client
    // ==========================================================
    await testCase("SYNC-02", "Repeat public booking reuses existing CRM client (no duplicates)", async () => {
      const repeatRes = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Emily Davis",
          clientEmail: emilyEmail.toUpperCase(), // Test case-insensitivity
          clientPhone: "+1-555-4321",
          clientNotes: "Follow-up session.",
          startTime: slot2Utc,
          duration: 60,
        }),
      });
      const repeatData = await repeatRes.json();

      // Check CRM total clients
      const crmRes = await fetch(`${baseUrl}/clients`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const crmData = await crmRes.json();
      const emilyMatches = crmData.data?.filter((c) => c.email === emilyEmail.toLowerCase()) || [];

      const pass =
        repeatRes.status === 201 &&
        emilyMatches.length === 1 &&
        repeatData.data?.clientId.toString() === emilyClientId.toString();

      return {
        pass,
        expected: "Exactly 1 CRM client record for Emily Davis",
        actual: `${emilyMatches.length} CRM record(s) found`,
      };
    });

    // ==========================================================
    // TEST 3: Pre-existing CRM client demographics are preserved
    // ==========================================================
    const marcusEmail = `marcus.aurelius.${uniqueId}@example.com`;
    await testCase("SYNC-03", "Pre-existing client demographics are preserved when booking publicly", async () => {
      // Step 3a: Create Marcus in CRM with detailed demographics
      const createRes = await fetch(`${baseUrl}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          name: "Marcus Aurelius",
          email: marcusEmail,
          phone: "+1-555-8888",
          status: "lead",
          tags: ["cbt", "mindfulness"],
          dateOfBirth: "1980-04-26",
          occupation: "Author & Philosopher",
          presentingConcern: "Managing immense leadership stress.",
          goals: "Develop daily mindfulness habits.",
        }),
      });
      const createData = await createRes.json();
      marcusClientId = createData.data?._id;

      // Step 3b: Marcus books publicly with basic info
      const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Marcus A.",
          clientEmail: marcusEmail,
          clientPhone: "+1-555-8888",
          startTime: slot3Utc,
          duration: 60,
        }),
      });
      const bookData = await bookRes.json();

      // Step 3c: Retrieve Marcus from CRM and verify fields are intact
      const getRes = await fetch(`${baseUrl}/clients/${marcusClientId}`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const getData = await getRes.json();
      const clientAfter = getData.data;

      const pass =
        bookRes.status === 201 &&
        bookData.data?.clientId.toString() === marcusClientId.toString() &&
        clientAfter.presentingConcern === "Managing immense leadership stress." &&
        clientAfter.occupation === "Author & Philosopher" &&
        clientAfter.tags.includes("cbt") &&
        clientAfter.status === "lead";

      return {
        pass,
        expected: "All clinical fields & demographics preserved",
        actual: `Concern: '${clientAfter?.presentingConcern}', Status: '${clientAfter?.status}'`,
      };
    });

    // ==========================================================
    // TEST 4: Failed/conflicting booking does NOT create orphan CRM client
    // ==========================================================
    const conflictEmail = `never.booked.${uniqueId}@example.com`;
    await testCase("SYNC-04", "Failed/conflicting booking does NOT create orphan CRM client", async () => {
      // Attempt to book slot1Utc again (already booked by Emily)
      const conflictRes = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Ghost Client",
          clientEmail: conflictEmail,
          startTime: slot1Utc,
          duration: 60,
        }),
      });

      // Verify Ghost Client was NOT added to CRM
      const crmRes = await fetch(`${baseUrl}/clients`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const crmData = await crmRes.json();
      const ghostRecord = crmData.data?.find((c) => c.email === conflictEmail.toLowerCase());

      const pass = conflictRes.status === 409 && !ghostRecord;

      return {
        pass,
        expected: "HTTP 409 and 0 CRM records for Ghost Client",
        actual: `Status: ${conflictRes.status}, CRM record exists: ${Boolean(ghostRecord)}`,
      };
    });

    // ==========================================================
    // TEST 5: Authenticated therapist-initiated booking
    // ==========================================================
    // Next day slot for therapist-initiated booking
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 6);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    const therapistSlotUtc = `${nextDayStr}T04:30:00.000Z`;

    await testCase("TH-01", "Therapist can schedule appointment directly for existing CRM client", async () => {
      // Step 5a: Fetch therapist available slots using authenticated endpoint
      const slotsRes = await fetch(
        `${baseUrl}/scheduling/slots?date=${nextDayStr}&duration=60&timezone=Asia/Kolkata`,
        {
          headers: { Authorization: `Bearer ${therapistA.token}` },
        }
      );
      const slotsData = await slotsRes.json();
      const slotsLoaded = slotsRes.status === 200 && Array.isArray(slotsData.data?.slots);

      // Step 5b: Schedule appointment using authenticated POST /scheduling/bookings
      const scheduleRes = await fetch(`${baseUrl}/scheduling/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistA.token}`,
        },
        body: JSON.stringify({
          clientId: marcusClientId,
          clientName: "Marcus Aurelius",
          clientEmail: marcusEmail,
          clientPhone: "+1-555-8888",
          clientNotes: "Direct therapist scheduled check-in.",
          startTime: therapistSlotUtc,
          duration: 60,
        }),
      });
      const scheduleData = await scheduleRes.json();

      const pass =
        slotsLoaded &&
        scheduleRes.status === 201 &&
        scheduleData.success === true &&
        scheduleData.data?.clientId.toString() === marcusClientId.toString() &&
        scheduleData.data?.status === "confirmed";

      return {
        pass,
        expected: "201 with confirmed booking linked to clientId",
        actual: `Slots status: ${slotsRes.status}, Schedule status: ${scheduleRes.status}`,
      };
    });

    // ==========================================================
    // TEST 6: Cross-therapist data isolation
    // ==========================================================
    await testCase("SEC-01", "Therapist B cannot schedule booking for Therapist A's client (404 Isolation)", async () => {
      const unauthScheduleRes = await fetch(`${baseUrl}/scheduling/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${therapistB.token}`,
        },
        body: JSON.stringify({
          clientId: marcusClientId, // Therapist A's client
          clientName: "Marcus Aurelius",
          clientEmail: marcusEmail,
          startTime: `${nextDayStr}T06:30:00.000Z`,
          duration: 60,
        }),
      });

      return {
        pass: unauthScheduleRes.status === 404,
        expected: 404,
        actual: unauthScheduleRes.status,
      };
    });

    await testCase("SEC-02", "Therapist B cannot view Therapist A's client details (404 Isolation)", async () => {
      const getRes = await fetch(`${baseUrl}/clients/${marcusClientId}`, {
        headers: { Authorization: `Bearer ${therapistB.token}` },
      });

      return {
        pass: getRes.status === 404,
        expected: 404,
        actual: getRes.status,
      };
    });

    // ==========================================================
    // TEST 7: Appointment history linkage
    // ==========================================================
    await testCase("HIST-01", "Client's appointment history contains both public and therapist-initiated bookings", async () => {
      const bookingsRes = await fetch(`${baseUrl}/scheduling/bookings`, {
        headers: { Authorization: `Bearer ${therapistA.token}` },
      });
      const bookingsData = await bookingsRes.json();
      const allBookings = bookingsData.data || [];

      const marcusBookings = allBookings.filter(
        (b) => b.clientEmail.toLowerCase() === marcusEmail.toLowerCase()
      );

      const pass =
        bookingsRes.status === 200 &&
        marcusBookings.length === 2 && // 1 public booking + 1 therapist-initiated booking
        marcusBookings.every((b) => b.status === "confirmed");

      return {
        pass,
        expected: "2 confirmed bookings for Marcus",
        actual: `${marcusBookings.length} booking(s) found`,
      };
    });

  } finally {
    // Teardown
    await Client.deleteMany({
      email: { $regex: `${uniqueId}@example.com` },
    }).catch(() => {});
    await Booking.deleteMany({
      clientEmail: { $regex: `${uniqueId}@example.com` },
    }).catch(() => {});
    if (server) {
      server.close();
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  // Summary
  console.log(`\n======================================================`);
  console.log(`Public Booking & CRM Sync Test Summary`);
  console.log(`======================================================`);
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\nTest suite finished with ${failed} failures.`);
    process.exit(1);
  } else {
    console.log(`\nAll Booking & CRM sync integration tests PASSED!`);
    process.exit(0);
  }
}

runBookingCrmSyncTestSuite().catch((err) => {
  console.error("Booking & CRM Sync Test runner error:", err);
  process.exit(1);
});

