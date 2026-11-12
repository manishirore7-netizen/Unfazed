const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const Therapist = require("../src/models/Therapist");
const Client = require("../src/models/Client");
const Package = require("../src/models/Package");
const Booking = require("../src/models/Booking");
const Payment = require("../src/models/Payment");
const { generateInvoicePDF, formatCurrency, formatDate } = require("../src/services/invoiceService");

async function runPaymentInvoiceTestSuite() {
  console.log(`\n========================================================`);
  console.log(`Starting Module 4 Phase 4 — PDF Invoice Generation Suite`);
  console.log(`========================================================\n`);

  let server;
  let baseUrl;
  const results = [];
  const uniqueId = Date.now();

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

  const generateToken = (therapistId) => {
    return jwt.sign({ therapistId }, process.env.JWT_SECRET, { expiresIn: "1h" });
  };

  // Seed two therapists for multi-tenant isolation testing
  const therapistA = await Therapist.create({
    name: "Dr. Ananya Sen",
    email: `dr.sen.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-sen-${uniqueId}`,
  });
  const tokenA = generateToken(therapistA._id);

  const therapistB = await Therapist.create({
    name: "Dr. Kabir Roy",
    email: `dr.roy.${uniqueId}@example.com`,
    password_hash: "hashed_dummy_pw",
    slug: `dr-roy-${uniqueId}`,
  });
  const tokenB = generateToken(therapistB._id);

  const clientA = await Client.create({
    therapist_id: therapistA._id,
    name: "Meera Nair",
    email: `meera.${uniqueId}@example.com`,
    phone: "9876543210",
  });

  const bookingA = await Booking.create({
    therapistId: therapistA._id,
    clientId: clientA._id,
    clientName: clientA.name,
    clientEmail: clientA.email,
    duration: 60,
    startTime: new Date("2026-11-25T10:00:00.000Z"),
    endTime: new Date("2026-11-25T11:00:00.000Z"),
    bookedBuckets: ["2026-11-25T10:00:00.000Z", "2026-11-25T10:15:00.000Z"],
    status: "confirmed",
    paymentStatus: "paid",
  });

  const packageA = await Package.create({
    therapistId: therapistA._id,
    title: "5-Session Cognitive Behavioral Therapy",
    sessionCount: 5,
    durationMinutes: 60,
    price: 1000000, // ₹10,000 in paise
    validityDays: 90,
  });

  // Seed Captured Payment for Single Session
  const paymentSession = await Payment.create({
    therapistId: therapistA._id,
    clientId: clientA._id,
    bookingId: bookingA._id,
    itemType: "single_session",
    razorpayOrderId: `order_sess_${uniqueId}`,
    razorpayPaymentId: `pay_sess_${uniqueId}`,
    amount: 200000, // ₹2,000 in paise
    currency: "INR",
    platformFee: 20000, // ₹200
    netTherapistAmount: 180000, // ₹1,800
    status: "captured",
    paymentMethod: "upi",
    invoiceNumber: `UNF-202611-${uniqueId.toString().slice(-6)}`,
  });

  // Seed Captured Payment for Package Purchase
  const paymentPackage = await Payment.create({
    therapistId: therapistA._id,
    clientId: clientA._id,
    packageId: packageA._id,
    itemType: "package",
    razorpayOrderId: `order_pkg_${uniqueId}`,
    razorpayPaymentId: `pay_pkg_${uniqueId}`,
    amount: 1000000, // ₹10,000 in paise
    currency: "INR",
    platformFee: 100000, // ₹1,000
    netTherapistAmount: 900000, // ₹9,000
    status: "captured",
    paymentMethod: "card",
    invoiceNumber: `UNF-202611-PKG${uniqueId.toString().slice(-4)}`,
  });

  // Seed Pending / Uncaptured Payment
  const paymentPending = await Payment.create({
    therapistId: therapistA._id,
    clientId: clientA._id,
    itemType: "single_session",
    razorpayOrderId: `order_pend_${uniqueId}`,
    amount: 150000,
    currency: "INR",
    platformFee: 15000,
    netTherapistAmount: 135000,
    status: "created",
  });

  // Seed Failed Payment
  const paymentFailed = await Payment.create({
    therapistId: therapistA._id,
    clientId: clientA._id,
    itemType: "single_session",
    razorpayOrderId: `order_fail_${uniqueId}`,
    razorpayPaymentId: `pay_fail_${uniqueId}`,
    amount: 150000,
    currency: "INR",
    platformFee: 15000,
    netTherapistAmount: 135000,
    status: "failed",
  });

  // ==========================================
  // Test Cases
  // ==========================================

  // INV-AUTH-01: Reject unauthenticated invoice request
  await testCase("INV-AUTH-01", "Reject unauthenticated request to download invoice (401)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentSession._id}/invoice`);
    return { pass: res.status === 401 };
  });

  // INV-VAL-01: Reject invalid payment ID format
  await testCase("INV-VAL-01", "Reject invalid payment ID parameter format (400)", async () => {
    const res = await fetch(`${baseUrl}/payments/invalid-object-id/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    return { pass: res.status === 400 };
  });

  // INV-SEC-01: Multi-tenant ownership isolation
  await testCase("INV-SEC-01", "Therapist B cannot download Therapist A's payment invoice (404 Isolation)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentSession._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    return { pass: res.status === 404 };
  });

  // INV-STAT-01: Reject invoice for non-captured payment (created status)
  await testCase("INV-STAT-01", "Reject invoice request for payment in 'created' status (400)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentPending._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();
    return { pass: res.status === 400 && data.message.includes("captured") };
  });

  // INV-STAT-02: Reject invoice for failed payment
  await testCase("INV-STAT-02", "Reject invoice request for payment in 'failed' status (400)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentFailed._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();
    return { pass: res.status === 400 && data.message.includes("captured") };
  });

  // INV-GEN-01: Successful invoice for single session
  await testCase("INV-GEN-01", "Generate and stream downloadable PDF invoice for single session payment (200)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentSession._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    const contentType = res.headers.get("content-type");
    const contentDisposition = res.headers.get("content-disposition");
    const buffer = Buffer.from(await res.arrayBuffer());

    const isPdf = buffer.slice(0, 5).toString("utf8") === "%PDF-";
    const hasCorrectHeaders =
      contentType === "application/pdf" &&
      contentDisposition?.includes(`attachment; filename="invoice-${paymentSession.invoiceNumber}.pdf"`);

    return {
      pass: res.status === 200 && isPdf && hasCorrectHeaders && buffer.length > 500,
      expected: "application/pdf with %PDF- magic bytes and > 500 bytes",
      actual: `Status: ${res.status}, Type: ${contentType}, Bytes: ${buffer.length}`,
    };
  });

  // INV-GEN-02: Successful invoice for package purchase
  await testCase("INV-GEN-02", "Generate and stream downloadable PDF invoice for package purchase (200)", async () => {
    const res = await fetch(`${baseUrl}/payments/${paymentPackage._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    const contentType = res.headers.get("content-type");
    const buffer = Buffer.from(await res.arrayBuffer());
    const isPdf = buffer.slice(0, 5).toString("utf8") === "%PDF-";

    return {
      pass: res.status === 200 && isPdf && contentType === "application/pdf",
    };
  });

  // INV-IDEM-01: Immutable invoice number preservation
  await testCase("INV-IDEM-01", "Repeated invoice downloads preserve identical invoiceNumber immutably", async () => {
    const res1 = await fetch(`${baseUrl}/payments/${paymentSession._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const disp1 = res1.headers.get("content-disposition");

    const res2 = await fetch(`${baseUrl}/payments/${paymentSession._id}/invoice`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const disp2 = res2.headers.get("content-disposition");

    const paymentAfter = await Payment.findById(paymentSession._id);

    return {
      pass: disp1 === disp2 && paymentAfter.invoiceNumber === paymentSession.invoiceNumber,
      expected: paymentSession.invoiceNumber,
      actual: paymentAfter.invoiceNumber,
    };
  });

  // INV-SRV-01: Direct invoiceService unit test with missing optional details
  await testCase("INV-SRV-01", "invoiceService generates valid PDF buffer even when optional profile details are absent", async () => {
    const minimalPayment = new Payment({
      therapistId: therapistA._id,
      clientId: clientA._id,
      itemType: "single_session",
      amount: 50000,
      currency: "INR",
      platformFee: 5000,
      netTherapistAmount: 45000,
      status: "captured",
      invoiceNumber: "UNF-MINIMAL-001",
    });

    const pdfBuffer = await generateInvoicePDF({
      payment: minimalPayment,
      therapist: {}, // minimal/empty therapist
      client: {}, // minimal/empty client
      booking: null,
      packageDoc: null,
    });

    const isPdf = Buffer.isBuffer(pdfBuffer) && pdfBuffer.slice(0, 5).toString("utf8") === "%PDF-";
    return { pass: isPdf && pdfBuffer.length > 500 };
  });

  // INV-SRV-02: Format helpers validation
  await testCase("INV-SRV-02", "invoiceService formatting helpers handle currency and date values safely", async () => {
    const formattedAmt = formatCurrency(150000, "INR");
    const formattedDate = formatDate(new Date("2026-11-11T12:00:00Z"));
    const fallbackDate = formatDate(null);

    return {
      pass:
        formattedAmt.includes("INR") &&
        formattedAmt.includes("1,500.00") &&
        formattedDate.includes("2026") &&
        fallbackDate === "N/A",
    };
  });

  // Cleanup seeded test records
  await Payment.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Package.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Booking.deleteMany({ therapistId: { $in: [therapistA._id, therapistB._id] } });
  await Client.deleteMany({ therapist_id: { $in: [therapistA._id, therapistB._id] } });
  await Therapist.deleteMany({ _id: { $in: [therapistA._id, therapistB._id] } });

  if (server) {
    server.close();
  }
  await mongoose.disconnect();

  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log(`\n========================================================`);
  console.log(`Payment Invoice Test Summary: ${passedCount} Passed | ${failedCount} Failed`);
  console.log(`========================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPaymentInvoiceTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
