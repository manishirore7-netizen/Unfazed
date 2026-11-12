const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Client = require("../models/Client");
const Package = require("../models/Package");
const ClientPackage = require("../models/ClientPackage");
const Therapist = require("../models/Therapist");
const {
  verifyWebhookSignature,
  verifyPaymentSignature,
  fetchPayment,
  createOrder,
} = require("../services/razorpayService");
const {
  calculatePaymentBreakdown,
  generateInvoiceNumber,
  rupeesToPaise,
  CURRENCY,
} = require("../config/paymentConfig");
const { getPublicKeyId, isRazorpayConfigured } = require("../config/razorpay");
const { generateInvoicePDF } = require("../services/invoiceService");

/**
 * Handle incoming Razorpay webhook events.
 * Route: POST /api/payments/webhook
 * Access: Public (cryptographically verified via HMAC SHA-256)
 */
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    if (!signature || typeof signature !== "string") {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature header.",
      });
    }

    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    // Cryptographic validation
    const isValid = verifyWebhookSignature({
      rawBody,
      signature: signature.trim(),
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature.",
      });
    }

    const event = req.body;
    if (!event || !event.event || !event.payload) {
      return res.status(400).json({
        success: false,
        message: "Malformed webhook payload.",
      });
    }

    const eventType = event.event;
    const paymentEntity = event.payload.payment?.entity;
    const orderEntity = event.payload.order?.entity;

    // Handle payment events
    if (eventType === "payment.captured" || eventType === "order.paid") {
      return await handlePaymentCaptured({ paymentEntity, orderEntity, res });
    }

    if (eventType === "payment.failed") {
      return await handlePaymentFailed({ paymentEntity, res });
    }

    // Acknowledge unsupported or informational events cleanly
    return res.status(200).json({
      success: true,
      message: `Event '${eventType}' received and ignored.`,
    });
  } catch (error) {
    console.error("[Payment Webhook Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while processing webhook.",
    });
  }
};

/**
 * Shared idempotent payment capture execution function.
 * Synchronous client verification and asynchronous webhook processing use this exact business logic.
 *
 * @param {Object} params
 * @param {string} [params.razorpayOrderId]
 * @param {string} [params.razorpayPaymentId]
 * @param {string} [params.paymentMethod]
 * @param {Object} [params.paymentEntity]
 * @param {Object} [params.orderEntity]
 * @param {Object} [params.notes]
 * @returns {Promise<{ isAlreadyCaptured: boolean, payment: Object }>}
 */
