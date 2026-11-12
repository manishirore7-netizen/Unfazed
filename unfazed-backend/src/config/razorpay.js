/**
 * Unfazed Razorpay Configuration
 * Safely initializes the Razorpay SDK instance in Test Mode.
 * Dynamically resolves credentials from environment variables.
 * Never exposes the Razorpay key secret.
 */

const Razorpay = require("razorpay");

/**
 * Returns raw credentials from current environment.
 */
const getCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";
  return { keyId, keySecret, webhookSecret };
};

/**
 * Identifies default placeholder tokens that are not genuine API credentials.
 */
const isPlaceholder = (val) =>
  !val ||
  val === "your_razorpay_test_key" ||
  val === "your_razorpay_test_secret" ||
  val === "your_razorpay_webhook_secret";

/**
 * Checks whether Razorpay credentials are fully configured with genuine test/live credentials.
 * @returns {boolean}
 */
const isRazorpayConfigured = () => {
  const { keyId, keySecret } = getCredentials();
  return Boolean(
    keyId &&
    keySecret &&
    !isPlaceholder(keyId) &&
    !isPlaceholder(keySecret)
  );
};

let cachedClient = null;
let cachedKeyId = null;
let cachedKeySecret = null;

/**
 * Returns the initialized Razorpay SDK instance.
 * Re-instantiates automatically if credentials change in process.env.
 * Throws a clear, actionable error if credentials are missing or placeholder.
 * @returns {Razorpay}
 */
const getRazorpayClient = () => {
  const { keyId, keySecret } = getCredentials();

  if (!isRazorpayConfigured()) {
    throw new Error(
      "Razorpay test-mode credentials are not configured. Please supply valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in unfazed-backend/.env."
    );
  }

  if (!cachedClient || cachedKeyId !== keyId || cachedKeySecret !== keySecret) {
    cachedClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    cachedKeyId = keyId;
    cachedKeySecret = keySecret;
  }

  return cachedClient;
};

/**
 * Returns the public Key ID (safe for frontend client-side checkout initiation).
 * Only returns genuine credentials; returns null if missing or placeholder.
 * Never exposes the key secret.
 * @returns {string|null}
 */
const getPublicKeyId = () => {
  const { keyId } = getCredentials();
  return isRazorpayConfigured() ? keyId : null;
};

/**
 * Returns the server-side Razorpay key secret for HMAC SHA-256 checkout signature verification.
 * Strictly used within backend verification only. Never exported to clients.
 * @returns {string|null}
 */
const getKeySecret = () => {
  const { keySecret } = getCredentials();
  return isRazorpayConfigured() ? keySecret : null;
};

/**
 * Returns the server-side webhook secret for HMAC SHA-256 signature verification.
 * @returns {string|null}
 */
const getWebhookSecret = () => {
  const { webhookSecret } = getCredentials();
  return webhookSecret && !isPlaceholder(webhookSecret) ? webhookSecret : null;
};

module.exports = {
  getRazorpayClient,
  isRazorpayConfigured,
  getPublicKeyId,
  getKeySecret,
  getWebhookSecret,
};
