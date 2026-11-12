const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  handleWebhook,
  verifyPayment,
  getPaymentInvoice,
  getTherapistPayments,
  getPaymentConfig,
  getPaymentStatus,
  createSessionPaymentOrder,
} = require("../controllers/paymentController");

const router = express.Router();

// Public payment configuration & verification
router.get("/config", getPaymentConfig);
router.get("/:id/status", getPaymentStatus);
router.post("/verify", verifyPayment);
router.post("/public/:slug/session-order", createSessionPaymentOrder);

// Razorpay Webhook endpoint (verified via HMAC SHA-256 signature)
router.post("/webhook", handleWebhook);

// Protected therapist routes
router.use(authMiddleware);

// Payment ledger for authenticated therapist
router.get("/", getTherapistPayments);

// Downloadable PDF Invoice (authenticated therapist owning the payment)
router.get("/:id/invoice", getPaymentInvoice);

module.exports = router;