const executePaymentCapture = async ({
  payment: providedPayment,
  razorpayOrderId,
  razorpayPaymentId,
  paymentMethod,
  paymentEntity,
  orderEntity,
  notes = {},
}) => {
  const pId = razorpayPaymentId || paymentEntity?.id || null;
  const oId = razorpayOrderId || paymentEntity?.order_id || orderEntity?.id || null;
  const combinedNotes = {
    ...notes,
    ...(orderEntity?.notes || {}),
    ...(paymentEntity?.notes || {}),
  };

  // 1. Check for existing payment record by paymentId or orderId
  let payment = providedPayment || null;
  if (!payment && pId) {
    payment = await Payment.findOne({ razorpayPaymentId: pId });
  }

  if (!payment && oId) {
    payment = await Payment.findOne({ razorpayOrderId: oId });
  }

  // 2. IDEMPOTENCY CHECK:
  // If payment is already captured, return early without repeating side-effects
  if (payment && payment.status === "captured") {
    return {
      isAlreadyCaptured: true,
      payment,
    };
  }

  const grossAmount = paymentEntity?.amount || orderEntity?.amount || payment?.amount || 0;
  const currency = (paymentEntity?.currency || payment?.currency || CURRENCY || "INR").toUpperCase();
  const method = paymentEntity?.method || paymentMethod || payment?.paymentMethod || "unknown";

  // Calculate platform fee and net therapist earnings
  const breakdown = calculatePaymentBreakdown({ amountInPaise: grossAmount });

  // 3. Resolve associations (Therapist, Client, Booking, Package)
  const therapistId =
    payment?.therapistId ||
    (combinedNotes.therapistId && mongoose.Types.ObjectId.isValid(combinedNotes.therapistId)
      ? new mongoose.Types.ObjectId(combinedNotes.therapistId)
      : null);

  const clientId =
    payment?.clientId ||
    (combinedNotes.clientId && mongoose.Types.ObjectId.isValid(combinedNotes.clientId)
      ? new mongoose.Types.ObjectId(combinedNotes.clientId)
      : null);

  const bookingId =
    payment?.bookingId ||
    (combinedNotes.bookingId && mongoose.Types.ObjectId.isValid(combinedNotes.bookingId)
      ? new mongoose.Types.ObjectId(combinedNotes.bookingId)
      : null);

  const rawPkgId = payment?.packageId || combinedNotes.packageId;
  const packageId =
    rawPkgId && mongoose.Types.ObjectId.isValid(rawPkgId)
      ? new mongoose.Types.ObjectId(rawPkgId)
      : null;

  const itemType =
    payment?.itemType || (combinedNotes.itemType === "package" ? "package" : "single_session");

  // 4. Create or update Payment ledger entry
  if (!payment) {
    if (!therapistId || !clientId) {
      throw new Error("Payment captured but missing required therapist or client association.");
    }

    const invoiceNumber = generateInvoiceNumber(Date.now().toString().slice(-6));

    payment = new Payment({
      therapistId,
      clientId,
      bookingId,
      itemType,
      razorpayOrderId: oId,
      razorpayPaymentId: pId,
      amount: breakdown.grossAmount,
      currency,
      platformFee: breakdown.platformFee,
      netTherapistAmount: breakdown.netTherapistAmount,
      status: "captured",
      paymentMethod: method,
      invoiceNumber,
    });
  } else {
    payment.status = "captured";
    payment.razorpayPaymentId = pId || payment.razorpayPaymentId;
    payment.paymentMethod = method;
    if (!payment.invoiceNumber) {
      payment.invoiceNumber = generateInvoiceNumber(Date.now().toString().slice(-6));
    }
  }

  // 5. Update associated Booking if single session
  if (bookingId && therapistId) {
    const booking = await Booking.findOne({
      _id: bookingId,
      therapistId,
    });

    if (booking) {
      booking.paymentStatus = "paid";
      booking.paymentId = payment._id;
      if (booking.status !== "confirmed") {
        booking.status = "confirmed";
      }
      await booking.save();
    }
  }

  // 6. Provision or activate ClientPackage if package purchase
  if (itemType === "package") {
    // Check if client package already linked (prevent duplicate credit)
    if (!payment.clientPackageId && packageId && therapistId && clientId) {
      const packageDoc = await Package.findOne({
        _id: packageId,
        therapistId,
      });

      if (packageDoc) {
        const validityDays = packageDoc.validityDays || 90;
        const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

        const clientPackage = await ClientPackage.create({
          therapistId,
          clientId,
          packageId: packageDoc._id,
          totalSessions: packageDoc.sessionCount,
          usedSessions: 0,
          remainingSessions: packageDoc.sessionCount,
          expiresAt,
          status: "active",
        });

        payment.clientPackageId = clientPackage._id;
      }
    } else if (payment.clientPackageId) {
      // If already linked, ensure status is active
      await ClientPackage.findByIdAndUpdate(payment.clientPackageId, {
        $set: { status: "active" },
      });
    }
  }

  await payment.save();

  return {
    isAlreadyCaptured: false,
    payment,
  };
};

/**
 * Idempotently processes a captured payment from webhook.
 * Ensures duplicate webhook deliveries never create duplicate payments or double-credit packages.
 */
