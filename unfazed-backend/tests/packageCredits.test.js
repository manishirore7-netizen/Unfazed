const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_secret_for_unfazed_987654";
process.env.RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== "your_razorpay_test_key"
    ? process.env.RAZORPAY_KEY_ID
    : "rzp_test_suite_key_id";
process.env.RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET !== "your_razorpay_test_secret"
    ? process.env.RAZORPAY_KEY_SECRET
    : "test_suite_secret_dummy";

const { getRazorpayClient } = require("../src/config/razorpay");
const stubbedRazorpayClient = getRazorpayClient();
stubbedRazorpayClient.orders = {
  create: async (payload) => ({
    id: `order_pkgtest_${Date.now()}`,
    entity: "order",
    amount: payload.amount,
    currency: payload.currency || "INR",
    receipt: payload.receipt,
    status: "created",
    notes: payload.notes || {},
  }),
};

const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Package = require("../src/models/Package");
const ClientPackage = require("../src/models/ClientPackage");
const Booking = require("../src/models/Booking");
const Payment = require("../src/models/Payment");
const Availability = require("../src/models/Availability");

async function runPackageCreditsTestSuite() {
  console.log(`\n========================================================`);
  console.log(`Starting Module 4 Phase 3 — Package & Credits Test Suite`);
  console.log(`========================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

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
      results.push({ id, description, pass: false, error: err.message });
      console.log(`[✗ FAIL] Test ${id}: ${description} — Exception: ${err.message}`);
    }
  }

  // Setup database connection and ephemeral server
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("Connected to MongoDB Atlas.");
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
    console.log(`Ephemeral test server running at ${baseUrl}`);
  } catch (err) {
    console.error("Test environment setup failed:", err);
    process.exit(1);
  }

  // Generate JWT helper
  const generateToken = (therapistId) => {
    return jwt.sign({ therapistId }, process.env.JWT_SECRET, { expiresIn: "1h" });
  };

  // Seed two therapists for multi-tenant isolation tests
  const therapistA = await Therapist.create({
    name: "Dr. Package Lead A",
    email: `dr.pkg.a.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-pkga-${uniqueId}`,
  });
  const tokenA = generateToken(therapistA._id);

  const therapistB = await Therapist.create({
    name: "Dr. Package Isolated B",
    email: `dr.pkg.b.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-pkgb-${uniqueId}`,
  });
  const tokenB = generateToken(therapistB._id);

  // Setup availability for therapist A so bookings succeed
  await Availability.create({
    therapistId: therapistA._id,
    sessionDurations: [30, 45, 60, 90],
    bufferTimeMinutes: 15,
    weeklySchedule: [
      {
        dayOfWeek: 1, // Monday
        isWorkingDay: true,
        timeSlots: [{ startTime: "08:00", endTime: "20:00" }],
      },
      {
        dayOfWeek: 2, // Tuesday
        isWorkingDay: true,
        timeSlots: [{ startTime: "08:00", endTime: "20:00" }],
      },
    ],
  });

  const clientA = await Client.create({
    therapist_id: therapistA._id,
    name: "Vikram Malhotra",
    email: `vikram.${uniqueId}@example.com`,
    phone: "9876500001",
  });

  let packageIdA = null;

  // ==========================================
  // 1. Therapist Package CRUD & Validation Tests
  // ==========================================

  // PKG-VAL-01: Validation on creation
  await testCase("PKG-VAL-01", "Reject package creation with missing or invalid fields (400)", async () => {
    const res = await fetch(`${baseUrl}/packages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        title: "",
        sessionCount: 0,
        durationMinutes: 40, // invalid duration
        price: -500,
      }),
    });
    return { pass: res.status === 400 };
  });

  // PKG-CRUD-01: Create Package
  await testCase("PKG-CRUD-01", "Therapist A creates a valid session package (201)", async () => {
    const res = await fetch(`${baseUrl}/packages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        title: "5-Session Stress Management",
        description: "Comprehensive stress management package",
        sessionCount: 5,
        durationMinutes: 60,
        price: 900000, // ₹9,000 in paise
        discountPercentage: 10,
        validityDays: 90,
      }),
    });
    const data = await res.json();
    if (res.status === 201 && data.data?._id) {
      packageIdA = data.data._id;
      return { pass: true };
    }
    return { pass: false, actual: res.status };
  });

  // PKG-SEC-01: Ownership Isolation on GET
  await testCase("PKG-SEC-01", "Therapist B cannot access Therapist A's package by ID (404 Isolation)", async () => {
    const res = await fetch(`${baseUrl}/packages/${packageIdA}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    return { pass: res.status === 404 };
  });

  // PKG-SEC-02: Ownership Isolation on Listing
  await testCase("PKG-SEC-02", "Therapist B package list does NOT include Therapist A's packages", async () => {
    const res = await fetch(`${baseUrl}/packages`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const data = await res.json();
    const hasPkgA = data.data?.some((p) => p._id.toString() === packageIdA.toString());
    return { pass: res.status === 200 && !hasPkgA };
  });

  // PKG-CRUD-02: Update Package
  await testCase("PKG-CRUD-02", "Therapist A updates own package details (200)", async () => {
    const res = await fetch(`${baseUrl}/packages/${packageIdA}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        title: "5-Session Stress & Resilience Pack",
        discountPercentage: 15,
      }),
    });
    const data = await res.json();
    return {
      pass: res.status === 200 && data.data?.title === "5-Session Stress & Resilience Pack",
    };
  });

  // ==========================================
  // 2. Client Package Purchase Flow & Activation
  // ==========================================

  let pendingOrderId = null;

  // PKG-ORD-01: Initiate package purchase order
  await testCase("PKG-ORD-01", "Initiate package purchase creates Razorpay order and pending Payment (201)", async () => {
    const res = await fetch(`${baseUrl}/packages/${packageIdA}/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ clientId: clientA._id.toString() }),
    });
    const data = await res.json();
    if (res.status !== 201 || !data.data?.orderId) {
      return { pass: false, actual: res.status };
    }

    pendingOrderId = data.data.orderId;

    // Verify Payment created in DB in 'created' state
    const payment = await Payment.findOne({ razorpayOrderId: pendingOrderId });
    const noCreditsYet = !(await ClientPackage.findOne({
      therapistId: therapistA._id,
      clientId: clientA._id,
    }));

    return {
      pass: payment && payment.status === "created" && noCreditsYet,
      expected: "Payment 'created' without provisioning ClientPackage",
      actual: `Payment: ${payment?.status}`,
    };
  });

  // PKG-ACT-01: Webhook captures payment and activates ClientPackage
  let activeClientPackageId = null;

  await testCase("PKG-ACT-01", "Webhook payment.captured activates ClientPackage with 5 session credits (200)", async () => {
    const payId = `pay_pkgtest_${uniqueId}`;
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: pendingOrderId,
            amount: 900000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              therapistId: therapistA._id.toString(),
              clientId: clientA._id.toString(),
              packageId: packageIdA.toString(),
              itemType: "package",
            },
          },
        },
      },
    });

    const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: rawBody,
    });

    const data = await res.json();
    if (res.status !== 200) return { pass: false, actual: res.status };

    const clientPkg = await ClientPackage.findOne({
      therapistId: therapistA._id,
      clientId: clientA._id,
      packageId: packageIdA,
    });

    if (clientPkg && clientPkg.status === "active" && clientPkg.remainingSessions === 5) {
      activeClientPackageId = clientPkg._id;
      return { pass: true };
    }
    return { pass: false, actual: clientPkg };
  });

  // PKG-BAL-01: Client Balance Check API
  await testCase("PKG-BAL-01", "Public balance endpoint returns active package credits for client (200)", async () => {
    const res = await fetch(
      `${baseUrl}/packages/public/${therapistA.slug}/balance?email=${encodeURIComponent(clientA.email)}`
    );
    const data = await res.json();
    return {
      pass:
        res.status === 200 &&
        data.data?.hasActivePackage === true &&
        data.data?.remainingCredits === 5,
    };
  });

  // PKG-DEACT-01: Safe deactivation policy on packages with purchases
  await testCase("PKG-DEACT-01", "Attempt to delete package with purchases safely deactivates instead of deleting", async () => {
    const res = await fetch(`${baseUrl}/packages/${packageIdA}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();
    const pkgDoc = await Package.findById(packageIdA);
    return {
      pass: res.status === 200 && pkgDoc.isActive === false,
    };
  });

  // Reactivate package for remaining tests
  await Package.findByIdAndUpdate(packageIdA, { $set: { isActive: true } });

  // ==========================================
  // 3. Session Credit Redemption During Booking
  // ==========================================

  let bookingIdWithCredit = null;

  // CRD-BOOK-01: Redeem 1 package credit on public booking
  await testCase("CRD-BOOK-01", "Public booking with usePackageCredit consumes 1 session credit atomically (201)", async () => {
    const res = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: clientA.name,
        clientEmail: clientA.email,
        clientPhone: clientA.phone,
        startTime: "2026-11-23T09:00:00.000Z", // Monday 14:30 IST
        duration: 60,
        usePackageCredit: true,
      }),
    });
    const data = await res.json();
    if (res.status !== 201 || !data.data?.id) return { pass: false, actual: res.status };

    bookingIdWithCredit = data.data.id;

    // Verify balance is decremented from 5 to 4
    const updatedPkg = await ClientPackage.findById(activeClientPackageId);
    return {
      pass:
        data.data.paymentStatus === "package_credit" &&
        updatedPkg.remainingSessions === 4 &&
        updatedPkg.usedSessions === 1,
      expected: "remaining: 4, used: 1",
      actual: `remaining: ${updatedPkg?.remainingSessions}, used: ${updatedPkg?.usedSessions}`,
    };
  });

  // CRD-FAIL-01: Slot collision does NOT consume credit (Rollback)
  await testCase("CRD-FAIL-01", "Conflicting booking attempt rolls back decremented credit (409)", async () => {
    // Attempt duplicate booking on the exact same occupied slot
    const res = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: clientA.name,
        clientEmail: clientA.email,
        startTime: "2026-11-23T09:00:00.000Z",
        duration: 60,
        usePackageCredit: true,
      }),
    });

    const updatedPkg = await ClientPackage.findById(activeClientPackageId);
    return {
      pass: res.status === 409 && updatedPkg.remainingSessions === 4,
      expected: "HTTP 409 and credit remaining at 4",
      actual: `Status: ${res.status}, Remaining: ${updatedPkg.remainingSessions}`,
    };
  });

  // CRD-CAN-01: Cancellation restores package credit
  await testCase("CRD-CAN-01", "Cancelling package-credit booking restores 1 session credit (200)", async () => {
    const res = await fetch(`${baseUrl}/scheduling/bookings/${bookingIdWithCredit}/cancel`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();
    if (res.status !== 200) return { pass: false, actual: res.status };

    // Credit should be restored from 4 back to 5
    const restoredPkg = await ClientPackage.findById(activeClientPackageId);
    return {
      pass:
        data.data.status === "cancelled" &&
        restoredPkg.remainingSessions === 5 &&
        restoredPkg.usedSessions === 0,
      expected: "remaining: 5, used: 0",
      actual: `remaining: ${restoredPkg?.remainingSessions}, used: ${restoredPkg?.usedSessions}`,
    };
  });

  // CRD-RACE-01: Concurrency protection on final credit
  await testCase("CRD-RACE-01", "Concurrent bookings on final credit: exactly 1 succeeds and 1 is rejected (409)", async () => {
    // Set package remainingSessions to 1
    await ClientPackage.findByIdAndUpdate(activeClientPackageId, {
      $set: { remainingSessions: 1, usedSessions: 4, status: "active" },
    });

    // Fire two simultaneous bookings on DIFFERENT time slots requesting the 1 remaining credit
    const req1 = fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: clientA.name,
        clientEmail: clientA.email,
        startTime: "2026-11-23T11:00:00.000Z", // Slot 1
        duration: 60,
        usePackageCredit: true,
      }),
    });

    const req2 = fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: clientA.name,
        clientEmail: clientA.email,
        startTime: "2026-11-23T13:00:00.000Z", // Slot 2
        duration: 60,
        usePackageCredit: true,
      }),
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort();

    const finalPkg = await ClientPackage.findById(activeClientPackageId);
    const validConcurrency =
      statuses[0] === 201 &&
      (statuses[1] === 409 || statuses[1] === 400) &&
      finalPkg.remainingSessions === 0 &&
      finalPkg.status === "exhausted";

    return {
      pass: validConcurrency,
      expected: "Statuses [201, 409], remainingSessions: 0, status: exhausted",
      actual: `Statuses [${statuses.join(", ")}], remainingSessions: ${finalPkg?.remainingSessions}`,
    };
  });

  // CRD-EXH-01: Attempting to redeem exhausted package is rejected
  await testCase("CRD-EXH-01", "Booking with exhausted package credit is rejected (400)", async () => {
    const res = await fetch(`${baseUrl}/scheduling/public/${therapistA.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: clientA.name,
        clientEmail: clientA.email,
        startTime: "2026-11-23T15:00:00.000Z",
        duration: 60,
        usePackageCredit: true,
      }),
    });
    return { pass: res.status === 400 };
  });

  // Cleanup seeded test records
  await Booking.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Payment.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await ClientPackage.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Package.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Availability.deleteMany({ therapistId: therapistA._id });
  await Client.deleteMany({ therapist_id: therapistA._id });
  await Therapist.deleteMany({ _id: { $in: [therapistA._id, therapistB._id] } });

  if (server) {
    server.close();
  }
  await mongoose.disconnect();

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log(`\n========================================================`);
  console.log(`Package & Credits Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`========================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPackageCreditsTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
