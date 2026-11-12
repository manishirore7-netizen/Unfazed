/**
 * Unfazed Razorpay Checkout & Monetary Formatting Utilities
 * Safely loads the Razorpay checkout script and provides UI currency formatters.
 * Never exposes or handles Razorpay secret keys.
 */

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Dynamically loads the official Razorpay Checkout SDK script if not already loaded.
 * @returns {Promise<boolean>} True if script loaded successfully; otherwise false
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      return resolve(true);
    }

    // Check if script tag is already in DOM
    const existingScript = document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Formats monetary amounts in paise (minor units) to Indian Rupee (₹) format.
 * @param {number} amountInPaise
 * @param {boolean} [showDecimals=true]
 * @returns {string} e.g. "₹1,500.00" or "₹0.00"
 */
export const formatPaiseToInr = (amountInPaise, showDecimals = true) => {
  if (typeof amountInPaise !== "number" || isNaN(amountInPaise)) {
    return "₹0.00";
  }
  const rupees = amountInPaise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(rupees);
};

/**
 * Converts integer paise to numerical rupees.
 * @param {number} amountInPaise
 * @returns {number}
 */
export const paiseToRupees = (amountInPaise) => {
  if (typeof amountInPaise !== "number" || isNaN(amountInPaise)) return 0;
  return Math.round(amountInPaise) / 100;
};

/**
 * Converts numerical rupees to integer paise.
 * @param {number} rupees
 * @returns {number}
 */
export const rupeesToPaise = (rupees) => {
  if (typeof rupees !== "number" || isNaN(rupees)) return 0;
  return Math.round(rupees * 100);
};

/**
 * Opens the Razorpay Checkout Modal in test mode.
 *
 * @param {Object} options
 * @param {string} options.key - Razorpay public key ID
 * @param {number} options.amount - Order amount in paise
 * @param {string} options.currency - e.g. "INR"
 * @param {string} options.orderId - Razorpay order ID from backend
 * @param {string} options.name - Practice or Doctor name
 * @param {string} options.description - Purchase description
 * @param {Object} options.prefill - { name, email, phone }
 * @param {Function} options.onSuccess - Callback on payment success
 * @param {Function} options.onDismiss - Callback on modal close/dismissal
 * @param {Function} options.onFailure - Callback on payment failure
 */
export const openRazorpayCheckout = async ({
  key,
  amount,
  currency = "INR",
  orderId,
  name = "Unfazed Practice",
  description = "Therapy Service",
  prefill = {},
  onSuccess,
  onDismiss,
  onFailure,
}) => {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded) {
    if (onFailure) {
      onFailure(new Error("Unable to load payment gateway SDK. Please check your network connection."));
    }
    return;
  }

  if (!key || key === "rzp_test_placeholder" || key === "your_razorpay_test_key") {
    if (onFailure) {
      onFailure(
        new Error(
          "Payment gateway Key ID is missing or invalid. Please ensure RAZORPAY_KEY_ID is configured in the backend environment."
        )
      );
    }
    return;
  }

  if (!orderId || orderId.startsWith("order_mock_")) {
    if (onFailure) {
      onFailure(
        new Error(
          "Invalid payment order ID. A genuine Razorpay test order must be created by the backend."
        )
      );
    }
    return;
  }

  const razorpayOptions = {
    key,
    amount,
    currency,
    name,
    description,
    order_id: orderId,
    prefill: {
      name: prefill.name || "",
      email: prefill.email || "",
      contact: prefill.phone || "",
    },
    theme: {
      color: "#1B3B2B", // Unfazed forest green
    },
    modal: {
      ondismiss: () => {
        if (onDismiss) onDismiss();
      },
    },
    handler: (response) => {
      if (onSuccess) onSuccess(response);
    },
  };

  const rzp = new window.Razorpay(razorpayOptions);

  if (onFailure) {
    rzp.on("payment.failed", (response) => {
      onFailure(response.error || new Error("Payment transaction was declined or failed."));
    });
  }

  rzp.open();
};