const handlePaymentCaptured = async ({ paymentEntity, orderEntity, res }) => {
  if (!paymentEntity && !orderEntity) {
    return res.status(400).json({
      success: false,
      message: "No payment or order entity provided in captured payload.",
    });
  }

  try {
    const { isAlreadyCaptured, payment } = await executePaymentCapture({
      razorpayPaymentId: paymentEntity?.id || null,
      razorpayOrderId: paymentEntity?.order_id || orderEntity?.id || null,
      paymentEntity,
      orderEntity,
      notes: paymentEntity?.notes || orderEntity?.notes || {},
    });

    return res.status(200).json({
      success: true,
      message: isAlreadyCaptured
        ? "Payment has already been processed (idempotent)."
        : "Payment captured successfully.",
      data: {
        paymentId: payment._id,
        status: payment.status,
        itemType: payment.itemType,
        invoiceNumber: payment.invoiceNumber,
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to process payment capture.",
    });
  }
};

/**
 * Idempotently processes a failed payment event.
 */
const handlePaymentFailed = async ({ paymentEntity, res }) => {
  if (!paymentEntity) {
    return res.status(400).json({
      success: false,
      message: "No payment entity provided in failed payload.",
    });
  }

  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id || null;

  let payment = null;
  if (razorpayPaymentId) {
    payment = await Payment.findOne({ razorpayPaymentId });
  }

  if (!payment && razorpayOrderId) {
    payment = await Payment.findOne({ razorpayOrderId });
  }

  if (payment) {
    payment.status = "failed";
    payment.paymentMethod = paymentEntity.method || payment.paymentMethod;
    await payment.save();

    // If associated with a booking, mark payment status unpaid
    if (payment.bookingId) {
      await Booking.findOneAndUpdate(
        { _id: payment.bookingId, therapistId: payment.therapistId },
        { $set: { paymentStatus: "unpaid" } }
      );
    }
  }

  return res.status(200).json({
    success: true,
    message: "Payment failure recorded.",
    data: {
      razorpayPaymentId,
      status: "failed",
    },
  });
};

/**
 * Generate and stream an immutable downloadable PDF invoice for a captured payment.
 * Route: GET /api/payments/:id/invoice
 * Access: Private (Authenticated therapist who owns the payment)
 */
const getPaymentInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID format.",
      });
    }

    const payment = await Payment.findOne({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found.",
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Invoices can only be generated for captured payments.",
      });
    }

    // Ensure invoice number is set and preserved immutably
    if (!payment.invoiceNumber) {
      payment.invoiceNumber = generateInvoiceNumber(Date.now().toString().slice(-6));
      await payment.save();
    }

    // Fetch related entities for invoice context
    const [therapist, client, booking, packageDoc] = await Promise.all([
      Therapist.findById(payment.therapistId).lean(),
      Client.findById(payment.clientId).lean(),
      payment.bookingId ? Booking.findById(payment.bookingId).lean() : null,
      payment.packageId ? Package.findById(payment.packageId).lean() : null,
    ]);

    const pdfBuffer = await generateInvoicePDF({
      payment,
      therapist: therapist || {},
      client: client || {},
      booking,
      packageDoc,
    });

    const filename = `invoice-${payment.invoiceNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("[Invoice Generation Error]:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while generating invoice.",
    });
  }
};

/**
 * List payment records belonging to the authenticated therapist.
 * Supports filtering by status and itemType, and computes total metrics.
 * Route: GET /api/payments
 * Access: Private (Therapist)
 */
const getTherapistPayments = async (req, res) => {
  try {
    const filter = { therapistId: req.therapistId };

    if (req.query.status && ["created", "captured", "failed", "refunded"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.itemType && ["single_session", "package"].includes(req.query.itemType)) {
      filter.itemType = req.query.itemType;
    }

    const payments = await Payment.find(filter)
      .populate("clientId", "name email phone")
      .populate("packageId", "title sessionCount durationMinutes price")
      .populate("bookingId", "startTime endTime duration")
      .sort({ createdAt: -1 });

    const summary = {
      totalGrossPaise: 0,
      totalPlatformFeePaise: 0,
      totalNetEarningsPaise: 0,
      capturedCount: 0,
      createdCount: 0,
      failedCount: 0,
      refundedCount: 0,
    };

    payments.forEach((p) => {
      if (p.status === "captured") {
        summary.totalGrossPaise += p.amount || 0;
        summary.totalPlatformFeePaise += p.platformFee || 0;
        summary.totalNetEarningsPaise += p.netTherapistAmount || 0;
        summary.capturedCount++;
      } else if (p.status === "created") {
        summary.createdCount++;
      } else if (p.status === "failed") {
        summary.failedCount++;
      } else if (p.status === "refunded") {
        summary.refundedCount++;
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        payments,
        summary,
      },
    });
  } catch (error) {
    console.error("Error fetching therapist payments:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching payment records.",
    });
  }
};

/**
 * Public payment configuration endpoint (exposes public keyId safely).
 * Route: GET /api/payments/config
 * Access: Public
 */
const getPaymentConfig = async (req, res) => {
  try {
    const keyId = getPublicKeyId();
    return res.status(200).json({
      success: true,
      data: {
        keyId,
        currency: CURRENCY,
        isConfigured: isRazorpayConfigured(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment configuration.",
    });
  }
};

/**
 * Public/Private status check for a payment record.
 * Route: GET /api/payments/:id/status
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let payment = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      payment = await Payment.findById(id)
        .populate("clientId", "name email")
        .populate("packageId", "title")
        .lean();
    } else {
      payment = await Payment.findOne({ razorpayOrderId: id })
        .populate("clientId", "name email")
        .populate("packageId", "title")
        .lean();
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found." });
    }

    return res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        invoiceNumber: payment.invoiceNumber,
        itemType: payment.itemType,
        hasInvoice: payment.status === "captured",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to check payment status.",
    });
  }
};

/**
 * Public endpoint to initiate online payment order for a scheduled session booking.
 * Route: POST /api/payments/public/:slug/session-order
 * Access: Public
 */
const createSessionPaymentOrder = async (req, res) => {
  try {
    const { slug } = req.params;
    const { bookingId, amountInRupees } = req.body;

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ success: false, message: "Valid bookingId is required." });
    }

    const therapist = await Therapist.findOne({ slug: slug.trim().toLowerCase() }).lean();
    if (!therapist) {
      return res.status(404).json({ success: false, message: "Therapist not found." });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      therapistId: therapist._id,
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking record not found." });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "This session has already been paid for." });
    }

    // Resolve associated clientId from booking or client lookup
    let clientId = booking.clientId || null;
    if (!clientId && booking.clientEmail) {
      const client = await Client.findOne({
        therapist_id: therapist._id,
        email: booking.clientEmail.trim().toLowerCase(),
      });
      if (client) {
        clientId = client._id;
        booking.clientId = client._id;
        await booking.save();
      }
    }

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "Booking is missing an associated client record.",
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment.",
      });
    }

    // Convert amount to paise (default ₹1,500 if not specified)
    const amountPaise = amountInRupees ? rupeesToPaise(Number(amountInRupees)) : 150000;

    const receipt = `ses_${Date.now().toString().slice(-8)}`;
    const order = await createOrder({
      amount: amountPaise,
      currency: CURRENCY,
      receipt,
      notes: {
        therapistId: therapist._id.toString(),
        clientId: clientId.toString(),
        bookingId: booking._id.toString(),
        itemType: "single_session",
      },
    });

    const breakdown = calculatePaymentBreakdown({ amountInPaise: amountPaise });

    const payment = await Payment.create({
      therapistId: therapist._id,
      clientId: clientId,
      bookingId: booking._id,
      itemType: "single_session",
      razorpayOrderId: order.id,
      amount: amountPaise,
      currency: CURRENCY,
      platformFee: breakdown.platformFee,
      netTherapistAmount: breakdown.netTherapistAmount,
      status: "created",
    });

    // Link pending payment reference to booking
    booking.paymentId = payment._id;
    await booking.save();

    return res.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        key: getPublicKeyId(),
      },
    });
  } catch (error) {
    console.error("Error creating session payment order:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create session payment order.",
    });
  }
};

/**
 * Synchronously verify Razorpay checkout signature and capture payment idempotently.
 * Route: POST /api/payments/verify
 * Access: Public (cryptographically verified via HMAC SHA-256)
 */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || typeof razorpay_order_id !== "string" || !razorpay_order_id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid razorpay_order_id.",
      });
    }

    if (!razorpay_payment_id || typeof razorpay_payment_id !== "string" || !razorpay_payment_id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid razorpay_payment_id.",
      });
    }

    if (!razorpay_signature || typeof razorpay_signature !== "string" || !razorpay_signature.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid razorpay_signature.",
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured.",
      });
    }

    // Cryptographic signature verification using HMAC SHA-256
    const isValid = verifyPaymentSignature({
      orderId: razorpay_order_id.trim(),
      paymentId: razorpay_payment_id.trim(),
      signature: razorpay_signature.trim(),
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature verification failed.",
      });
    }

    // Ensure payment order record exists before attempting capture
    const existingPayment = await Payment.findOne({
      $or: [
        { razorpayOrderId: razorpay_order_id.trim() },
        { razorpayPaymentId: razorpay_payment_id.trim() },
      ],
    });

    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Payment order record not found.",
      });
    }

    // Execute capture side-effects (ledger update, booking confirmation or package credit provisioning)
    const { isAlreadyCaptured, payment } = await executePaymentCapture({
      payment: existingPayment,
      razorpayOrderId: razorpay_order_id.trim(),
      razorpayPaymentId: razorpay_payment_id.trim(),
      paymentMethod: "online",
    });

    return res.status(200).json({
      success: true,
      message: isAlreadyCaptured
        ? "Payment has already been processed (idempotent)."
        : "Payment verified and captured successfully.",
      data: {
        paymentId: payment._id,
        status: payment.status,
        itemType: payment.itemType,
        invoiceNumber: payment.invoiceNumber,
        amount: payment.amount,
        clientPackageId: payment.clientPackageId,
      },
    });
  } catch (error) {
    console.error("Error in verifyPayment:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify payment.",
    });
  }
};

module.exports = {
  handleWebhook,
  verifyPayment,
  getPaymentInvoice,
  getTherapistPayments,
  getPaymentConfig,
  getPaymentStatus,
  createSessionPaymentOrder,
};
