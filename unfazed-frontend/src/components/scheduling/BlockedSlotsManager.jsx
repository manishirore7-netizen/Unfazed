import { useState, useEffect, useCallback } from "react";
import axiosInstance from "../../api/axiosInstance";
import Button from "../common/Button";
import Alert from "../common/Alert";
import {
  TIME_OPTIONS,
  getTodayDateString,
  localToUtcIso,
  formatUtcDate,
  formatUtcTimeRange,
} from "../../utils/dateHelpers";

export default function BlockedSlotsManager({ timezone, onCountUpdate }) {
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Form State
  const todayStr = getTodayDateString(timezone);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");

  // 1. Fetch Blocked Slots
  const fetchBlockedSlots = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get("/scheduling/blocks");
      if (res.data?.data) {
        setBlockedSlots(res.data.data);
        if (onCountUpdate) onCountUpdate(res.data.data.length);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Unable to load blocked time slots."
      );
    } finally {
      setIsLoading(false);
    }
  }, [onCountUpdate]);

  useEffect(() => {
    let isMounted = true;
    axiosInstance
      .get("/scheduling/blocks")
      .then((res) => {
        if (isMounted && res.data?.data) {
          setBlockedSlots(res.data.data);
          if (onCountUpdate) onCountUpdate(res.data.data.length);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMessage(
            err.response?.data?.message || err.message || "Unable to load blocked time slots."
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

  // 2. Validation
  const validate = () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErrorMessage("Please select a valid calendar date for the blocked slot.");
      return false;
    }

    if (!startTime || !endTime) {
      setErrorMessage("Please select both start and end times.");
      return false;
    }

    if (startTime >= endTime) {
      setErrorMessage(
        `Invalid blocked interval: end time (${endTime}) must be strictly after start time (${startTime}).`
      );
      return false;
    }

    return true;
  };

  // 3. Save Blocked Slot Handler
  const handleSave = async (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!validate()) return;

    try {
      setIsSaving(true);

      // Convert local date and times in therapist timezone to UTC ISO strings
      const startUtcIso = localToUtcIso(date, startTime, timezone);
      const endUtcIso = localToUtcIso(date, endTime, timezone);

      const payload = {
        startTime: startUtcIso,
        endTime: endUtcIso,
        reason: reason.trim() ? reason.trim().slice(0, 200) : "Blocked Time",
      };

      const res = await axiosInstance.post("/scheduling/blocks", payload);

      if (res.data?.success) {
        setSuccessMessage(`Time slot successfully blocked on ${date} (${startTime} – ${endTime}).`);
        // Reset form
        setDate("");
        setStartTime("12:00");
        setEndTime("13:00");
        setReason("");
        await fetchBlockedSlots();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to block time slot."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 4. Delete Blocked Slot Handler
  const handleDelete = async (blockId) => {
    setSuccessMessage("");
    setErrorMessage("");

    try {
      setDeletingId(blockId);
      const res = await axiosInstance.delete(`/scheduling/blocks/${blockId}`);
      if (res.data?.success) {
        setSuccessMessage("Blocked time slot removed.");
        await fetchBlockedSlots();
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to remove blocked slot."
      );
    } finally {
      setDeletingId(null);
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

      {/* SECTION 1: CREATE BLOCKED TIME SLOT */}
      <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FAF0E6] text-[#784A1A] text-xs font-medium mb-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-[#995E20]"></span>
            <span>Intraday Block</span>
          </div>
          <h2 className="text-lg font-serif font-medium text-[#14261D]">
            Block Specific Time Interval
          </h2>
          <p className="text-xs text-[#5D6D63] mt-0.5">
            Prevent client bookings during personal appointments, team meetings, or clinical supervision while keeping the rest of the day open.
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Target Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                Date <span className="text-[#A23333]">*</span>
              </label>
              <input
                type="date"
                min={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
              />
            </div>

            {/* Start Time */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                Start Time <span className="text-[#A23333]">*</span>
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors cursor-pointer"
              >
                {TIME_OPTIONS.slice(0, -1).map((t) => (
                  <option key={`block-start-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* End Time */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                End Time <span className="text-[#A23333]">*</span>
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors cursor-pointer"
              >
                {TIME_OPTIONS.slice(1).map((t) => (
                  <option key={`block-end-${t}`} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reason Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
              Reason / Activity Description (Optional)
            </label>
            <input
              type="text"
              maxLength={200}
              placeholder="e.g. Dental appointment, Peer supervision, Personal errand"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-[#6F7D74]">
              Times are stored in UTC and aligned with your practice timezone ({timezone}).
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2 border-t border-[#F0EAE2]">
            <Button type="submit" variant="primary" isLoading={isSaving} className="w-auto px-6">
              Block Time Slot
            </Button>
          </div>
        </form>
      </div>

      {/* SECTION 2: LIST OF ACTIVE BLOCKED SLOTS */}
      <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B3B2B]">
              Active Blocked Slots ({blockedSlots.length})
            </h2>
            <p className="text-xs text-[#5D6D63] mt-0.5">
              Times during which client scheduling is prevented.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchBlockedSlots}
            className="text-xs text-[#4E5C53] hover:text-[#1B3B2B] underline underline-offset-4 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-[#717E76] animate-pulse">
            Loading blocked slots...
          </div>
        ) : blockedSlots.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center border border-dashed border-[#DDD5C7] rounded-xl bg-[#FAF8F5]">
            <div className="w-8 h-8 rounded-lg bg-[#FAF0E6] text-[#784A1A] flex items-center justify-center mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-medium text-[#29382E]">No intraday blocked slots</p>
            <p className="text-[11px] text-[#717E76] max-w-sm mt-0.5">
              All hours within your working days are currently open for client appointments. Use the form above to reserve personal time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#F0EAE2]">
            {blockedSlots.map((slot) => (
              <div
                key={slot._id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-[#14261D]">
                      {formatUtcDate(slot.startTime, timezone)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FAF0E6] text-[#784A1A] border border-[#EADBCC]">
                      {formatUtcTimeRange(slot.startTime, slot.endTime, timezone)}
                    </span>
                  </div>

                  {slot.reason && (
                    <p className="text-xs text-[#5D6C63] italic">
                      Reason: &ldquo;{slot.reason}&rdquo;
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={deletingId === slot._id}
                  onClick={() => handleDelete(slot._id)}
                  className="text-xs text-[#8A3333] hover:text-[#5F1F1F] bg-[#FDF4F4] hover:bg-[#FAEAEA] border border-[#F2D1D1] px-3 py-1.5 rounded-lg transition-colors cursor-pointer w-fit self-end sm:self-center disabled:opacity-50"
                >
                  {deletingId === slot._id ? "Removing..." : "Unblock Slot"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
