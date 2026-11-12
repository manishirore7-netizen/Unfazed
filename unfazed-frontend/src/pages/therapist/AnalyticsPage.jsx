import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Alert from "../../components/common/Alert";
import UpgradeModal from "../../components/subscription/UpgradeModal";
import { formatPaiseToInr } from "../../utils/razorpay";

const RANGE_OPTIONS = [
  { label: "7 Days", value: "7d", minTier: "starter" },
  { label: "30 Days", value: "30d", minTier: "pro" },
  { label: "90 Days", value: "90d", minTier: "pro" },
  { label: "1 Year", value: "1y", minTier: "premium" },
];

export default function AnalyticsPage() {
  const { therapist, logout } = useAuth();

  const [selectedRange, setSelectedRange] = useState("7d");
  const [analyticsData, setAnalyticsData] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTriggerReason, setUpgradeTriggerReason] = useState("");
  const [upgradeRequiredTier, setUpgradeRequiredTier] = useState("pro");

  const fetchAnalytics = async (range) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await axiosInstance.get(`/analytics?range=${range}`);
      if (res.data?.success && res.data?.data) {
        setAnalyticsData(res.data.data);
        if (res.data.data.entitlements) {
          setEntitlements(res.data.data.entitlements);
        }
      }
    } catch (err) {
      console.error("Failed to load practice analytics:", err);
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to load practice analytics."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(selectedRange);
  }, [selectedRange]);

  const handleRangeSelect = (option) => {
    const currentTier = entitlements?.tier || "starter";
    if (option.minTier === "pro" && currentTier === "starter") {
      setUpgradeTriggerReason(
        `Analytics beyond 7 days require a Professional or Premium plan. Upgrade to unlock ${option.label} trends.`
      );
      setUpgradeRequiredTier("pro");
      setIsUpgradeModalOpen(true);
      return;
    }
    if (option.minTier === "premium" && (currentTier === "starter" || currentTier === "pro")) {
      setUpgradeTriggerReason(
        `Annual longitudinal analytics require a Premium plan. Upgrade to view full-year insights.`
      );
      setUpgradeRequiredTier("premium");
      setIsUpgradeModalOpen(true);
      return;
    }
    setSelectedRange(option.value);
  };

  const handleSubscriptionUpgraded = () => {
    fetchAnalytics(selectedRange);
  };

  // Process data for charts
  const revenueChartData = useMemo(() => {
    if (!analyticsData?.revenue?.trend) return [];
    return analyticsData.revenue.trend.map((item) => ({
      date: item.date.slice(5), // "MM-DD"
      netINR: Math.round(item.netEarningsPaise / 100),
      grossINR: Math.round(item.grossPaise / 100),
      count: item.transactionsCount,
    }));
  }, [analyticsData]);

  const appointmentsChartData = useMemo(() => {
    if (!analyticsData?.appointments?.summary) return [];
    const s = analyticsData.appointments.summary;
    return [
      { name: "Completed", count: s.completed, fill: "#1B3B2B" },
      { name: "Confirmed", count: s.confirmed, fill: "#3B82F6" },
      { name: "Cancelled", count: s.cancelled, fill: "#9CA3AF" },
      { name: "No-Show", count: s.no_show, fill: "#EF4444" },
    ];
  }, [analyticsData]);

  const currentTier = entitlements?.tier || "starter";
  const activeCap = entitlements?.activeClients?.cap;
  const activeCount = analyticsData?.clients?.activeCount || 0;
  const isCapReached = Boolean(activeCap !== null && activeCount >= activeCap);
  const capPercent = activeCap ? Math.min(100, Math.round((activeCount / activeCap) * 100)) : 0;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#1B3B2B]">
                Unfazed
              </span>
              <span className="text-[10px] text-[#717E76] block -mt-0.5">
                Practice Workspace
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="text-right hidden md:block mr-2">
              <span className="text-xs font-medium block text-[#1B3B2B]">
                {therapist?.name}
              </span>
              <span className="text-[11px] text-[#717E76] block">
                {therapist?.email}
              </span>
            </div>

            <Link
              to="/schedule"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Schedule</span>
            </Link>

            <Link
              to="/clients"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Clients</span>
            </Link>

            <Link
              to="/packages"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Packages</span>
            </Link>

            <Link
              to="/payments"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Payments</span>
            </Link>

            <Link
              to="/analytics"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#1B3B2B] px-3 py-1.5 rounded-lg shadow-2xs"
            >
              <span>Analytics</span>
            </Link>

            <Link
              to="/profile"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3B2B] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Profile</span>
            </Link>

            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-[#8F2D2D] hover:bg-[#FBEBEB] border border-[#F2D0D0] px-3 py-1.5 rounded-lg transition-colors cursor-pointer ml-1"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full p-6 sm:p-8 flex-1 flex flex-col gap-6">
        {/* Title Bar & Range Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE2D6]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-serif text-[#14261D]">
                Practice Analytics & Entitlements
              </h1>
              <span className="text-[11px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5] px-2.5 py-0.5 rounded-full">
                {entitlements?.tierName || "Starter"} Tier
              </span>
            </div>
            <p className="text-xs text-[#637269] mt-1">
              Real-time insights across practice revenue, client retention, and attendance.
            </p>
          </div>

          {/* Time Range Pills */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E2D8CA] shadow-2xs self-start sm:self-auto">
            {RANGE_OPTIONS.map((opt) => {
              const isSelected = selectedRange === opt.value;
              const isLocked =
                (opt.minTier === "pro" && currentTier === "starter") ||
                (opt.minTier === "premium" && (currentTier === "starter" || currentTier === "pro"));

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRangeSelect(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#1B3B2B] text-white shadow-xs"
                      : "text-[#55635B] hover:text-[#1B3B2B] hover:bg-[#FAF8F5]"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isLocked && (
                    <svg className="w-3 h-3 text-[#B08920]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <Alert type="error" message={errorMessage} onClose={() => setErrorMessage("")} />
        )}

        {/* Clamped range upgrade banner */}
        {analyticsData?.restrictionNotice && (
          <div className="p-4 rounded-xl bg-[#FFF8E6] border border-[#F2E3B3] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FCE8B2] text-[#8C6D1F] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs text-[#8C6D1F]">
                {analyticsData.restrictionNotice.message} Data is currently clamped to your plan&apos;s {analyticsData.restrictionNotice.maxAllowedDays}-day window.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUpgradeTriggerReason(analyticsData.restrictionNotice.message);
                setUpgradeRequiredTier(analyticsData.restrictionNotice.requiredTier);
                setIsUpgradeModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#8C6D1F] hover:bg-[#735817] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
            >
              Upgrade Plan
            </button>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Net Revenue */}
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#717E76]">
              Net Practice Revenue
            </span>
            <div className="my-2">
              <span className="text-2xl font-extrabold text-[#14261D] font-serif">
                {formatPaiseToInr(analyticsData?.revenue?.summary?.netEarningsPaise || 0)}
              </span>
            </div>
            <div className="text-[11px] text-[#697970] flex items-center justify-between border-t border-[#F0EAE1] pt-2">
              <span>{analyticsData?.revenue?.summary?.transactionsCount || 0} Transactions</span>
              <span>Gross: {formatPaiseToInr(analyticsData?.revenue?.summary?.grossPaise || 0)}</span>
            </div>
          </div>

          {/* 2. Active Clients */}
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#717E76]">
                Active Clients
              </span>
              {isCapReached && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Cap Reached
                </span>
              )}
            </div>
            <div className="my-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-[#14261D] font-serif">
                {activeCount}
              </span>
              <span className="text-xs text-[#717E76]">
                / {activeCap === null ? "∞ Unlimited" : `${activeCap} Max`}
              </span>
            </div>
            <div className="border-t border-[#F0EAE1] pt-2">
              {activeCap !== null ? (
                <div className="w-full bg-[#EAE2D6] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCapReached ? "bg-amber-600" : "bg-[#1B3B2B]"
                    }`}
                    style={{ width: `${capPercent}%` }}
                  />
                </div>
              ) : (
                <span className="text-[11px] text-emerald-700 font-medium">
                  ✓ Unlimited practice capacity
                </span>
              )}
            </div>
          </div>

          {/* 3. No-Show Rate */}
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#717E76]">
              No-Show Rate
            </span>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#14261D] font-serif">
                {analyticsData?.appointments?.noShowRatePercentage || 0}%
              </span>
              <span className="text-[11px] font-medium text-emerald-700">
                {analyticsData?.appointments?.attendanceRatePercentage || 100}% Attended
              </span>
            </div>
            <div className="text-[11px] text-[#697970] border-t border-[#F0EAE1] pt-2 flex items-center justify-between">
              <span>{analyticsData?.appointments?.summary?.no_show || 0} No-Shows</span>
              <span>{analyticsData?.appointments?.summary?.completed || 0} Attended</span>
            </div>
          </div>

          {/* 4. Appointments Total */}
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#717E76]">
              Total Bookings In Window
            </span>
            <div className="my-2">
              <span className="text-2xl font-extrabold text-[#14261D] font-serif">
                {analyticsData?.appointments?.summary?.total || 0}
              </span>
            </div>
            <div className="text-[11px] text-[#697970] border-t border-[#F0EAE1] pt-2 flex items-center justify-between">
              <span>{analyticsData?.appointments?.summary?.confirmed || 0} Confirmed</span>
              <span>{analyticsData?.appointments?.summary?.cancelled || 0} Cancelled</span>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Trend Area Chart */}
          <div className="lg:col-span-2 bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                  Revenue Trajectory (₹ INR)
                </h3>
                <span className="text-[11px] text-[#85948B]">
                  Daily net practice earnings from captured transactions
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-xs text-[#85948B]">
                  Loading revenue trend...
                </div>
              ) : revenueChartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-[#FAF8F5] text-[#86958C] flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-[#14261D]">No captured revenue in this window</p>
                  <p className="text-[11px] text-[#717E76]">Payments from sessions or packages will appear here.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1B3B2B" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#1B3B2B" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" />
                    <XAxis dataKey="date" stroke="#9EA9A2" fontSize={11} />
                    <YAxis stroke="#9EA9A2" fontSize={11} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip
                      formatter={(value) => [`₹${value.toLocaleString()}`, "Net Revenue"]}
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E4DDD3",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netINR"
                      stroke="#1B3B2B"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Appointment Status Breakdown */}
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#EAE2D6] pb-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#637269]">
                  Appointment Attendance
                </h3>
                <span className="text-[11px] text-[#85948B]">Session outcome breakdown</span>
              </div>
            </div>

            <div className="h-64 w-full">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-xs text-[#85948B]">
                  Loading attendance...
                </div>
              ) : appointmentsChartData.every((d) => d.count === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-[#717E76]">
                  No appointment data in this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appointmentsChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" />
                    <XAxis dataKey="name" stroke="#9EA9A2" fontSize={10} />
                    <YAxis stroke="#9EA9A2" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E4DDD3",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {appointmentsChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Subscription Tier & Feature Entitlements Card */}
        <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE2D6] pb-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#717E76] block">
                Current Subscription
              </span>
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-lg font-bold text-[#14261D] font-serif">
                  {entitlements?.tierName || "Starter"} Tier
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Active
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setUpgradeTriggerReason("Manage your practice subscription plan and entitlement limits.");
                setUpgradeRequiredTier(currentTier === "starter" ? "pro" : "premium");
                setIsUpgradeModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#1B3B2B] hover:bg-[#132A1F] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
            >
              {currentTier === "premium" ? "Switch Demo Plan" : "Upgrade Practice Plan"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Active Clients Limit */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE2D6]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#637269] block mb-1">
                Active Client Capacity
              </span>
              <p className="text-sm font-bold text-[#14261D]">
                {activeCap === null ? "Unlimited Clients" : `${activeCap} Maximum Active Clients`}
              </p>
              <p className="text-[11px] text-[#717E76] mt-1">
                Currently tracking {activeCount} active clients ({activeCap ? activeCap - activeCount : "∞"} remaining).
              </p>
            </div>

            {/* Note Templates */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE2D6]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#637269] block mb-1">
                Clinical Note Templates
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {entitlements?.noteTemplates?.allowed?.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5] uppercase"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#717E76] mt-2">
                {currentTier === "premium"
                  ? "All structured psychiatric & clinical templates unlocked."
                  : currentTier === "pro"
                  ? "SOAP & DAP templates unlocked. BIRP requires Premium."
                  : "Basic freeform notes. Structured templates require Pro."}
              </p>
            </div>

            {/* Analytics Scope */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE2D6]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#637269] block mb-1">
                Analytics Horizon
              </span>
              <p className="text-sm font-bold text-[#14261D]">
                Up to {entitlements?.analytics?.maxDays || 7} Days Historical Data
              </p>
              <p className="text-[11px] text-[#717E76] mt-1">
                {entitlements?.analytics?.allowExport
                  ? "Export enabled. Longitudinal trends active."
                  : "Basic overview. 30-day+ trends require Pro/Premium."}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onUpgraded={handleSubscriptionUpgraded}
        title="Upgrade Your Practice Plan"
        message={upgradeTriggerReason}
        currentTier={currentTier}
        requiredTier={upgradeRequiredTier}
      />
    </div>
  );
}
