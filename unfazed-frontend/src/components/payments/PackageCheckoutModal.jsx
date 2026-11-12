import { useState, useEffect } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Input from "../common/Input";
import Alert from "../common/Alert";
import { formatPaiseToInr, openRazorpayCheckout } from "../../utils/razorpay";

export default function PackageCheckoutModal({
  isOpen,
  onClose,
  packageData,
  therapist,
  prefilledClient = null,
  isTherapistInitiated = false,
  onSuccess,
}) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Status flow: "idle" | "initiating" | "checkout_open" | "verifying" | "success" | "error"
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    if (prefilledClient) {
      setClientName(prefilledClient.name || "");
      setClientEmail(prefilledClient.email || "");
      setClientPhone(prefilledClient.phone || "");
    } else {
      setClientName("");
      setClientEmail("");
      setClientPhone("");
    }
    setStatus("idle");
    setErrorMessage("");
    setFieldErrors({});
  }, [isOpen, prefilledClient]);

  const validate = () => {
    const errors = {};
    if (!clientName.trim()) {
      errors.clientName = "Your full name is required.";
    }
    if (!clientEmail.trim()) {
      errors.clientEmail = "Email address is required.";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clientEmail.trim())) {
        errors.clientEmail = "Please enter a valid email address.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Synchronously verify payment signature with backend
  const verifyPaymentOnBackend = async (paymentId, razorpayResponse) => {
    setStatus("verifying");
    setErrorMessage("");

    try {
      const res = await axiosInstance.post("/payments/verify", {
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      });

      if (res.data?.success && res.data?.data) {
        const payment = res.data.data;
        if (payment.status === "captured") {
          setStatus("success");
          if (onSuccess) onSuccess(payment);
          return;
        }
      }

      throw new Error(res.data?.message || "Payment verification did not complete successfully.");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          "Payment verification failed. Please contact your therapist with your payment reference."
      );
    }
  };

  const handleProceedToCheckout = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!packageData) return;
    if (!validate()) return;

    try {
      setStatus("initiating");

      let orderRes;
      if (isTherapistInitiated && prefilledClient?._id) {
        orderRes = await axiosInstance.post(`/packages/${packageData._id}/purchase`, {
          clientId: prefilledClient._id,
        });
      } else {
        const slug = therapist?.slug || packageData.therapistSlug;
        orderRes = await axiosInstance.post(
          `/packages/public/${slug}/${packageData._id}/purchase`,
          {
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim().toLowerCase(),
            clientPhone: clientPhone.trim(),
          }
        );
      }

      const orderData = orderRes.data?.data;
      if (!orderData || !orderData.orderId || !orderData.key) {
        throw new Error(
          orderRes.data?.message ||
            "Unable to start checkout: payment order details or public key ID were not provided by server."
        );
      }

      setStatus("checkout_open");

      // Open Razorpay Checkout modal
      await openRazorpayCheckout({
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        orderId: orderData.orderId,
        name: therapist?.name || "Unfazed Practice",
        description: `${packageData.sessionCount}-Session Package: ${packageData.title}`,
        prefill: {
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
        },
        onSuccess: async (razorpayResponse) => {
          await verifyPaymentOnBackend(orderData.paymentId, razorpayResponse);
        },
        onDismiss: () => {
          setStatus("idle");
          setErrorMessage("Checkout window was closed. No payment was charged.");
        },
        onFailure: (err) => {
          setStatus("error");
          setErrorMessage(err.description || err.message || "Payment processing failed.");
        },
      });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err.response?.data?.message || err.message || "Unable to initiate payment checkout."
      );
    }
  };

  if (!isOpen || !packageData) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#E9DFD2] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EFE8DF] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-serif font-medium text-lg text-[#14261D]">
                {status === "success" ? "Purchase Successful!" : "Package Checkout"}
              </h3>
              <p className="text-xs text-[#6F7D74]">
                {status === "success"
                  ? "Session credits are activated and ready to redeem."
                  : "Razorpay Test-Mode Secure Checkout"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#FAF7F2] hover:bg-[#F0EAE2] text-[#637269] flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4">
            <Alert variant="error" message={errorMessage} onClose={() => setErrorMessage("")} />
          </div>
        )}

        {/* SUCCESS VIEW */}
        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-4 gap-5">
            <div className="w-14 h-14 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center shadow-xs">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h4 className="text-xl font-serif font-medium text-[#14261D]">
                Package Activated!
              </h4>
              <p className="text-xs text-[#526358] mt-1 max-w-sm">
                <strong>{packageData.sessionCount} session credits</strong> have been linked to{" "}
                <strong>{clientEmail}</strong> with {packageData.validityDays} days validity.
              </p>
            </div>

            <div className="w-full bg-[#FAF7F2] border border-[#E9DFD2] rounded-2xl p-4 text-xs text-left space-y-2">
              <div className="flex justify-between items-center border-b border-[#EAE2D6] pb-2">
                <span className="text-[#6F7D74]">Package Title:</span>
                <span className="font-medium text-[#1B3B2B]">{packageData.title}</span>
              </div>
              <div className="flex justify-between items-center border-b border-[#EAE2D6] pb-2">
                <span className="text-[#6F7D74]">Total Amount:</span>
                <span className="font-medium text-[#1B3B2B]">
                  {formatPaiseToInr(packageData.price)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6F7D74]">Payment Status:</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2A6543]"></span>
                  Verified & Captured
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#1B3B2B] text-white hover:bg-[#234E39] font-medium text-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : status === "verifying" ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <svg
              className="animate-spin h-8 w-8 text-[#1B3B2B]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              ></path>
            </svg>
            <p className="text-sm font-medium text-[#1B3B2B]">
              Verifying payment with practice ledger...
            </p>
            <p className="text-xs text-[#717E76]">
              Please do not close this window while the transaction is being recorded.
            </p>
          </div>
        ) : (
          /* FORM VIEW */
          <form onSubmit={handleProceedToCheckout} className="flex flex-col gap-4">
            {/* Package Summary Card */}
            <div className="bg-[#FAF7F2] border border-[#E9DFD2] rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1B3B2B]">
                    Selected Package
                  </span>
                  <h4 className="font-serif font-medium text-base text-[#14261D] mt-0.5">
                    {packageData.title}
                  </h4>
                  <p className="text-xs text-[#596A61] mt-0.5">
                    {packageData.sessionCount} Sessions · {packageData.durationMinutes} mins each ·{" "}
                    {packageData.validityDays} Days Validity
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-base sm:text-lg font-serif font-semibold text-[#1B3B2B]">
                    {formatPaiseToInr(packageData.price)}
                  </span>
                  {packageData.discountPercentage > 0 && (
                    <span className="block text-[10px] text-[#2E6B45] font-semibold">
                      {packageData.discountPercentage}% Savings
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Client Info Fields */}
            <Input
              label="Full Name"
              placeholder="e.g. Maya Sharma"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              error={fieldErrors.clientName}
              disabled={Boolean(prefilledClient?.name)}
              required
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="e.g. maya@example.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              error={fieldErrors.clientEmail}
              disabled={Boolean(prefilledClient?.email)}
              required
            />

            <Input
              label="Phone Number (Optional)"
              type="tel"
              placeholder="+91 98765 43210"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              disabled={Boolean(prefilledClient?.phone)}
            />

            <div className="p-3 bg-[#FCFAF7] border border-[#EDE5DA] rounded-xl text-[11px] text-[#697970] leading-relaxed">
              💡 <strong>Razorpay Test Mode:</strong> You can complete this checkout using any
              standard test credentials or UPI test flow. Credits are immediately verified against
              the backend ledger.
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#EFE8DF] mt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[#D9D1C5] text-xs font-medium text-[#55655B] hover:bg-[#F4EFEA] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <Button
                type="submit"
                variant="primary"
                isLoading={status === "initiating" || status === "checkout_open"}
                className="w-auto px-6 py-2.5 text-xs font-medium"
              >
                Pay {formatPaiseToInr(packageData.price)} →
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
