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

const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Package = require("../src/models/Package");
const ClientPackage = require("../src/models/ClientPackage");
const Booking = require("../src/models/Booking");
const Payment = require("../src/models/Payment");
const Availability = require("../src/models/Availability");
const { getRazorpayClient } = require("../src/config/razorpay");
const {
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require("../src/services/razorpayService");

// Stub Razorpay orders creation for isolated integration tests
const stubbedRazorpayClient = getRazorpayClient();
stubbedRazorpayClient.orders = {
  create: async (payload) => ({
    id: `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    entity: "order",
    amount: payload.amount,
    currency: payload.currency || "INR",
    receipt: payload.receipt,
    status: "created",
    notes: payload.notes || {},
  }),
};

async function runPaymentVerificationTestSuite() {
  console.log(`\n======================================================`);
  console.log(`Starting Module 4 Dual-Verification Architecture Test Suite`);
  console.log(`======================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
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

  // Helper to generate checkout signature
  const computeCheckoutSignature = (orderId, paymentId, secret = keySecret) => {
    return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  };

  // Helper to compute webhook signature
  const computeWebhookSignature = (rawBody, secret = webhookSecret) => {
    return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  };

  // Seed test records
  const therapistDoc = await Therapist.create({
    name: "Dr. Dual Verification",
    email: `dr.dual.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-dual-${uniqueId}`,
  });

  const clientDoc = await Client.create({
    therapist_id: therapistDoc._id,
    name: "Test Client Dual",
    email: `client.dual.${uniqueId}@example.com`,
    phone: "+91 98765 00000",
  });

  const packageDoc = await Package.create({
    therapistId: therapistDoc._id,
    title: "Dual Verification 5-Pack",
    description: "Multi-session pack for dual verification test",
    sessionCount: 5,
    durationMinutes: 60,
    price: 50000, // ₹500
    validityDays: 90,
    isActive: true,
  });

  const bookingDoc = await Booking.create({
    therapistId: therapistDoc._id,
    clientId: clientDoc._id,
    clientName: clientDoc.name,
    clientEmail: clientDoc.email,
    duration: 60,
    startTime: new Date("2026-12-05T10:00:00.000Z"),
    endTime: new Date("2026-12-05T11:00:00.000Z"),
    bookedBuckets: [`${uniqueId}_slot_1`, `${uniqueId}_slot_2`],
    status: "confirmed",
    paymentStatus: "unpaid",
  });

  await Availability.create({
    therapistId: therapistDoc._id,
    sessionDurations: [30, 45, 60, 90],
    bufferTimeMinutes: 15,
    weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      isWorkingDay: true,
      timeSlots: [{ startTime: "08:00", endTime: "22:00" }],
    })),
  });

  // ==========================================
  // 1. Cryptographic Signature Unit Tests
  // ==========================================
  await testCase("VRF-UNIT-01", "verifyPaymentSignature correctly verifies valid HMAC SHA-256 signatures", async () => {
    const oId = "order_test_unit_123";
    const pId = "pay_test_unit_456";
    const validSig = computeCheckoutSignature(oId, pId);

    const isValid = verifyPaymentSignature({ orderId: oId, paymentId: pId, signature: validSig });
    const isBadSig = verifyPaymentSignature({ orderId: oId, paymentId: pId, signature: "forged_sig" });
    const isMismatched = verifyPaymentSignature({ orderId: oId, paymentId: "pay_other", signature: validSig });
    const isMissing = verifyPaymentSignature({ orderId: "", paymentId: pId, signature: validSig });

    return {
      pass: isValid === true && isBadSig === false && isMismatched === false && isMissing === false,
      expected: "true for valid, false for forged/mismatched/missing",
      actual: `valid=${isValid}, badSig=${isBadSig}, mismatched=${isMismatched}, missing=${isMissing}`,
    };
  });

  // ==========================================
  // 2. Input Validation Tests
  // ==========================================
  await testCase("VRF-VAL-01", "Reject verification request with missing required parameters (400)", async () => {
    const res1 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_payment_id: "pay_1", razorpay_signature: "sig_1" }),
    });

    const res2 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id: "order_1", razorpay_signature: "sig_1" }),
    });

    const res3 = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" }),
    });

    return {
      pass: res1.status === 400 && res2.status === 400 && res3.status === 400,
      expected: "400 Bad Request on all missing fields",
      actual: `res1=${res1.status}, res2=${res2.status}, res3=${res3.status}`,
    };
  });

  await testCase("VRF-SIG-01", "Reject verification request with forged/invalid signature (400)", async () => {
    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: `order_fake_${uniqueId}`,
        razorpay_payment_id: `pay_fake_${uniqueId}`,
        razorpay_signature: "0000000000000000000000000000000000000000000000000000000000000000",
      }),
    });
    const data = await res.json();

    return {
      pass: res.status === 400 && data.success === false,
      expected: "400 Bad Request with success: false",
      actual: `${res.status} (${data.message})`,
    };
  });

  await testCase("VRF-ORD-01", "Reject verification request when order is not found in database (404)", async () => {
    const orderId = `order_nonexistent_${uniqueId}`;
    const paymentId = `pay_valid_${uniqueId}`;
    const validSig = computeCheckoutSignature(orderId, paymentId);

    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig,
      }),
    });

    return {
      pass: res.status === 404,
      expected: "404 Not Found",
      actual: res.status,
    };
  });

  // ==========================================
  // 3. Package Purchase Verification & Provisioning
  // ==========================================
  const pkgOrderId = `order_pkg_dual_${uniqueId}`;
  const pkgPaymentId = `pay_pkg_dual_${uniqueId}`;
  const pkgSignature = computeCheckoutSignature(pkgOrderId, pkgPaymentId);

  // Seed pending Payment record for package
  const pendingPackagePayment = await Payment.create({
    therapistId: therapistDoc._id,
    clientId: clientDoc._id,
    packageId: packageDoc._id,
    itemType: "package",
    razorpayOrderId: pkgOrderId,
    amount: 50000,
    currency: "INR",
    platformFee: 5000,
    netTherapistAmount: 44100,
    status: "created",
  });

  await testCase("VRF-PKG-01", "Valid signature synchronously captures Payment and provisions active ClientPackage (200)", async () => {
    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: pkgOrderId,
        razorpay_payment_id: pkgPaymentId,
        razorpay_signature: pkgSignature,
      }),
    });
    const data = await res.json();

    const updatedPayment = await Payment.findById(pendingPackagePayment._id);
    const clientPackage = await ClientPackage.findOne({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
      packageId: packageDoc._id,
    });

    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.status === "captured" &&
      updatedPayment.status === "captured" &&
      updatedPayment.razorpayPaymentId === pkgPaymentId &&
      Boolean(updatedPayment.invoiceNumber) &&
      Boolean(clientPackage) &&
      clientPackage.status === "active" &&
      clientPackage.remainingSessions === 5 &&
      clientPackage.totalSessions === 5;

    return {
      pass,
      expected: "Payment status: captured, 5 credits provisioned in ClientPackage",
      actual: `status=${updatedPayment?.status}, credits=${clientPackage?.remainingSessions}`,
    };
  });

  // ==========================================
  // 4. Idempotency & Duplicate Prevention Tests
  // ==========================================
  await testCase("VRF-IDEM-01", "Duplicate verification request returns 200 without creating duplicate ClientPackages or changing invoice", async () => {
    const initialPayment = await Payment.findById(pendingPackagePayment._id);
    const initialPackageCount = await ClientPackage.countDocuments({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
    });

    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: pkgOrderId,
        razorpay_payment_id: pkgPaymentId,
        razorpay_signature: pkgSignature,
      }),
    });
    const data = await res.json();

    const afterPayment = await Payment.findById(pendingPackagePayment._id);
    const afterPackageCount = await ClientPackage.countDocuments({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
    });

    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.status === "captured" &&
      initialPackageCount === afterPackageCount &&
      initialPayment.invoiceNumber === afterPayment.invoiceNumber;

    return {
      pass,
      expected: "200 OK, package count unchanged, invoice number identical",
      actual: `count=${afterPackageCount}, invoiceMatch=${initialPayment.invoiceNumber === afterPayment.invoiceNumber}`,
    };
  });

  await testCase("VRF-WB-01", "Subsequent webhook delivery for verified payment returns 200 without duplicating credits", async () => {
    const initialCount = await ClientPackage.countDocuments({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
    });

    const webhookBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pkgPaymentId,
            order_id: pkgOrderId,
            amount: 50000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              therapistId: therapistDoc._id.toString(),
              clientId: clientDoc._id.toString(),
              packageId: packageDoc._id.toString(),
              itemType: "package",
            },
          },
        },
      },
    });

    const signature = computeWebhookSignature(webhookBody);
    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: webhookBody,
    });
    const data = await res.json();

    const afterCount = await ClientPackage.countDocuments({
      therapistId: therapistDoc._id,
      clientId: clientDoc._id,
    });

    return {
      pass: res.status === 200 && data.success === true && initialCount === afterCount,
      expected: "Webhook returns 200 OK without creating duplicate ClientPackage",
      actual: `status=${res.status}, countBefore=${initialCount}, countAfter=${afterCount}`,
    };
  });

  // ==========================================
  // 5. Single Session Booking Verification
  // ==========================================
  const sesOrderId = `order_ses_dual_${uniqueId}`;
  const sesPaymentId = `pay_ses_dual_${uniqueId}`;
  const sesSignature = computeCheckoutSignature(sesOrderId, sesPaymentId);

  const pendingSessionPayment = await Payment.create({
    therapistId: therapistDoc._id,
    clientId: clientDoc._id,
    bookingId: bookingDoc._id,
    itemType: "single_session",
    razorpayOrderId: sesOrderId,
    amount: 150000,
    currency: "INR",
    platformFee: 15000,
    netTherapistAmount: 132300,
    status: "created",
  });

  await testCase("VRF-SES-01", "Valid signature for single-session payment confirms Booking and sets paymentStatus paid (200)", async () => {
    const res = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: sesOrderId,
        razorpay_payment_id: sesPaymentId,
        razorpay_signature: sesSignature,
      }),
    });
    const data = await res.json();

    const updatedPayment = await Payment.findById(pendingSessionPayment._id);
    const updatedBooking = await Booking.findById(bookingDoc._id);

    const pass =
      res.status === 200 &&
      data.success === true &&
      data.data.status === "captured" &&
      updatedPayment.status === "captured" &&
      updatedBooking.paymentStatus === "paid" &&
      updatedBooking.status === "confirmed" &&
      updatedBooking.paymentId.toString() === updatedPayment._id.toString();

    return {
      pass,
      expected: "Booking confirmed and marked paid with paymentId linked",
      actual: `bookingPaymentStatus=${updatedBooking?.paymentStatus}, bookingStatus=${updatedBooking?.status}`,
    };
  });

  // ============================================================
  // 6. Comprehensive Tests for the 3 Booking Payment Paths
  // ============================================================

  // PATH-01-ONLINE: Pay Online path (create order -> verify signature -> mark paid)
  let onlineBookingId = null;
  let onlineOrderId = null;
  let onlinePaymentId = null;

  await testCase("PATH-01-ONLINE", "Pay Online path creates genuine order with clientId, and verify marks booking paid (201, 200)", async () => {
    // 1. Create booking (unpaid initially)
    const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistDoc.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Online Paying Client",
        clientEmail: `client.online.${uniqueId}@example.com`,
        clientPhone: "+91 98765 11111",
        startTime: "2026-12-10T10:00:00.000Z",
        duration: 60,
        usePackageCredit: false,
      }),
    });
    const bookData = await bookRes.json();
    if (bookRes.status !== 201 || !bookData.data?.id) {
      return { pass: false, actual: `Booking failed with status ${bookRes.status}: ${bookData.message}` };
    }
    onlineBookingId = bookData.data.id;

    // 2. Initiate session payment order
    const orderRes = await fetch(`${baseUrl}/payments/public/${therapistDoc.slug}/session-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: onlineBookingId,
        amountInRupees: 1500,
      }),
    });
    const orderData = await orderRes.json();
    if (orderRes.status !== 201 || !orderData.data?.orderId || !orderData.data?.key) {
      return { pass: false, actual: `Session order creation failed: ${orderRes.status} (${orderData.message})` };
    }
    onlineOrderId = orderData.data.orderId;

    // Verify Payment document created in DB with valid clientId
    const createdPayment = await Payment.findOne({ razorpayOrderId: onlineOrderId });
    if (!createdPayment || !createdPayment.clientId || createdPayment.status !== "created") {
      return { pass: false, actual: `Payment record missing or invalid: clientId=${createdPayment?.clientId}, status=${createdPayment?.status}` };
    }

    // 3. Verify payment signature
    onlinePaymentId = `pay_online_${uniqueId}`;
    const onlineSig = computeCheckoutSignature(onlineOrderId, onlinePaymentId);

    const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: onlineOrderId,
        razorpay_payment_id: onlinePaymentId,
        razorpay_signature: onlineSig,
      }),
    });
    const verifyData = await verifyRes.json();

    const finalPayment = await Payment.findOne({ razorpayOrderId: onlineOrderId });
    const finalBooking = await Booking.findById(onlineBookingId);

    // 4. Test duplicate session order rejection on already paid booking
    const duplicateOrderRes = await fetch(`${baseUrl}/payments/public/${therapistDoc.slug}/session-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: onlineBookingId,
        amountInRupees: 1500,
      }),
    });

    const pass =
      verifyRes.status === 200 &&
      verifyData.success === true &&
      finalPayment.status === "captured" &&
      finalPayment.razorpayPaymentId === onlinePaymentId &&
      finalBooking.paymentStatus === "paid" &&
      finalBooking.paymentId.toString() === finalPayment._id.toString() &&
      duplicateOrderRes.status === 400;

    return {
      pass,
      expected: "Session payment order created, verified to captured/paid, duplicate order rejected with 400",
      actual: `verify=${verifyRes.status}, paymentStatus=${finalBooking?.paymentStatus}, dupOrder=${duplicateOrderRes.status}`,
    };
  });

  // PATH-02-POST-SESSION: Pay Post-Session path
  await testCase("PATH-02-POST-SESSION", "Pay Post-Session path creates confirmed booking with unpaid status and no upfront charges (201)", async () => {
    const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistDoc.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Post Session Client",
        clientEmail: `client.post.${uniqueId}@example.com`,
        clientPhone: "+91 98765 22222",
        startTime: "2026-12-10T12:00:00.000Z",
        duration: 60,
        usePackageCredit: false,
      }),
    });
    const bookData = await bookRes.json();
    const createdBooking = await Booking.findById(bookData.data?.id);

    const pass =
      bookRes.status === 201 &&
      createdBooking &&
      createdBooking.status === "confirmed" &&
      createdBooking.paymentStatus === "unpaid" &&
      createdBooking.paymentId === null &&
      createdBooking.clientPackageId === null;

    return {
      pass,
      expected: "Booking status confirmed, paymentStatus unpaid, paymentId null",
      actual: `status=${createdBooking?.status}, paymentStatus=${createdBooking?.paymentStatus}`,
    };
  });

  // PATH-03-PACKAGE-CREDIT: Package credit redemption path
  await testCase("PATH-03-PACKAGE-CREDIT", "Package credit path redeems 1 credit atomically and marks booking package_credit (201)", async () => {
    const creditClient = await Client.create({
      therapist_id: therapistDoc._id,
      name: "Credit Client",
      email: `client.credit.${uniqueId}@example.com`,
      phone: "+91 98765 33333",
    });

    const activeClientPkg = await ClientPackage.create({
      therapistId: therapistDoc._id,
      clientId: creditClient._id,
      packageId: packageDoc._id,
      totalSessions: 5,
      usedSessions: 1,
      remainingSessions: 4,
      expiresAt: new Date(Date.now() + 86400000 * 60),
      status: "active",
    });

    const bookRes = await fetch(`${baseUrl}/scheduling/public/${therapistDoc.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: creditClient.name,
        clientEmail: creditClient.email,
        startTime: "2026-12-10T14:00:00.000Z",
        duration: 60,
        usePackageCredit: true,
      }),
    });
    const bookData = await bookRes.json();
    const createdBooking = await Booking.findById(bookData.data?.id);
    const updatedPkg = await ClientPackage.findById(activeClientPkg._id);

    const pass =
      bookRes.status === 201 &&
      createdBooking &&
      createdBooking.paymentStatus === "package_credit" &&
      createdBooking.clientPackageId.toString() === activeClientPkg._id.toString() &&
      updatedPkg.remainingSessions === 3 &&
      updatedPkg.usedSessions === 2;

    return {
      pass,
      expected: "Booking paymentStatus package_credit, remaining credits decremented 4 -> 3",
      actual: `paymentStatus=${createdBooking?.paymentStatus}, remainingCredits=${updatedPkg?.remainingSessions}`,
    };
  });

  // Cleanup seeded records
  await Availability.deleteMany({ therapistId: therapistDoc._id });
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
  console.log(`Payment Verification Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPaymentVerificationTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
