import { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Input from "../common/Input";
import Alert from "../common/Alert";
import {
  getTodayDateString,
  formatUtcDate,
  formatUtcTimeRange,
  formatTime12h,
  formatFriendlyDate,
  addDaysToDate,
  createGoogleCalendarUrl,
} from "../../utils/dateHelpers";

const COMMON_CLIENT_TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST, UTC+5:30)" },
  { value: "America/New_York", label: "Eastern Time (EST/EDT, UTC-5/-4)" },
  { value: "America/Chicago", label: "Central Time (CST/CDT, UTC-6/-5)" },
  { value: "America/Denver", label: "Mountain Time (MST/MDT, UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PST/PDT, UTC-8/-7)" },
  { value: "Europe/London", label: "UK / GMT (UTC+0/+1)" },
  { value: "Europe/Berlin", label: "Central European (CET/CEST, UTC+1/+2)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Singapore / Hong Kong (UTC+8)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST, UTC+9)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AEST/AEDT, UTC+10/+11)" },
];

export default function BookingModal({ therapist, isOpen, onClose }) {
  const therapistSlug = therapist?.slug;

  // 1. Detect browser timezone
  const defaultClientTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    } catch {
      return "Asia/Kolkata";
    }
  }, []);

  const [clientTimezone, setClientTimezone] = useState(defaultClientTz);
  const [therapistTimezone, setTherapistTimezone] = useState("Asia/Kolkata");
  const [allowedDurations, setAllowedDurations] = useState([30, 45, 60, 90]);
  const [selectedDuration, setSelectedDuration] = useState(60);

  // Today in client timezone
  const todayStr = useMemo(() => getTodayDateString(clientTimezone), [clientTimezone]);
  const maxBookingDateStr = useMemo(() => addDaysToDate(todayStr, 60), [todayStr]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Wizard Step: "select" | "details" | "confirmed"
  const [step, setStep] = useState("select");

  // Client Details Form
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // User Action Handlers that trigger slot reload
  const handleDurationChange = (dur) => {
    setSelectedDuration(dur);
    setSelectedSlot(null);
    setSlotsError("");
    setIsLoadingSlots(true);
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setSelectedSlot(null);
    setSlotsError("");
    setIsLoadingSlots(true);
  };

  const handleTimezoneChange = (newTz) => {
    setClientTimezone(newTz);
    const newToday = getTodayDateString(newTz);
    setSelectedDate((prev) => (prev < newToday ? newToday : prev));
    setSelectedSlot(null);
    setSlotsError("");
    setIsLoadingSlots(true);
  };

  // 2. Fetch Available Slots for given Date, Duration & Timezone
  useEffect(() => {
    let isMounted = true;
    if (!isOpen) {
      return;
    }

    if (!therapistSlug || !selectedDate) {
      Promise.resolve().then(() => {
        if (!isMounted) return;
        setIsLoadingSlots(false);
        setSlots([]);
        setSlotsError(
          !therapistSlug
            ? "Therapist information is required to load availability."
            : "Please select a valid calendar date to view available time slots."
        );
      });
      return;
    }

    axiosInstance
      .get(`/scheduling/public/${therapistSlug}/slots`, {
        params: {
          date: selectedDate,
          duration: selectedDuration,
          timezone: clientTimezone,
        },
      })
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && res.data?.data) {
          const data = res.data.data;
          setSlots(Array.isArray(data.slots) ? data.slots : []);
          if (data.therapist?.timezone) {
            setTherapistTimezone(data.therapist.timezone);
          }
        } else {
          setSlots([]);
          setSlotsError("Unexpected response format received from scheduling service.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const errorMsg =
          err.response?.data?.message || err.message || "Failed to load time slots.";

        // Handle case where duration is not offered by therapist
        if (err.response?.status === 400 && errorMsg.includes("Allowed:")) {
          const match = errorMsg.match(/Allowed:\s*([0-9,\s]+)\s*minutes/i);
          if (match && match[1]) {
            const parsedAllowed = match[1]
              .split(",")
              .map((d) => parseInt(d.trim(), 10))
              .filter(Boolean);
            if (parsedAllowed.length > 0) {
              setAllowedDurations(parsedAllowed);
              if (!parsedAllowed.includes(selectedDuration)) {
                setSelectedDuration(parsedAllowed[0]);
                return;
              }
            }
          }
        }

        setSlots([]);
        setSlotsError(errorMsg);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSlots(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, therapistSlug, selectedDate, selectedDuration, clientTimezone, refreshKey]);

  // Quick Date Chips (Today, Tomorrow, and next 5 days)
  const quickDates = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dStr = addDaysToDate(todayStr, i);
      let label = "";
      if (i === 0) label = "Today";
      else if (i === 1) label = "Tomorrow";
      else {
        try {
          const [y, m, d] = dStr.split("-").map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
          label = new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            weekday: "short",
            month: "short",
            day: "numeric",
          }).format(dt);
        } catch {
          label = dStr;
        }
      }
      days.push({ date: dStr, label });
    }
    return days;
  }, [todayStr]);

  // 3. Validation for Step 2
  const validateForm = () => {
    const errors = {};
    if (!clientName.trim()) {
      errors.clientName = "Your full name is required.";
    }
    if (!clientEmail.trim()) {
      errors.clientEmail = "Your email address is required.";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clientEmail.trim())) {
        errors.clientEmail = "Please enter a valid email address.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 4. Submit Booking
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!selectedSlot) {
      setSubmitError("Please go back and select an available time slot.");
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim().toLowerCase(),
        clientPhone: clientPhone.trim(),
        clientNotes: clientNotes.trim(),
        startTime: selectedSlot.startTime,
        duration: selectedDuration,
      };

      const res = await axiosInstance.post(
        `/scheduling/public/${therapist.slug}/book`,
        payload
      );

      if (res.data?.success && res.data?.data) {
        setConfirmedBooking(res.data.data);
        setStep("confirmed");
      } else {
        setSubmitError(
          res.data?.message || "Unexpected response format received while confirming booking."
        );
      }
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.message ||
        err.message ||
        "An unexpected error occurred while confirming your booking.";

      if (status === 409) {
        // Slot conflict (already booked or blocked)
        setSubmitError(
          message ||
            "This time slot was just booked by another client. Please choose another time."
        );
        setSelectedSlot(null);
        setIsLoadingSlots(true);
        // Refresh slots in background so the taken slot disappears
        setRefreshKey((k) => k + 1);
      } else {
        setSubmitError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset modal state upon closing
  const handleClose = () => {
    setStep("select");
    setSelectedSlot(null);
    setSubmitError("");
    setConfirmedBooking(null);
    setIsLoadingSlots(true);
    onClose();
  };

  if (!isOpen || !therapist) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-[#E9DFD2] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-6 right-6 text-[#717E76] hover:text-[#1B3B2B] p-2 rounded-xl hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          aria-label="Close booking modal"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 border-b border-[#EFE8DF] pb-5 mb-6 pr-10">
          <div className="w-10 h-10 rounded-xl bg-[#1B3B2B] text-[#FAF7F2] flex items-center justify-center font-serif font-bold text-base shadow-sm">
            {therapist.name?.charAt(0) || "U"}
          </div>
          <div>
            <h3 className="font-serif font-medium text-xl text-[#14261D] leading-tight">
              Schedule a Session
            </h3>
            <p className="text-xs text-[#5D6D63] mt-0.5">
              with <span className="font-medium text-[#1B3B2B]">{therapist.name}</span>
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* STEP 1: DATE, DURATION & TIME SLOT SELECTION                */}
        {/* ============================================================ */}
        {step === "select" && (
          <div className="flex flex-col gap-6">
            {/* A. Session Duration Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#3E4A43]">
                1. Select Session Duration
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[30, 45, 60, 90]
                  .filter((dur) => allowedDurations.includes(dur))
                  .map((dur) => {
                    const isSelected = selectedDuration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => handleDurationChange(dur)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#1B3B2B] border-[#1B3B2B] text-white shadow-sm"
                            : "bg-[#FCFAF7] border-[#DCD4C7] text-[#334239] hover:bg-[#F3EFEA]"
                        }`}
                      >
                        {dur} Minutes
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* B. Date Selection & Client Timezone */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#3E4A43]">
                  2. Choose an Available Date
                </label>

                {/* Timezone Selector Dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-[#5A6960]">
                  <svg className="w-3.5 h-3.5 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <select
                    value={clientTimezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] text-[11px] rounded-lg px-2 py-1 focus:border-[#1B3B2B] focus:outline-none cursor-pointer max-w-[200px] truncate"
                    title="Change viewing timezone"
                  >
                    {COMMON_CLIENT_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                    {!COMMON_CLIENT_TIMEZONES.some((tz) => tz.value === clientTimezone) && (
                      <option value={clientTimezone}>{clientTimezone} (Local)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Quick Date Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {quickDates.map((item) => {
                  const isSelected = selectedDate === item.date;
                  return (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => handleDateChange(item.date)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border cursor-pointer ${
                        isSelected
                          ? "bg-[#1B3B2B] text-white border-[#1B3B2B] shadow-xs"
                          : "bg-white border-[#DCD4C7] text-[#334239] hover:bg-[#F3EFEA]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}

                {/* Native Date Picker for dates further in the future */}
                <div className="relative shrink-0">
                  <input
                    type="date"
                    min={todayStr}
                    max={maxBookingDateStr}
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) handleDateChange(e.target.value);
                    }}
                    className="px-3 py-1.5 text-xs rounded-xl bg-white border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:outline-none cursor-pointer"
                    title="Choose specific date"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#6E7B74] px-1">
                <span>Selected: <strong>{formatFriendlyDate(selectedDate)}</strong></span>
                {clientTimezone !== therapistTimezone && (
                  <span className="italic">
                    Practice Timezone: {therapistTimezone}
                  </span>
                )}
              </div>
            </div>

            {/* C. Available Time Slots Grid */}
            <div className="flex flex-col gap-2 pt-1 border-t border-[#EFE8DF]">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#3E4A43]">
                3. Select Time Slot
              </label>

              {slotsError && (
                <Alert type="error" message={slotsError} onClose={() => setSlotsError("")} />
              )}

              {isLoadingSlots ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-11 bg-[#FAF7F2] rounded-xl animate-pulse border border-[#EBE3D7]"
                    ></div>
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="bg-[#FAF7F2] border border-[#E9DFD2] rounded-2xl p-6 text-center my-2">
                  <div className="w-10 h-10 rounded-full bg-[#EFE8DF] text-[#6E7D73] flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="font-serif font-medium text-sm text-[#14261D] mb-1">
                    No Available Sessions on this Date
                  </h4>
                  <p className="text-xs text-[#5D6D63] max-w-sm mx-auto">
                    {therapist.name} has no open {selectedDuration}-minute slots on{" "}
                    {formatFriendlyDate(selectedDate)}. Please choose another date or duration above.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                          isSelected
                            ? "bg-[#EBF3ED] border-[#1B3B2B] text-[#1B3B2B] ring-2 ring-[#1B3B2B]/20 shadow-xs"
                            : "bg-[#FCFAF7] border-[#DCD4C7] text-[#24332B] hover:border-[#1B3B2B]/50 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs sm:text-sm">
                            {formatTime12h(slot.clientStartTime)}
                          </span>
                          {isSelected && (
                            <svg className="w-4 h-4 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-[10px] text-[#6E7B74]">
                          until {formatTime12h(slot.clientEndTime)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* D. Bottom Action Bar */}
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-[#EFE8DF]">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-medium text-[#5E6D64] hover:text-[#1B3B2B] px-4 py-2.5 rounded-xl border border-[#D9D1C5] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <Button
                type="button"
                variant="primary"
                disabled={!selectedSlot}
                onClick={() => setStep("details")}
                className="w-auto px-6 py-2.5 text-xs font-medium"
              >
                Continue to Details →
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 2: CLIENT DETAILS & CONFIRMATION                       */}
        {/* ============================================================ */}
        {step === "details" && selectedSlot && (
          <form onSubmit={handleBookingSubmit} className="flex flex-col gap-5">
            {/* Selected Slot Summary Card */}
            <div className="bg-[#FAF7F2] border border-[#E9DFD2] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1B3B2B]">
                  Selected Appointment
                </span>
                <h4 className="font-serif font-medium text-base text-[#14261D] mt-0.5">
                  {formatFriendlyDate(selectedSlot.clientDate)}
                </h4>
                <p className="text-xs text-[#4F5E55]">
                  {formatTime12h(selectedSlot.clientStartTime)} –{" "}
                  {formatTime12h(selectedSlot.clientEndTime)} ({clientTimezone}) ·{" "}
                  {selectedDuration} mins
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep("select")}
                className="text-xs font-medium text-[#1B3B2B] hover:underline underline-offset-4 self-start sm:self-auto cursor-pointer"
              >
                Change Slot
              </button>
            </div>

            {submitError && (
              <Alert type="error" message={submitError} onClose={() => setSubmitError("")} />
            )}

            {/* Client Info Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                placeholder="e.g. Maya Sharma"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                error={fieldErrors.clientName}
                required
              />

              <Input
                label="Email Address"
                type="email"
                placeholder="e.g. maya@example.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                error={fieldErrors.clientEmail}
                required
              />
            </div>

            <Input
              label="Phone Number (Optional)"
              type="tel"
              placeholder="+91 98765 43210"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]">
                Reason for Visit / Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="Briefly describe what you'd like support with..."
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] transition-colors duration-150 text-[#1C2520] placeholder-[#8E9B93] focus:outline-none focus:bg-white focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15"
              />
            </div>

            {/* Notice regarding instant confirmation */}
            <p className="text-[11px] text-[#717E76] leading-relaxed">
              By confirming, this session will be booked directly on {therapist.name}&apos;s schedule.
              No upfront payment is required at this step.
            </p>

            {/* Bottom Navigation */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#EFE8DF]">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="text-xs font-medium text-[#5E6D64] hover:text-[#1B3B2B] px-4 py-2.5 rounded-xl border border-[#D9D1C5] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              >
                ← Back
              </button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                className="w-auto px-6 py-2.5 text-xs font-medium"
              >
                Confirm Booking
              </Button>
            </div>
          </form>
        )}

        {/* ============================================================ */}
        {/* STEP 3: BOOKING CONFIRMATION SCREEN                         */}
        {/* ============================================================ */}
        {step === "confirmed" && confirmedBooking && (
          <div className="flex flex-col items-center text-center py-4 gap-5">
            <div className="w-14 h-14 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center shadow-xs">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h3 className="text-2xl font-serif font-medium text-[#14261D]">
                Booking Confirmed!
              </h3>
              <p className="text-xs sm:text-sm text-[#5D6D63] mt-1 max-w-md">
                Your appointment with{" "}
                <strong>{confirmedBooking.therapist?.name || therapist.name}</strong> has been
                instantly reserved and confirmed.
              </p>
            </div>

            {/* Confirmation Summary Card */}
            <div className="w-full bg-[#FAF7F2] border border-[#E9DFD2] rounded-2xl p-5 text-left text-xs space-y-3">
              <div className="flex justify-between items-center border-b border-[#EFE8DF] pb-2">
                <span className="text-[#6E7B74]">Booking Reference:</span>
                <span className="font-mono font-medium text-[#1B3B2B]">
                  {confirmedBooking.id?.slice(-8).toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-[#EFE8DF] pb-2">
                <span className="text-[#6E7B74]">Date & Time:</span>
                <span className="font-medium text-[#14261D] text-right">
                  {formatUtcDate(confirmedBooking.startTime, clientTimezone)}
                  <br />
                  <span className="text-[11px] text-[#5D6D63]">
                    {formatUtcTimeRange(
                      confirmedBooking.startTime,
                      confirmedBooking.endTime,
                      clientTimezone
                    )}{" "}
                    ({clientTimezone})
                  </span>
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-[#EFE8DF] pb-2">
                <span className="text-[#6E7B74]">Session Duration:</span>
                <span className="font-medium text-[#14261D]">
                  {confirmedBooking.duration} Minutes
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[#6E7B74]">Client:</span>
                <span className="font-medium text-[#14261D]">
                  {confirmedBooking.clientName} ({confirmedBooking.clientEmail})
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
              <a
                href={createGoogleCalendarUrl({
                  title: `Therapy Session with ${confirmedBooking.therapist?.name || therapist.name}`,
                  startTimeIso: confirmedBooking.startTime,
                  endTimeIso: confirmedBooking.endTime,
                  details: `Confirmed therapy consultation with ${confirmedBooking.therapist?.name || therapist.name}.\nBooking ID: ${confirmedBooking.id}`,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#D9D1C5] bg-white hover:bg-[#FAF7F2] text-xs font-medium text-[#1B3B2B] transition-colors"
              >
                <svg className="w-4 h-4 text-[#1B3B2B]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
                </svg>
                <span>Add to Google Calendar</span>
              </a>

              <Button
                type="button"
                variant="primary"
                onClick={handleClose}
                className="w-full py-3 text-xs font-medium"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

