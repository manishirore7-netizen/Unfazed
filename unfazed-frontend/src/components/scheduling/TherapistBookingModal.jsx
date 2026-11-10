import { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Alert from "../common/Alert";
import {
  getTodayDateString,
  formatUtcDate,
  formatUtcTimeRange,
  formatTime12h,
  formatFriendlyDate,
  addDaysToDate,
} from "../../utils/dateHelpers";

export default function TherapistBookingModal({
  client,
  isOpen,
  onClose,
  onSuccess,
}) {
  const [practiceTimezone, setPracticeTimezone] = useState("Asia/Kolkata");
  const [allowedDurations, setAllowedDurations] = useState([30, 45, 60, 90]);
  const [selectedDuration, setSelectedDuration] = useState(60);

  // Today in practice timezone
  const todayStr = useMemo(() => getTodayDateString(practiceTimezone), [practiceTimezone]);
  const maxBookingDateStr = useMemo(() => addDaysToDate(todayStr, 60), [todayStr]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [slots, setSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Notes
  const [clientNotes, setClientNotes] = useState("");

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // 1. Fetch practice availability config when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    axiosInstance
      .get("/scheduling/availability")
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && res.data?.data) {
          const avail = res.data.data;
          if (avail.timezone) setPracticeTimezone(avail.timezone);
          if (Array.isArray(avail.sessionDurations) && avail.sessionDurations.length > 0) {
            setAllowedDurations(avail.sessionDurations);
            setSelectedDuration((prev) =>
              avail.sessionDurations.includes(prev) ? prev : avail.sessionDurations[0]
            );
          }
        }
      })
      .catch((err) => {
        console.warn("Could not fetch therapist availability settings:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // 2. Fetch Available Slots using authenticated GET /scheduling/slots
  useEffect(() => {
    if (!isOpen || !selectedDate) return;

    let isMounted = true;

    axiosInstance
      .get("/scheduling/slots", {
        params: {
          date: selectedDate,
          duration: selectedDuration,
          timezone: practiceTimezone,
        },
      })
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && res.data?.data) {
          const data = res.data.data;
          setSlots(Array.isArray(data.slots) ? data.slots : []);
          if (data.therapist?.timezone) {
            setPracticeTimezone(data.therapist.timezone);
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
  }, [isOpen, selectedDate, selectedDuration, practiceTimezone, refreshKey]);

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

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setSelectedSlot(null);
    setIsLoadingSlots(true);
    setSlotsError("");
  };

  const handleDurationChange = (dur) => {
    setSelectedDuration(dur);
    setSelectedSlot(null);
    setIsLoadingSlots(true);
    setSlotsError("");
  };

  // Submit Booking via authenticated POST /scheduling/bookings
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!selectedSlot) {
      setSubmitError("Please select an available time slot.");
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        clientId: client?._id,
        clientName: client?.name,
        clientEmail: client?.email,
        clientPhone: client?.phone || "",
        clientNotes: clientNotes.trim(),
        startTime: selectedSlot.startTime,
        duration: selectedDuration,
      };

      const res = await axiosInstance.post("/scheduling/bookings", payload);

      if (res.data?.success && res.data?.data) {
        setConfirmedBooking(res.data.data);
        if (onSuccess) {
          onSuccess(res.data.data);
        }
      } else {
        setSubmitError(
          res.data?.message || "Unexpected response format while scheduling appointment."
        );
      }
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.message ||
        err.message ||
        "An unexpected error occurred while scheduling appointment.";

      if (status === 409) {
        setSubmitError(message);
        setSelectedSlot(null);
        setIsLoadingSlots(true);
        setRefreshKey((k) => k + 1);
      } else {
        setSubmitError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedSlot(null);
    setSubmitError("");
    setConfirmedBooking(null);
    setClientNotes("");
    onClose();
  };

  if (!isOpen || !client) return null;

  return (
    <div
      className="fixed inset-0 bg-[#15231B]/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="bg-white border border-[#E9DFD2] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-5 border-b border-[#EAE2D6]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#14261D]">
                Schedule Client Appointment
              </h2>
              <p className="text-xs text-[#5E6D64] mt-0.5">
                Book a confirmed clinical session directly on your practice calendar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#717E76] hover:text-[#1B3B2B] hover:bg-[#F2ECE4] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Confirmed State */}
        {confirmedBooking ? (
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center border border-[#CDE3D5]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-1">
              <h3 className="font-serif text-xl font-bold text-[#14261D]">
                Appointment Confirmed!
              </h3>
              <p className="text-xs text-[#5E6D64]">
                The session has been scheduled and added to {client.name}&apos;s appointment history.
              </p>
            </div>

            <div className="bg-[#FAF8F5] border border-[#E9DFD2] rounded-2xl p-4 w-full max-w-md text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#717E76]">Client:</span>
                <span className="font-semibold text-[#1C2520]">{confirmedBooking.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#717E76]">Email:</span>
                <span className="font-medium text-[#1C2520]">{confirmedBooking.clientEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#717E76]">Date & Time:</span>
                <span className="font-semibold text-[#1B3B2B]">
                  {formatUtcDate(confirmedBooking.startTime, practiceTimezone)} · {formatUtcTimeRange(confirmedBooking.startTime, confirmedBooking.endTime, practiceTimezone)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#717E76]">Duration:</span>
                <span className="font-medium text-[#1C2520]">{confirmedBooking.duration} minutes</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleClose}
              className="w-auto px-6 py-2.5 text-xs rounded-xl"
            >
              Done
            </Button>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleBookingSubmit} className="pt-5 space-y-5">
            {/* Prepopulated Client Info Card */}
            <div className="bg-[#FAF8F5] border border-[#EAE2D6] rounded-xl p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1B3B2B] text-white font-semibold flex items-center justify-center text-xs shrink-0">
                  {client.name?.[0]?.toUpperCase() || "C"}
                </div>
                <div>
                  <span className="font-semibold text-[#14261D] block">{client.name}</span>
                  <span className="text-[#717E76] text-[11px] block">{client.email} {client.phone && `· ${client.phone}`}</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1E4D32] bg-[#EBF3ED] px-2 py-0.5 rounded-md border border-[#CDE3D5]">
                Target Client
              </span>
            </div>

            {submitError && <Alert variant="error" message={submitError} />}

            {/* Session Duration Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43] block">
                Session Duration
              </label>
              <div className="flex flex-wrap gap-2">
                {allowedDurations.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => handleDurationChange(dur)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      selectedDuration === dur
                        ? "bg-[#1B3B2B] text-white shadow-xs"
                        : "bg-[#FCFAF7] border border-[#DCD4C7] text-[#334238] hover:bg-[#F2ECE4]"
                    }`}
                  >
                    {dur} Minutes
                  </button>
                ))}
              </div>
            </div>

            {/* Date Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43]">
                  Select Date
                </label>
                <span className="text-[11px] text-[#717E76]">
                  Timezone: {practiceTimezone}
                </span>
              </div>

              {/* Quick Date Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {quickDates.map((qd) => (
                  <button
                    key={qd.date}
                    type="button"
                    onClick={() => handleDateChange(qd.date)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      selectedDate === qd.date
                        ? "bg-[#1B3B2B] text-white shadow-xs"
                        : "bg-[#FCFAF7] border border-[#DCD4C7] text-[#38483E] hover:bg-[#F2ECE4]"
                    }`}
                  >
                    {qd.label}
                  </button>
                ))}
              </div>

              {/* Date Input */}
              <input
                type="date"
                min={todayStr}
                max={maxBookingDateStr}
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
              />
            </div>

            {/* Available Time Slots */}
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43] block">
                Available Time Slots ({formatFriendlyDate(selectedDate)})
              </label>

              {isLoadingSlots ? (
                <div className="p-8 bg-[#FAF8F5] rounded-xl flex items-center justify-center gap-2 text-xs text-[#717E76]">
                  <svg
                    className="animate-spin h-4 w-4 text-[#1B3B2B]"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Checking open schedule slots...</span>
                </div>
              ) : slotsError ? (
                <Alert variant="error" message={slotsError} />
              ) : slots.length === 0 ? (
                <div className="p-6 bg-[#FAF8F5] border border-[#EAE2D6] rounded-xl text-center text-xs text-[#717E76]">
                  No available time slots on this date. The therapist may be off or booked.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#1B3B2B] text-white ring-2 ring-[#1B3B2B]/20 shadow-xs"
                            : "bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] hover:bg-[#EBF3ED] hover:border-[#CDE3D5]"
                        }`}
                      >
                        {formatTime12h(slot.localStartTime)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Session Notes */}
            <div className="space-y-1.5">
              <label
                htmlFor="session-notes"
                className="text-xs font-semibold tracking-wide uppercase text-[#3E4A43] block"
              >
                Session Notes (Optional)
              </label>
              <textarea
                id="session-notes"
                rows={2}
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="e.g. Follow-up consultation, CBT progress review, intake discussion..."
                className="w-full px-4 py-2.5 text-xs rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:outline-none focus:bg-white focus:border-[#1B3B2B]"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-[#EAE2D6] flex items-center justify-between">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] hover:bg-[#F3EFEA] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={!selectedSlot}
                className="w-auto px-5 py-2.5 text-xs rounded-xl"
              >
                Confirm Appointment
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
