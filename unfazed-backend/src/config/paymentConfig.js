/**
 * Unfazed Payment & Billing Configuration
 * Centralizes currency, minor-unit (paise) conversions, platform fees, taxes, and invoice numbering.
 */

const parseNumber = (val, fallback, min = 0, max = Infinity) => {
  if (val === undefined || val === null || val === "") return fallback;
  const num = Number(val);
  if (isNaN(num) || num < min || num > max) {
    throw new Error(
      `Invalid payment configuration: "${val}" must be a number between ${min} and ${max}`
    );
  }
  return num;
};

// Validate & load environment configuration
const CURRENCY = (process.env.CURRENCY || "INR").trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(CURRENCY)) {
  throw new Error(`Invalid currency code: "${CURRENCY}". Must be a 3-letter ISO code.`);
}

const PLATFORM_FEE_PERCENT = parseNumber(
  process.env.PLATFORM_FEE_PERCENT,
  10, // Default 10% platform fee
  0,
  100
);

const PLATFORM_FEE_FLAT_PAISE = parseNumber(
  process.env.PLATFORM_FEE_FLAT_PAISE,
  0, // Default 0 flat fee in paise
  0
);

const GST_PERCENT = parseNumber(
  process.env.GST_PERCENT,
  18, // Standard 18% GST in India
  0,
  100
);

const TAX_ENABLED = process.env.TAX_ENABLED !== "false";

const INVOICE_PREFIX = (process.env.INVOICE_PREFIX || "UNF").trim().toUpperCase();

/**
 * Converts standard currency units (e.g., INR Rupees) to minor units (Paise).
 * Razorpay expects all INR transaction amounts as whole integers in paise (₹1 = 100 paise).
 *
 * @param {number} rupees
 * @returns {number} Integer amount in paise
 */
const rupeesToPaise = (rupees) => {
  if (typeof rupees !== "number" || isNaN(rupees) || rupees < 0) {
    throw new Error("Rupee amount must be a non-negative number.");
  }
  return Math.round(rupees * 100);
};

/**
 * Converts minor currency units (Paise) to standard currency units (Rupees).
 *
 * @param {number} paise
 * @returns {number} Amount in rupees
 */
const paiseToRupees = (paise) => {
  if (typeof paise !== "number" || isNaN(paise) || paise < 0) {
    throw new Error("Paise amount must be a non-negative number.");
  }
  return Number((paise / 100).toFixed(2));
};

/**
 * Computes monetary breakdown for a gross transaction amount in paise:
 * 1. Platform Fee (percentage of gross + flat fee)
 * 2. Tax / GST on the platform fee
 * 3. Net amount payable to the therapist
 *
 * @param {Object} params
 * @param {number} params.amountInPaise - Gross transaction amount in paise
 * @param {number} [params.feePercent] - Optional fee override (0-100)
 * @param {number} [params.flatFeePaise] - Optional flat fee override in paise
 * @param {number} [params.taxPercent] - Optional tax override (0-100)
 * @returns {Object} Fee breakdown with all values in paise
 */
const calculatePaymentBreakdown = ({
  amountInPaise,
  feePercent = PLATFORM_FEE_PERCENT,
  flatFeePaise = PLATFORM_FEE_FLAT_PAISE,
  taxPercent = GST_PERCENT,
}) => {
  if (typeof amountInPaise !== "number" || isNaN(amountInPaise) || amountInPaise < 0) {
    throw new Error("amountInPaise must be a non-negative number.");
  }

  const roundedAmount = Math.round(amountInPaise);

  // Platform fee in paise
  const percentageFee = Math.round(roundedAmount * (feePercent / 100));
  const totalPlatformFee = Math.min(percentageFee + flatFeePaise, roundedAmount);

  // GST / Tax on platform fee
  const taxOnFee = TAX_ENABLED ? Math.round(totalPlatformFee * (taxPercent / 100)) : 0;

  // Net earnings allocated to therapist
  const totalDeductions = totalPlatformFee + taxOnFee;
  const netTherapistAmount = Math.max(0, roundedAmount - totalDeductions);

  return {
    grossAmount: roundedAmount,
    platformFee: totalPlatformFee,
    taxOnFee,
    netTherapistAmount,
    currency: CURRENCY,
  };
};

/**
 * Formats a standardized invoice reference number.
 * Example: UNF-202611-000142
 *
 * @param {number|string} sequence - Unique incremental or random sequence
 * @param {Date} [date] - Invoice date (defaults to now)
 * @returns {string} Formatted invoice number
 */
const generateInvoiceNumber = (sequence, date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const paddedSeq = String(sequence).padStart(6, "0");
  return `${INVOICE_PREFIX}-${yyyy}${mm}-${paddedSeq}`;
};

module.exports = {
  CURRENCY,
  PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_FLAT_PAISE,
  GST_PERCENT,
  TAX_ENABLED,
  INVOICE_PREFIX,
  rupeesToPaise,
  paiseToRupees,
  calculatePaymentBreakdown,
  generateInvoiceNumber,
};
