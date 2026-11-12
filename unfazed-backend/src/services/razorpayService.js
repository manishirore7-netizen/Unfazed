const crypto = require("crypto");
const Razorpay = require("razorpay");
const {
  getRazorpayClient,
  getWebhookSecret,
  getKeySecret,
  isRazorpayConfigured,
} = require("../config/razorpay");
const { CURRENCY } = require("../config/paymentConfig");

/**
 * Creates a new genuine order via the Razorpay Orders API.
 * Requires genuine Razorpay test credentials. Throws an actionable error if credentials are not configured.
 *
 * @param {Object} params
 * @param {number} params.amount - Amount in paise (e.g., ₹500.00 = 50000 paise)
 * @param {string} [params.currency] - 3-letter currency code (defaults to config CURRENCY)
 * @param {string} [params.receipt] - Unique internal reference/receipt ID
 * @param {Object} [params.notes] - Key-value metadata attached to order
 * @returns {Promise<Object>} Razorpay Order entity
 */
const createOrder = async ({
  amount,
  currency = CURRENCY || "INR",
  receipt,
  notes = {},
}) => {
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    throw new Error("Order amount must be a positive integer in minor units (paise).");
  }

  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay test-mode credentials are not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment."
    );
  }

  const client = getRazorpayClient();

  const payload = {
    amount: Math.round(amount),
    currency: currency.toUpperCase(),
    notes,
  };

  if (receipt) {
    payload.receipt = String(receipt).slice(0, 40); // Razorpay receipt max 40 chars
  }

  return client.orders.create(payload);
};

/**
 * Cryptographically verifies the HMAC SHA-256 signature attached to a Razorpay webhook delivery.
 * Uses timing-safe signature comparison to protect against timing attacks.
 *
 * @param {Object} params
 * @param {string|Buffer} params.rawBody - Raw payload body received from the webhook request
 * @param {string} params.signature - Value of the X-Razorpay-Signature HTTP header
 * @param {string} [params.secret] - Webhook secret (defaults to configured RAZORPAY_WEBHOOK_SECRET)
 * @returns {boolean} True if the signature is authentic and valid; otherwise false
 */
const verifyWebhookSignature = ({
  rawBody,
  signature,
  secret = getWebhookSecret(),
}) => {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);

    // Use official Razorpay SDK validation
    const isValid = Razorpay.validateWebhookSignature(bodyStr, signature, secret);
    return Boolean(isValid);
  } catch (err) {
    return false;
  }
};

/**
 * Cryptographically verifies the HMAC SHA-256 signature returned by Razorpay Checkout.
 * Uses timingSafeEqual comparison to protect against timing attacks.
 * Formula: HMAC_SHA256(order_id + "|" + payment_id, secret) === signature
 *
 * @param {Object} params
 * @param {string} params.orderId - Razorpay Order ID (e.g. 'order_...')
 * @param {string} params.paymentId - Razorpay Payment ID (e.g. 'pay_...')
 * @param {string} params.signature - Razorpay signature received in checkout response
 * @param {string} [params.secret] - Key secret (defaults to configured RAZORPAY_KEY_SECRET)
 * @returns {boolean} True if signature is authentic; false otherwise
 */
const verifyPaymentSignature = ({
  orderId,
  paymentId,
  signature,
  secret = getKeySecret(),
}) => {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const payload = `${String(orderId).trim()}|${String(paymentId).trim()}`;
    const expectedSignature = crypto
      .createHmac("sha256", String(secret).trim())
      .update(payload)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "utf8");
    const sigBuf = Buffer.from(String(signature).trim(), "utf8");

    if (expectedBuf.length !== sigBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    return false;
  }
};

/**
 * Fetches authorized or captured payment entity details from Razorpay by Payment ID.
 *
 * @param {string} paymentId - Razorpay Payment ID (e.g. 'pay_...')
 * @returns {Promise<Object>} Razorpay Payment entity
 */
const fetchPayment = async (paymentId) => {
  if (!paymentId || typeof paymentId !== "string" || !paymentId.trim()) {
    throw new Error("A valid Razorpay paymentId is required.");
  }

  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay test-mode credentials are not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment."
    );
  }

  const client = getRazorpayClient();
  return client.payments.fetch(paymentId.trim());
};

module.exports = {
  createOrder,
  verifyWebhookSignature,
  verifyPaymentSignature,
  fetchPayment,
};
