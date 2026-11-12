import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import axiosInstance from "../../api/axiosInstance";

export default function UpgradeModal({
  isOpen,
  onClose,
  onUpgraded,
  title = "Upgrade Your Subscription Plan",
  message = "This feature requires an upgraded subscription tier.",
  currentTier = "starter",
  requiredTier = "pro",
}) {
  const [upgradingTo, setUpgradingTo] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setSuccessMsg("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectTier = async (targetTier) => {
    if (targetTier === currentTier) return;
    setUpgradingTo(targetTier);
    setError("");

    try {
      const res = await axiosInstance.post("/subscriptions/tier", {
        tier: targetTier,
      });

      if (res.data?.success) {
        setSuccessMsg(res.data.message || `Upgraded to ${targetTier} plan!`);
        setTimeout(() => {
          if (onUpgraded) onUpgraded(res.data.data);
          onClose();
        }, 800);
      }
    } catch (err) {
      console.error("Error upgrading tier:", err);
      setError(err.response?.data?.message || "Failed to switch plan. Please try again.");
    } finally {
      setUpgradingTo(null);
    }
  };

  const tierCards = [
    {
      id: "starter",
      name: "Starter",
      badge: "Starter Plan",
      price: "Free",
      period: "forever",
      description: "Solo practitioners starting out",
      features: [
        "Up to 5 active clients",
        "Basic freeform notes",
        "7-day analytics overview",
        "Client portal & real-time chat",
      ],
    },
    {
      id: "pro",
      name: "Professional",
      badge: "Most Popular",
      price: "₹1,499",
      period: "per month",
      isPopular: true,
      description: "Growing practices needing structured documentation",
      features: [
        "Up to 25 active clients",
        "SOAP & DAP structured notes",
        "30-day analytics & revenue trend",
        "Client portal & real-time chat",
        "Priority notifications",
      ],
    },
    {
      id: "premium",
      name: "Premium",
      badge: "Unlimited Practice",
      price: "₹3,999",
      period: "per month",
      description: "Established practices needing complete clinical freedom",
      features: [
        "Unlimited active clients",
        "All note templates (SOAP, DAP, BIRP, GIRP)",
        "1-year deep analytics & CSV exports",
        "Client portal & real-time chat",
        "Advanced attendance & no-show tracking",
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-xl border border-[#E9DFD2] flex flex-col gap-6 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EAE2D6] pb-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF8E6] text-[#8C6D1F] border border-[#F2E3B3]">
              <svg className="w-3.5 h-3.5 text-[#C49B28]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Feature Upgrade Required
            </span>
            <h2 className="text-xl font-bold text-[#14261D] font-serif">{title}</h2>
            <p className="text-xs text-[#55635B] leading-relaxed max-w-xl">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#87968D] hover:text-[#1B3B2B] p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl text-xs bg-rose-50 border border-rose-200 text-rose-800">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
            ✓ {successMsg}
          </div>
        )}

        {/* Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tierCards.map((tier) => {
            const isCurrent = currentTier === tier.id;
            const isTarget = requiredTier === tier.id;
            const isUpgrading = upgradingTo === tier.id;

            return (
              <div
                key={tier.id}
                className={`rounded-2xl p-5 border flex flex-col justify-between transition-all relative ${
                  isCurrent
                    ? "border-[#1B3B2B] bg-[#FAF8F5] ring-2 ring-[#1B3B2B]/20"
                    : isTarget
                    ? "border-[#2A6543] bg-[#FCFDFB] shadow-md"
                    : "border-[#E4DDD3] bg-white hover:border-[#C4B7A5]"
                }`}
              >
                {tier.isPopular && (
                  <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1B3B2B] text-white uppercase tracking-wider shadow-2xs">
                    Recommended
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-[#14261D]">{tier.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] px-2 py-0.5 rounded-md border border-[#CDE3D5]">
                        Current Plan
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <span className="text-2xl font-extrabold text-[#14261D]">{tier.price}</span>
                    <span className="text-[11px] text-[#717E76] ml-1">/{tier.period}</span>
                  </div>

                  <p className="text-[11px] text-[#697970] mb-4 leading-normal">{tier.description}</p>

                  <ul className="space-y-2 text-[11px] text-[#334239] mb-6">
                    {tier.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <svg
                          className="w-3.5 h-3.5 text-[#2A6543] shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={isCurrent || isUpgrading || Boolean(upgradingTo)}
                  onClick={() => handleSelectTier(tier.id)}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isCurrent
                      ? "bg-[#EFEAE2] text-[#76847C] cursor-not-allowed"
                      : isTarget
                      ? "bg-[#1B3B2B] hover:bg-[#132A1F] text-white shadow-xs"
                      : "bg-[#EBF3ED] hover:bg-[#DEEDE2] text-[#1B3B2B] border border-[#CDE3D5]"
                  }`}
                >
                  {isCurrent
                    ? "Active Plan"
                    : isUpgrading
                    ? "Upgrading..."
                    : `Switch to ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-2 text-center text-[11px] text-[#86958C]">
          Demo Environment: Plan switching updates entitlement limits immediately. No payment required.
        </div>
      </div>
    </div>
  );
}

UpgradeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUpgraded: PropTypes.func,
  title: PropTypes.string,
  message: PropTypes.string,
  currentTier: PropTypes.string,
  requiredTier: PropTypes.string,
};
