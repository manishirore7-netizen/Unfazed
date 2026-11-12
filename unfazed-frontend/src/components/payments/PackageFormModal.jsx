import { useState, useEffect } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Input from "../common/Input";
import Alert from "../common/Alert";
import { paiseToRupees, rupeesToPaise } from "../../utils/razorpay";

export default function PackageFormModal({
  isOpen,
  onClose,
  packageData = null,
  onSuccess,
}) {
  const isEditing = Boolean(packageData && packageData._id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionCount, setSessionCount] = useState(5);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [priceInRupees, setPriceInRupees] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [validityDays, setValidityDays] = useState(90);
  const [isActive, setIsActive] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    if (packageData) {
      setTitle(packageData.title || "");
      setDescription(packageData.description || "");
      setSessionCount(packageData.sessionCount || 5);
      setDurationMinutes(packageData.durationMinutes || 60);
      setPriceInRupees(
        packageData.price !== undefined ? paiseToRupees(packageData.price).toString() : ""
      );
      setDiscountPercentage(packageData.discountPercentage || 0);
      setValidityDays(packageData.validityDays || 90);
      setIsActive(packageData.isActive !== undefined ? packageData.isActive : true);
    } else {
      setTitle("");
      setDescription("");
      setSessionCount(5);
      setDurationMinutes(60);
      setPriceInRupees("");
      setDiscountPercentage(0);
      setValidityDays(90);
      setIsActive(true);
    }
    setErrorMessage("");
    setFieldErrors({});
  }, [isOpen, packageData]);

  const validate = () => {
    const errors = {};
    if (!title.trim()) {
      errors.title = "Package title is required.";
    }
    const count = parseInt(sessionCount, 10);
    if (isNaN(count) || count < 1 || count > 100) {
      errors.sessionCount = "Session count must be between 1 and 100.";
    }
    const priceNum = parseFloat(priceInRupees);
    if (isNaN(priceNum) || priceNum <= 0) {
      errors.price = "Please provide a valid price in Rupees (e.g. 5000).";
    }
    const disc = parseInt(discountPercentage, 10);
    if (isNaN(disc) || disc < 0 || disc > 100) {
      errors.discountPercentage = "Discount must be between 0% and 100%.";
    }
    const valDays = parseInt(validityDays, 10);
    if (isNaN(valDays) || valDays < 1 || valDays > 730) {
      errors.validityDays = "Validity must be between 1 and 730 days.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!validate()) return;

    try {
      setIsSubmitting(true);

      const payload = {
        title: title.trim(),
        description: description.trim(),
        sessionCount: parseInt(sessionCount, 10),
        durationMinutes: parseInt(durationMinutes, 10),
        price: rupeesToPaise(parseFloat(priceInRupees)),
        discountPercentage: parseInt(discountPercentage, 10) || 0,
        validityDays: parseInt(validityDays, 10) || 90,
        isActive: Boolean(isActive),
      };

      let response;
      if (isEditing) {
        response = await axiosInstance.put(`/packages/${packageData._id}`, payload);
      } else {
        response = await axiosInstance.post("/packages", payload);
      }

      if (response.data?.success) {
        if (onSuccess) {
          onSuccess(response.data.data, isEditing ? "updated" : "created");
        }
        onClose();
      } else {
        setErrorMessage(response.data?.message || "Operation failed.");
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          "An unexpected error occurred while saving the package."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#E9DFD2] rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EFE8DF] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-serif font-medium text-lg text-[#14261D]">
                {isEditing ? "Edit Session Package" : "Create New Session Package"}
              </h3>
              <p className="text-xs text-[#6F7D74]">
                {isEditing
                  ? "Update terms, pricing, or visibility for this package."
                  : "Bundle sessions together with custom validity and pricing."}
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Package Title"
            placeholder="e.g. 5-Session Anxiety & Stress Management Bundle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this package includes and who it is best suited for..."
              className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Number of Sessions"
              type="number"
              min="1"
              max="100"
              value={sessionCount}
              onChange={(e) => setSessionCount(e.target.value)}
              error={fieldErrors.sessionCount}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]">
                Duration Per Session
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 cursor-pointer"
              >
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes (Standard)</option>
                <option value={90}>90 Minutes (Extended)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Total Price (₹ INR)"
              type="number"
              step="any"
              min="1"
              placeholder="e.g. 7500"
              value={priceInRupees}
              onChange={(e) => setPriceInRupees(e.target.value)}
              error={fieldErrors.price}
              required
            />

            <Input
              label="Discount (% off standard rate)"
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 15"
              value={discountPercentage}
              onChange={(e) => setDiscountPercentage(e.target.value)}
              error={fieldErrors.discountPercentage}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <Input
              label="Validity (Days from Purchase)"
              type="number"
              min="1"
              max="730"
              placeholder="e.g. 90"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              error={fieldErrors.validityDays}
              required
            />

            <div className="flex flex-col gap-1.5 sm:pt-4">
              <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#1B3B2B] focus:ring-[#1B3B2B] border-[#DCD4C7]"
                />
                <span className="text-xs font-medium text-[#2C3B32]">
                  Active & Available for Purchase
                </span>
              </label>
              <span className="text-[10px] text-[#78877E]">
                Inactive packages cannot be purchased by clients.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EFE8DF] mt-2">
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
              isLoading={isSubmitting}
              className="w-auto px-6 py-2.5 text-xs font-medium"
            >
              {isEditing ? "Save Changes" : "Create Package"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
