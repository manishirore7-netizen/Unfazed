require("dotenv").config();
const mongoose = require("mongoose");
const Package = require("../src/models/Package");
const ClientPackage = require("../src/models/ClientPackage");
const Payment = require("../src/models/Payment");
const Booking = require("../src/models/Booking");
const {
  CURRENCY,
  PLATFORM_FEE_PERCENT,
  GST_PERCENT,
  rupeesToPaise,
  paiseToRupees,
  calculatePaymentBreakdown,
  generateInvoiceNumber,
} = require("../src/config/paymentConfig");
const {
  isRazorpayConfigured,
  getPublicKeyId,
  getWebhookSecret,
} = require("../src/config/razorpay");

async function runPaymentModelTests() {
  console.log("=== Testing Module 4 Payment Configuration & Domain Models ===");
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

  const dummyTherapistId = new mongoose.Types.ObjectId();
  const dummyClientId = new mongoose.Types.ObjectId();
  const dummyBookingId = new mongoose.Types.ObjectId();

  // ==========================================
  // 1. Payment Configuration & Monetary Utils
  // ==========================================
  assert(CURRENCY === "INR", "Default currency is configured as INR");
  assert(PLATFORM_FEE_PERCENT === 10, "Default platform fee percent is 10%");
  assert(GST_PERCENT === 18, "Default GST percent is 18%");

  assert(rupeesToPaise(500) === 50000, "rupeesToPaise correctly converts ₹500 to 50,000 paise");
  assert(rupeesToPaise(149.99) === 14999, "rupeesToPaise handles floating decimals to whole paise");
  assert(paiseToRupees(50000) === 500, "paiseToRupees correctly converts 50,000 paise to ₹500");

  let threwOnNegativeRupees = false;
  try {
    rupeesToPaise(-10);
  } catch {
    threwOnNegativeRupees = true;
  }
  assert(threwOnNegativeRupees, "rupeesToPaise rejects negative values");

  const breakdown = calculatePaymentBreakdown({
    amountInPaise: 100000, // ₹1,000
    feePercent: 10,
    flatFeePaise: 0,
    taxPercent: 18,
  });

  assert(breakdown.grossAmount === 100000, "Breakdown grossAmount is 100,000 paise");
  assert(breakdown.platformFee === 10000, "Platform fee is 10% (10,000 paise / ₹100)");
  assert(breakdown.taxOnFee === 1800, "GST on platform fee is 18% (1,800 paise / ₹18)");
  assert(breakdown.netTherapistAmount === 88200, "Net therapist amount is ₹882 (88,200 paise)");
  assert(
    breakdown.platformFee + breakdown.taxOnFee + breakdown.netTherapistAmount === breakdown.grossAmount,
    "Sum of net amount + fee + tax matches gross amount exactly"
  );

  const testDate = new Date("2026-11-10T12:00:00Z");
  const invoiceNo = generateInvoiceNumber(42, testDate);
  assert(invoiceNo === "UNF-202611-000042", "generateInvoiceNumber matches standardized format");

  // ==========================================
  // 2. Razorpay Configuration Safety
  // ==========================================
  assert(typeof isRazorpayConfigured() === "boolean", "isRazorpayConfigured returns a boolean");
  const pubKey = getPublicKeyId();
  assert(typeof pubKey === "string" || pubKey === null, "getPublicKeyId returns string or null");
  const razorpayExports = require("../src/config/razorpay");
  assert(
    razorpayExports.keySecret === undefined &&
      razorpayExports.RAZORPAY_KEY_SECRET === undefined &&
      razorpayExports.secret === undefined,
    "Razorpay secret key is isolated and never exported from config module"
  );

  // ==========================================
  // 3. Package Model Validation
  // ==========================================
  const validPackage = new Package({
    therapistId: dummyTherapistId,
    title: "5-Session Anxiety Protocol",
    description: "Targeted 5-session package for cognitive reframing.",
    sessionCount: 5,
    durationMinutes: 60,
    price: 900000, // ₹9,000 in paise
    discountPercentage: 15,
    validityDays: 90,
    isActive: true,
  });
  await validPackage.validate();
  assert(true, "Valid Package instance passes validation");

  const missingTitlePackage = new Package({
    therapistId: dummyTherapistId,
    sessionCount: 5,
    durationMinutes: 60,
    price: 900000,
  });
  assert(await validateThrows(missingTitlePackage), "Package without title fails validation");

  const invalidDurationPackage = new Package({
    therapistId: dummyTherapistId,
    title: "Invalid Duration Pack",
    sessionCount: 3,
    durationMinutes: 50, // not in [30, 45, 60, 90]
    price: 500000,
  });
  assert(await validateThrows(invalidDurationPackage), "Package with unapproved duration fails validation");

  const negativePricePackage = new Package({
    therapistId: dummyTherapistId,
    title: "Negative Price Pack",
    sessionCount: 5,
    durationMinutes: 60,
    price: -100,
  });
  assert(await validateThrows(negativePricePackage), "Package with negative price fails validation");

  const floatPricePackage = new Package({
    therapistId: dummyTherapistId,
    title: "Float Price Pack",
    sessionCount: 5,
    durationMinutes: 60,
    price: 500.5, // must be integer paise
  });
  assert(await validateThrows(floatPricePackage), "Package with fractional paise fails validation");

  const excessiveDiscountPackage = new Package({
    therapistId: dummyTherapistId,
    title: "Over-discount Pack",
    sessionCount: 5,
    durationMinutes: 60,
    price: 500000,
    discountPercentage: 120, // > 100%
  });
  assert(await validateThrows(excessiveDiscountPackage), "Package with discount > 100% fails validation");

  // ==========================================
  // 4. ClientPackage Model Validation
  // ==========================================
  const validClientPackage = new ClientPackage({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    packageId: validPackage._id,
    totalSessions: 5,
    usedSessions: 1,
    remainingSessions: 4,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    status: "active",
  });
  await validClientPackage.validate();
  assert(true, "Valid ClientPackage instance passes validation");

  const autoRemainingPkg = new ClientPackage({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    packageId: validPackage._id,
    totalSessions: 6,
    usedSessions: 2,
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  });
  await autoRemainingPkg.validate();
  assert(autoRemainingPkg.remainingSessions === 4, "ClientPackage auto-calculates remainingSessions (6 - 2 = 4)");

  const exhaustedPkg = new ClientPackage({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    packageId: validPackage._id,
    totalSessions: 4,
    usedSessions: 4,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  await exhaustedPkg.validate();
  assert(exhaustedPkg.status === "exhausted", "ClientPackage auto-sets status to 'exhausted' when balance is 0");

  const mismatchedPkg = new ClientPackage({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    packageId: validPackage._id,
    totalSessions: 5,
    usedSessions: 2,
    remainingSessions: 4, // 2 + 4 != 5
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  assert(await validateThrows(mismatchedPkg), "ClientPackage with mismatched session balance fails validation");

  // ==========================================
  // 5. Payment Model Validation
  // ==========================================
  const validPayment = new Payment({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    bookingId: dummyBookingId,
    itemType: "single_session",
    razorpayOrderId: "order_123456789",
    razorpayPaymentId: "pay_987654321",
    amount: 150000, // ₹1,500
    currency: "INR",
    platformFee: 15000, // ₹150
    netTherapistAmount: 135000, // ₹1,350
    status: "captured",
    paymentMethod: "upi",
    invoiceNumber: "UNF-202611-000099",
  });
  await validPayment.validate();
  assert(true, "Valid Payment instance passes validation");

  const invalidItemTypePayment = new Payment({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    itemType: "invalid_type",
    amount: 100000,
    platformFee: 10000,
    netTherapistAmount: 90000,
  });
  assert(await validateThrows(invalidItemTypePayment), "Payment with unapproved itemType fails validation");

  const invalidStatusPayment = new Payment({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    itemType: "single_session",
    amount: 100000,
    platformFee: 10000,
    netTherapistAmount: 90000,
    status: "unknown_status",
  });
  assert(await validateThrows(invalidStatusPayment), "Payment with unapproved status fails validation");

  const excessiveNetPayment = new Payment({
    therapistId: dummyTherapistId,
    clientId: dummyClientId,
    itemType: "package",
    amount: 100000,
    platformFee: 20000,
    netTherapistAmount: 150000, // exceeds gross amount
  });
  assert(await validateThrows(excessiveNetPayment), "Payment with net amount exceeding gross amount fails validation");

  // ==========================================
  // 6. Booking Model Payment Compatibility
  // ==========================================
  const validBookingWithPaymentDefaults = new Booking({
    therapistId: dummyTherapistId,
    clientName: "Aarav Sharma",
    clientEmail: "aarav@example.com",
    duration: 60,
    startTime: new Date("2026-11-20T10:00:00.000Z"),
    endTime: new Date("2026-11-20T11:00:00.000Z"),
    bookedBuckets: ["2026-11-20T10:00:00.000Z", "2026-11-20T10:15:00.000Z"],
  });
  await validBookingWithPaymentDefaults.validate();
  assert(
    validBookingWithPaymentDefaults.paymentStatus === "unpaid",
    "Booking defaults paymentStatus to 'unpaid'"
  );
  assert(
    validBookingWithPaymentDefaults.paymentId === null,
    "Booking defaults paymentId to null"
  );

  const bookingWithPackageCredit = new Booking({
    therapistId: dummyTherapistId,
    clientName: "Pooja Mehta",
    clientEmail: "pooja@example.com",
    duration: 45,
    startTime: new Date("2026-11-20T14:00:00.000Z"),
    endTime: new Date("2026-11-20T14:45:00.000Z"),
    bookedBuckets: ["2026-11-20T14:00:00.000Z"],
    paymentStatus: "package_credit",
  });
  await bookingWithPackageCredit.validate();
  assert(
    bookingWithPackageCredit.paymentStatus === "package_credit",
    "Booking accepts 'package_credit' paymentStatus"
  );

  const invalidPaymentStatusBooking = new Booking({
    therapistId: dummyTherapistId,
    clientName: "Test Client",
    clientEmail: "test@example.com",
    duration: 30,
    startTime: new Date("2026-11-20T16:00:00.000Z"),
    endTime: new Date("2026-11-20T16:30:00.000Z"),
    bookedBuckets: ["2026-11-20T16:00:00.000Z"],
    paymentStatus: "unsupported_status",
  });
  assert(
    await validateThrows(invalidPaymentStatusBooking),
    "Booking with invalid paymentStatus fails validation"
  );

  // Check unique index on Booking is preserved
  const indexes = Booking.schema.indexes();
  const hasConcurrencyIndex = indexes.some(
    ([fields, options]) =>
      fields.therapistId === 1 &&
      fields.bookedBuckets === 1 &&
      options?.unique === true &&
      options?.partialFilterExpression?.status === "confirmed"
  );
  assert(
    hasConcurrencyIndex,
    "Booking schema preserves unique multikey concurrency index on { therapistId, bookedBuckets }"
  );

  console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentModelTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
