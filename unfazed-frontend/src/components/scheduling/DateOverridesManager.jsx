import { useState, useEffect, useCallback } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Alert from "../common/Alert";
import { TIME_OPTIONS, getTodayDateString } from "../../utils/dateHelpers";

export default function DateOverridesManager({ timezone, onCountUpdate }) {
  const [overrides, setOverrides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Form State
  const todayStr = getTodayDateString(timezone);
  const [date, setDate] = useState("");
  const [isBlocked, setIsBlocked] = useState(true);
  const [timeSlots, setTimeSlots] = useState([{ startTime: "09:00", endTime: "13:00" }]);
  const [reason, setReason] = useState("");

  // 1. Fetch Overrides
  const fetchOverrides = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get("/scheduling/overrides");
      if (res.data?.data) {
        setOverrides(res.data.data);
        if (onCountUpdate) onCountUpdate(res.data.data.length);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Unable to load date overrides."
      );
    } finally {
      setIsLoading(false);
    }
  }, [onCountUpdate]);

  useEffect(() => {
    let isMounted = true;
    axiosInstance
      .get("/scheduling/overrides")
      .then((res) => {
        if (isMounted && res.data?.data) {
          setOverrides(res.data.data);
          if (onCountUpdate) onCountUpdate(res.data.data.length);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(
            err.response?.data?.message || err.message || "Unable to load date overrides."
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [onCountUpdate]);

  // 2. Interval Handlers for Custom Working Hours
  const addTimeSlot = () => {
    const lastSlot = timeSlots[timeSlots.length - 1];
    const newStart = lastSlot ? lastSlot.endTime : "09:00";
    setTimeSlots((prev) => [...prev, { startTime: newStart, endTime: "17:00" }]);
  };

  const removeTimeSlot = (index) => {
    setTimeSlots((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateTimeSlot = (index, field, value) => {
    setTimeSlots((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, [field]: value } : slot))
    );
  };

  // 3. Validation
  const validate = () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErrorMessage("Please select a valid calendar date (YYYY-MM-DD).");
      return false;
    }

    if (!isBlocked) {
      if (timeSlots.length === 0) {
        setErrorMessage("Please configure at least one working time interval for custom hours.");
        return false;
      }

      for (let i = 0; i < timeSlots.length; i++) {
        const slot = timeSlots[i];
        if (slot.startTime >= slot.endTime) {
          setErrorMessage(
            `Invalid time interval (${slot.startTime} to ${slot.endTime}): end time must be after start time.`
          );
          return false;
        }

        for (let j = i + 1; j < timeSlots.length; j++) {
          const other = timeSlots[j];
          if (slot.startTime < other.endTime && slot.endTime > other.startTime) {
            setErrorMessage(
              `Overlapping time intervals detected (${slot.startTime}-${slot.endTime} and ${other.startTime}-${other.endTime}).`
            );
            return false;
          }
        }
      }
    }

    return true;
  };

  // 4. Save Override Handler
  const handleSave = async (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!validate()) return;

    try {
      setIsSaving(true);
      const payload = {
        date,
        isBlocked,
        timeSlots: isBlocked ? [] : timeSlots,
        reason: reason.trim().slice(0, 200),
      };

      const res = await axiosInstance.post("/scheduling/overrides", payload);

      if (res.data?.success) {
        setSuccessMessage(`Date override for ${date} saved successfully.`);
        // Reset form
        setDate("");
        setIsBlocked(true);
        setTimeSlots([{ startTime: "09:00", endTime: "13:00" }]);
        setReason("");
        await fetchOverrides();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to save date override."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Delete Override Handler
  const handleDelete = async (overrideId, overrideDate) => {
    setSuccessMessage("");
    setErrorMessage("");

    try {
      setDeletingId(overrideId);
      const res = await axiosInstance.delete(`/scheduling/overrides/${overrideId}`);
      if (res.data?.success) {
        setSuccessMessage(`Override for ${overrideDate} removed.`);
        await fetchOverrides();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to remove date override."
      );
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to format date nicely
  const formatDateLabel = (dateStr) => {
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const testDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(testDate);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Notifications */}
      {errorMessage && (
        <Alert type="error" message={errorMessage} onClose={() => setErrorMessage("")} />
      )}
      {successMessage && (
        <Alert type="success" message={successMessage} onClose={() => setSuccessMessage("")} />
      )}

      {/* SECTION 1: CREATE OR UPDATE DATE OVERRIDE */}
      <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#EBF3ED] text-[#245437] text-xs font-medium mb-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2E6B45]"></span>
            <span>Single-Day Rule</span>
          </div>
          <h2 className="text-lg font-serif font-medium text-[#14261D]">
            Add One-Time Date Override
          </h2>
          <p className="text-xs text-[#5D6D63] mt-0.5">
            Modify hours or block availability for a specific calendar date without altering your standard weekly schedule.
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* Date & Type Selector Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                Target Date <span className="text-[#A23333]">*</span>
              </label>
              <input
                type="date"
                min={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-[#6F7D74]">
                Calendar date in practice timezone ({timezone}).
              </p>
            </div>

            {/* Optional Reason */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                Reason / Note (Optional)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="e.g. Public Holiday, Extended Clinic, Personal Leave"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-[#6F7D74]">
                Visible in your scheduling workspace for reference.
              </p>
            </div>
          </div>

          {/* Mode Selection: Day Off vs Custom Hours */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#F0EAE2]">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
              Override Availability Mode <span className="text-[#A23333]">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsBlocked(true)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  isBlocked
                    ? "bg-[#FAF2F2] border-[#E8BABA] text-[#8C2828] shadow-xs ring-1 ring-[#D65454]/20"
                    : "bg-[#FCFAF7] border-[#DCD4C7] text-[#445249] hover:bg-[#F3EFEA]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isBlocked ? "bg-[#C43838]" : "bg-[#B4BFB8]"}`}></span>
                  <span className="font-semibold text-xs sm:text-sm">Mark Entire Day Unavailable</span>
                </div>
                <p className="text-[11px] text-[#6F7D74] ml-4.5">
                  Block all client bookings on this date (e.g. holidays or vacation).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsBlocked(false)}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  !isBlocked
                    ? "bg-[#EFF7F2] border-[#B7DBC2] text-[#1E5733] shadow-xs ring-1 ring-[#2E6B45]/20"
                    : "bg-[#FCFAF7] border-[#DCD4C7] text-[#445249] hover:bg-[#F3EFEA]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${!isBlocked ? "bg-[#2E6B45]" : "bg-[#B4BFB8]"}`}></span>
                  <span className="font-semibold text-xs sm:text-sm">Set Custom Working Hours</span>
                </div>
                <p className="text-[11px] text-[#6F7D74] ml-4.5">
                  Offer special or extended consulting hours on this date.
                </p>
              </button>
            </div>
          </div>

          {/* Custom Working Hours Configuration (Only if isBlocked is false) */}
          {!isBlocked && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#FAF8F5] border border-[#EBE3D7] animate-fadeIn">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                Custom Working Intervals
              </label>

              <div className="flex flex-col gap-2.5">
                {timeSlots.map((slot, index) => (
                  <div key={`custom-slot-${index}`} className="flex flex-wrap items-center gap-2">
                    <select
                      value={slot.startTime}
                      onChange={(e) => updateTimeSlot(index, "startTime", e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg bg-white border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:outline-none cursor-pointer"
                    >
                      {TIME_OPTIONS.slice(0, -1).map((t) => (
                        <option key={`start-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs text-[#7A887F]">to</span>

                    <select
                      value={slot.endTime}
                      onChange={(e) => updateTimeSlot(index, "endTime", e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg bg-white border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:outline-none cursor-pointer"
                    >
                      {TIME_OPTIONS.slice(1).map((t) => (
                        <option key={`end-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    {timeSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTimeSlot(index)}
                        className="text-xs text-[#8A3B3B] hover:text-[#5F2424] p-1.5 hover:bg-[#FDF4F4] rounded-lg transition-colors cursor-pointer"
                        title="Remove interval"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addTimeSlot}
                className="text-xs font-medium text-[#1B3B2B] hover:underline underline-offset-4 w-fit flex items-center gap-1 mt-1 cursor-pointer"
              >
                <span>+ Add another interval (split shift)</span>
              </button>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end pt-2 border-t border-[#F0EAE2]">
            <Button type="submit" variant="primary" isLoading={isSaving} className="w-auto px-6">
              Save Date Override
            </Button>
          </div>
        </form>
      </div>

      {/* SECTION 2: LIST OF ACTIVE OVERRIDES */}
      <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B3B2B]">
              Active Date Overrides ({overrides.length})
            </h2>
            <p className="text-xs text-[#5D6D63] mt-0.5">
              Scheduled single-day changes to your practice availability.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchOverrides}
            className="text-xs text-[#4E5C53] hover:text-[#1B3B2B] underline underline-offset-4 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-[#717E76] animate-pulse">
            Loading date overrides...
          </div>
        ) : overrides.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center border border-dashed border-[#DDD5C7] rounded-xl bg-[#FAF8F5]">
            <div className="w-8 h-8 rounded-lg bg-[#EBF3ED] text-[#245437] flex items-center justify-center mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs font-medium text-[#29382E]">No date overrides configured</p>
            <p className="text-[11px] text-[#717E76] max-w-sm mt-0.5">
              Your standard weekly recurring schedule applies to all upcoming calendar dates. Use the form above to add holidays or custom working dates.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#F0EAE2]">
            {overrides.map((override) => (
              <div
                key={override._id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-[#14261D]">
                      {formatDateLabel(override.date)}
                    </span>
                    <span className="text-xs font-mono text-[#717E76]">({override.date})</span>

                    {override.isBlocked ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FDF4F4] text-[#8C2828] border border-[#F1C8C8]">
                        Day Off / Unavailable
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#EFF7F2] text-[#1E5733] border border-[#CDE5D5]">
                        Custom Hours
                      </span>
                    )}
                  </div>

                  {!override.isBlocked && override.timeSlots?.length > 0 && (
                    <div className="text-xs text-[#4F5E55] flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="font-medium text-[#2A382F]">Hours:</span>
                      {override.timeSlots.map((ts, idx) => (
                        <span key={idx} className="bg-[#FAF7F2] px-2 py-0.5 rounded border border-[#E5DDD2] text-[11px]">
                          {ts.startTime} – {ts.endTime}
                        </span>
                      ))}
                    </div>
                  )}

                  {override.reason && (
                    <p className="text-xs text-[#6A7870] italic mt-0.5">
                      Note: &ldquo;{override.reason}&rdquo;
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={deletingId === override._id}
                  onClick={() => handleDelete(override._id, override.date)}
                  className="text-xs text-[#8A3333] hover:text-[#5F1F1F] bg-[#FDF4F4] hover:bg-[#FAEAEA] border border-[#F2D1D1] px-3 py-1.5 rounded-lg transition-colors cursor-pointer w-fit self-end sm:self-center disabled:opacity-50"
                >
                  {deletingId === override._id ? "Removing..." : "Remove Override"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
