const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Ensure test webhook secret is set for test executions
process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_secret_for_unfazed_987654";

const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Booking = require("../src/models/Booking");
const Package = require("../src/models/Package");
const ClientPackage = require("../src/models/ClientPackage");
const Payment = require("../src/models/Payment");
const {
  verifyWebhookSignature,
  createOrder,
  fetchPayment,
} = require("../src/services/razorpayService");

async function runPaymentWebhookTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 4 Phase 2 — Webhook & Razorpay Suite`);
  console.log(`======================================================\n`);

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

  // Helper to compute valid HMAC SHA-256 signature
  const computeSignature = (bodyString, secret = webhookSecret) => {
    return crypto.createHmac("sha256", secret).update(bodyString).digest("hex");
  };

  // Helper to post webhook
  const postWebhook = async (payload, customSignature = null) => {
    const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
    const signature = customSignature !== null ? customSignature : computeSignature(rawBody);

    const headers = { "Content-Type": "application/json" };
    if (signature) {
      headers["x-razorpay-signature"] = signature;
    }

    const response = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers,
      body: rawBody,
    });

    const data = await response.json();
    return { status: response.status, data };
  };

  // Seed test records
  const therapistDoc = await Therapist.create({
    name: "Dr. Payment Test Lead",
    email: `dr.payments.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-pay-${uniqueId}`,
  });

  const clientDoc = await Client.create({
    therapist_id: therapistDoc._id,
    name: "Rohan Varma",
    email: `rohan.${uniqueId}@example.com`,
    phone: "9876543210",
  });

  const bookingDoc = await Booking.create({
    therapistId: therapistDoc._id,
    clientId: clientDoc._id,
    clientName: clientDoc.name,
    clientEmail: clientDoc.email,
    duration: 60,
    startTime: new Date("2026-12-01T10:00:00.000Z"),
    endTime: new Date("2026-12-01T11:00:00.000Z"),
    bookedBuckets: ["2026-12-01T10:00:00.000Z", "2026-12-01T10:15:00.000Z"],
    status: "confirmed",
    paymentStatus: "unpaid",
  });

  const packageDoc = await Package.create({
    therapistId: therapistDoc._id,
    title: "10-Session Comprehensive Bundle",
    sessionCount: 10,
    durationMinutes: 60,
    price: 1800000, // ₹18,000 in paise
    validityDays: 120,
    isActive: true,
  });

  // ==========================================
  // Test Cases
  // ==========================================

  // SEC-01: Reject request with missing signature
  await testCase("SEC-01", "Reject webhook request missing x-razorpay-signature header (400)", async () => {
    const res = await postWebhook({ event: "payment.captured" }, "");
    return { pass: res.status === 400 && res.data.message.includes("signature") };
  });

  // SEC-02: Reject request with invalid signature
  await testCase("SEC-02", "Reject webhook request with invalid / forged signature (400)", async () => {
    const res = await postWebhook(
      { event: "payment.captured", payload: {} },
      "0000000000000000000000000000000000000000000000000000000000000000"
    );
    return { pass: res.status === 400 && res.data.message.includes("Invalid webhook signature") };
  });

  // VAL-01: Reject malformed payload
  await testCase("VAL-01", "Reject malformed webhook payload missing event or payload object (400)", async () => {
    const res = await postWebhook({ some_other_data: 123 });
    return { pass: res.status === 400 && res.data.message.includes("Malformed") };
  });

  // CAP-01: Successful payment.captured for a single session booking
  const payIdSession = `pay_sess_${uniqueId}`;
  const orderIdSession = `order_sess_${uniqueId}`;

  await testCase("CAP-01", "Process payment.captured: updates Payment and marks Booking paid", async () => {
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payIdSession,
            order_id: orderIdSession,
            amount: 200000, // ₹2,000
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              therapistId: therapistDoc._id.toString(),
              clientId: clientDoc._id.toString(),
              bookingId: bookingDoc._id.toString(),
              itemType: "single_session",
            },
          },
        },
      },
    };

    const res = await postWebhook(payload);
    if (res.status !== 200 || !res.data.success) return { pass: false, actual: res.status };

    // Verify Payment document created in DB
    const paymentRecord = await Payment.findOne({ razorpayPaymentId: payIdSession });
    if (!paymentRecord || paymentRecord.status !== "captured") return { pass: false, actual: "Payment not saved" };

    // Verify Booking updated
    const updatedBooking = await Booking.findById(bookingDoc._id);
    const bookingUpdated =
      updatedBooking.paymentStatus === "paid" &&
      updatedBooking.paymentId.toString() === paymentRecord._id.toString();

    return { pass: bookingUpdated && paymentRecord.amount === 200000 };
  });

  // IDEM-01: Duplicate delivery of payment.captured (Idempotency)
  await testCase("IDEM-01", "Duplicate webhook delivery returns 200 without creating duplicate payments", async () => {
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payIdSession,
            order_id: orderIdSession,
            amount: 200000,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
      },
    };

    const res = await postWebhook(payload);
    if (res.status !== 200 || !res.data.message.includes("idempotent")) {
      return { pass: false, actual: res.data.message };
    }

    const count = await Payment.countDocuments({ razorpayPaymentId: payIdSession });
    return { pass: count === 1, expected: 1, actual: count };
  });

  // FAIL-01: Handle payment.failed event
  const payIdFailed = `pay_fail_${uniqueId}`;
  const orderIdFailed = `order_fail_${uniqueId}`;

  // Pre-create Payment record in 'created' state
  const pendingPayment = await Payment.create({
    therapistId: therapistDoc._id,
    clientId: clientDoc._id,
    itemType: "single_session",
    razorpayOrderId: orderIdFailed,
    razorpayPaymentId: payIdFailed,
    amount: 150000,
    currency: "INR",
    platformFee: 15000,
    netTherapistAmount: 135000,
    status: "created",
  });

  await testCase("FAIL-01", "Process payment.failed: records failure and updates Payment status", async () => {
    const payload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payIdFailed,
            order_id: orderIdFailed,
            amount: 150000,
            status: "failed",
            method: "card",
          },
        },
      },
    };

    const res = await postWebhook(payload);
    if (res.status !== 200) return { pass: false, actual: res.status };

    const updatedPayment = await Payment.findById(pendingPayment._id);
    return { pass: updatedPayment.status === "failed", expected: "failed", actual: updatedPayment.status };
  });

  // PKG-01: Package purchase provisions ClientPackage with session credits
  const payIdPkg = `pay_pkg_${uniqueId}`;
  const orderIdPkg = `order_pkg_${uniqueId}`;

  await testCase("PKG-01", "Process payment.captured for package: provisions active ClientPackage with credits", async () => {
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payIdPkg,
            order_id: orderIdPkg,
            amount: 1800000, // ₹18,000
            currency: "INR",
            status: "captured",
            method: "netbanking",
            notes: {
              therapistId: therapistDoc._id.toString(),
              clientId: clientDoc._id.toString(),
              packageId: packageDoc._id.toString(),
              itemType: "package",
            },
          },
        },
      },
    };

    const res = await postWebhook(payload);
    if (res.status !== 200 || !res.data.success) return { pass: false, actual: res.data };

    const paymentRecord = await Payment.findOne({ razorpayPaymentId: payIdPkg });
    if (!paymentRecord || !paymentRecord.clientPackageId) return { pass: false, actual: "No clientPackage linked" };

    const clientPkg = await ClientPackage.findById(paymentRecord.clientPackageId);
    const validProvisioning =
      clientPkg &&
      clientPkg.status === "active" &&
      clientPkg.totalSessions === 10 &&
      clientPkg.remainingSessions === 10 &&
      clientPkg.usedSessions === 0;

    return { pass: Boolean(validProvisioning) };
  });

  // PKG-02: Package credit protection against duplicate webhook deliveries
  await testCase("PKG-02", "Package credit protection: duplicate webhook does NOT create extra package credits", async () => {
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payIdPkg,
            order_id: orderIdPkg,
            amount: 1800000,
            currency: "INR",
            status: "captured",
            method: "netbanking",
          },
        },
      },
    };

    const res = await postWebhook(payload);
    if (res.status !== 200 || !res.data.message.includes("idempotent")) {
      return { pass: false, actual: res.data.message };
    }

    // Verify only 1 ClientPackage was created for this package/client combination
    const pkgCount = await ClientPackage.countDocuments({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
      packageId: packageDoc._id,
    });

    return { pass: pkgCount === 1, expected: 1, actual: pkgCount };
  });

  // SRV-01: RazorpayService verifyWebhookSignature unit test
  await testCase("SRV-01", "RazorpayService.verifyWebhookSignature accurately validates authentic signatures", async () => {
    const sampleBody = JSON.stringify({ event: "order.paid", id: "sample_123" });
    const correctSig = crypto.createHmac("sha256", webhookSecret).update(sampleBody).digest("hex");

    const validCheck = verifyWebhookSignature({
      rawBody: sampleBody,
      signature: correctSig,
      secret: webhookSecret,
    });

    const tamperedCheck = verifyWebhookSignature({
      rawBody: sampleBody + " ",
      signature: correctSig,
      secret: webhookSecret,
    });

    return { pass: validCheck === true && tamperedCheck === false };
  });

  // SRV-02: RazorpayService parameter validation
  await testCase("SRV-02", "RazorpayService createOrder and fetchPayment validate inputs safely", async () => {
    let orderThrew = false;
    try {
      await createOrder({ amount: -100 });
    } catch {
      orderThrew = true;
    }

    let fetchThrew = false;
    try {
      await fetchPayment("");
    } catch {
      fetchThrew = true;
    }

    return { pass: orderThrew && fetchThrew };
  });

  // Cleanup seeded records
  await Payment.deleteMany({ therapistId: therapistDoc._id });
  await ClientPackage.deleteMany({ therapistId: therapistDoc._id });
  await Package.deleteMany({ therapistId: therapistDoc._id });
  await Booking.deleteMany({ therapistId: therapistDoc._id });
  await Client.deleteMany({ therapist_id: therapistDoc._id });
  await Therapist.deleteOne({ _id: therapistDoc._id });

  if (server) {
    server.close();
  }
  await mongoose.disconnect();

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log(`\n======================================================`);
  console.log(`Payment Webhook Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPaymentWebhookTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
