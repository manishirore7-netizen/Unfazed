import { useState, useEffect, useMemo } from "react";
import axiosInstance from "../../api/axiosInstance";
import Alert from "../common/Alert";
import Button from "../common/Button";
import {
  formatUtcDate,
  formatUtcTimeRange12h,
} from "../../utils/dateHelpers";

export default function AppointmentsManager({ timezone = "Asia/Kolkata", onCountUpdate }) {
  const [allBookings, setAllBookings] = useState([]);
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [cancelledBookings, setCancelledBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [filterTab, setFilterTab] = useState("upcoming"); // "upcoming" | "past" | "cancelled" | "all"

  // Modal States
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Fetch Bookings from GET /api/scheduling/bookings
  useEffect(() => {
    let isMounted = true;

    axiosInstance
      .get("/scheduling/bookings")
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success && Array.isArray(res.data?.data)) {
          const raw = res.data.data;
          setAllBookings(raw);

          const currentTime = Date.now();
          const upcoming = [];
          const past = [];
          const cancelled = [];

          raw.forEach((b) => {
            if (b.status === "cancelled") {
              cancelled.push(b);
            } else {
              const start = new Date(b.startTime).getTime();
              if (start >= currentTime) {
                upcoming.push(b);
              } else {
                past.push(b);
              }
            }
          });

          // Upcoming: chronological ascending (earliest upcoming appointment first)
          upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

          // Past / Completed: chronological descending (most recent first)
          past.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

          // Cancelled: chronological descending
          cancelled.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

          setUpcomingBookings(upcoming);
          setPastBookings(past);
          setCancelledBookings(cancelled);

          if (onCountUpdate) onCountUpdate(upcoming.length);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMessage(
          err.response?.data?.message || err.message || "Failed to load appointments."
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, onCountUpdate]);

  // Filtered list based on active tab
  const displayedBookings = useMemo(() => {
    if (filterTab === "upcoming") return upcomingBookings;
    if (filterTab === "past") return pastBookings;
    if (filterTab === "cancelled") return cancelledBookings;
    // "all": upcoming first (ascending), then past/cancelled (descending)
    return [...upcomingBookings, ...pastBookings, ...cancelledBookings];
  }, [filterTab, upcomingBookings, pastBookings, cancelledBookings]);

  // 3. Cancel Appointment Action (PATCH /api/scheduling/bookings/:id/cancel)
  const handleConfirmCancel = async () => {
    if (!bookingToCancel) return;

    try {
      setIsCancelling(true);
      setErrorMessage("");
      setSuccessMessage("");

      const res = await axiosInstance.patch(
        `/scheduling/bookings/${bookingToCancel._id}/cancel`
      );

      if (res.data?.success) {
        setSuccessMessage(
          `Appointment with ${bookingToCancel.clientName} has been cancelled successfully. The time slot is now open for new bookings.`
        );

        // Update local state and trigger refresh
        setAllBookings((prev) =>
          prev.map((b) =>
            b._id === bookingToCancel._id ? { ...b, status: "cancelled" } : b
          )
        );

        setBookingToCancel(null);
        if (selectedBooking?._id === bookingToCancel._id) {
          setSelectedBooking((prev) => ({ ...prev, status: "cancelled" }));
        }

        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to cancel the appointment."
      );
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Status Alerts */}
      {errorMessage && (
        <Alert
          type="error"
          message={errorMessage}
          onClose={() => setErrorMessage("")}
        />
      )}
      {successMessage && (
        <Alert
          type="success"
          message={successMessage}
          onClose={() => setSuccessMessage("")}
        />
      )}

      {/* Filter Tabs Header */}
      <div className="bg-white border border-[#E9DFD2] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B3B2B]">
            Client Appointments
          </h2>
          <p className="text-xs text-[#5D6D63] mt-0.5">
            Times displayed in your practice timezone (<strong>{timezone}</strong>).
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setFilterTab("upcoming")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === "upcoming"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-[#FAF7F2] text-[#45544B] hover:bg-[#F3EFEA]"
            }`}
          >
            <span>Upcoming</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                filterTab === "upcoming"
                  ? "bg-white/20 text-white"
                  : "bg-[#EBF3ED] text-[#1E4D32]"
              }`}
            >
              {upcomingBookings.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("past")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === "past"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-[#FAF7F2] text-[#45544B] hover:bg-[#F3EFEA]"
            }`}
          >
            <span>Past / Completed</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                filterTab === "past"
                  ? "bg-white/20 text-white"
                  : "bg-[#F0EAE2] text-[#637269]"
              }`}
            >
              {pastBookings.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("cancelled")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filterTab === "cancelled"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-[#FAF7F2] text-[#45544B] hover:bg-[#F3EFEA]"
            }`}
          >
            <span>Cancelled</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                filterTab === "cancelled"
                  ? "bg-white/20 text-white"
                  : "bg-[#FDF4F4] text-[#8C2828]"
              }`}
            >
              {cancelledBookings.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterTab === "all"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-[#FAF7F2] text-[#45544B] hover:bg-[#F3EFEA]"
            }`}
          >
            All ({allBookings.length})
          </button>
        </div>
      </div>

      {/* Appointments List / Empty State */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-[#E9DFD2] rounded-2xl p-6 animate-pulse flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="h-10 bg-[#FAF7F2] rounded w-1/3"></div>
              <div className="h-8 bg-[#FAF7F2] rounded w-24"></div>
            </div>
          ))}
        </div>
      ) : displayedBookings.length === 0 ? (
        <div className="bg-white border border-[#E9DFD2] rounded-2xl p-8 sm:p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-serif font-medium text-lg text-[#14261D] mb-1">
            {filterTab === "upcoming" && "No Upcoming Appointments"}
            {filterTab === "past" && "No Past Sessions Yet"}
            {filterTab === "cancelled" && "No Cancelled Sessions"}
            {filterTab === "all" && "No Bookings Recorded Yet"}
          </h3>
          <p className="text-xs sm:text-sm text-[#5D6D63] max-w-md mx-auto leading-relaxed">
            {filterTab === "upcoming"
              ? "When clients schedule consultations through your public booking link, confirmed appointments will appear here."
              : "Appointments booked by clients will be listed chronologically in this dashboard."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {displayedBookings.map((b) => {
            const isConfirmed = b.status === "confirmed";
            const isFuture = upcomingBookings.some((u) => u._id === b._id);
            const canCancel = isConfirmed && isFuture;

            return (
              <div
                key={b._id}
                className="bg-white border border-[#E9DFD2] hover:border-[#D0C6B8] rounded-2xl p-5 sm:p-6 shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Timing & Client Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Date & Time Badge */}
                  <div className="bg-[#FAF7F2] border border-[#EAE2D6] rounded-xl px-4 py-3 flex flex-col items-start justify-center min-w-[170px] shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#1B3B2B]">
                      {formatUtcDate(b.startTime, timezone)}
                    </span>
                    <span className="text-sm font-semibold text-[#14261D] mt-0.5">
                      {formatUtcTimeRange12h(b.startTime, b.endTime, timezone)}
                    </span>
                    <span className="text-[10px] text-[#717E76] mt-0.5">
                      {b.duration} mins · {timezone}
                    </span>
                  </div>

                  {/* Client Info */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif font-semibold text-base text-[#14261D]">
                        {b.clientName}
                      </h4>
                      {/* Status Badges */}
                      {isConfirmed ? (
                        isFuture ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#1E4D32] border border-[#CDE3D5]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2A6543]"></span>
                            Confirmed · Upcoming
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0EAE2] text-[#55635B] border border-[#DDD5C7]">
                            Completed / Past
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDF4F4] text-[#8C2828] border border-[#F2D1D1]">
                          Cancelled
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5D6D63]">
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-[#7F8D84]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {b.clientEmail}
                      </span>
                      {b.clientPhone && (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-[#7F8D84]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {b.clientPhone}
                        </span>
                      )}
                    </div>

                    {b.clientNotes && (
                      <p className="text-xs text-[#6F7D74] line-clamp-1 italic mt-0.5">
                        &quot;{b.clientNotes}&quot;
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedBooking(b)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#D9D1C5] text-[#24332B] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                  >
                    View Details
                  </button>

                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setBookingToCancel(b)}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#8C2828] bg-[#FDF4F4] hover:bg-[#F9E5E5] border border-[#F2D1D1] transition-colors cursor-pointer"
                    >
                      Cancel Session
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. APPOINTMENT DETAILS MODAL                                 */}
      {/* ============================================================ */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
          <div className="bg-white border border-[#E9DFD2] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-8">
            <button
              type="button"
              onClick={() => setSelectedBooking(null)}
              className="absolute top-6 right-6 text-[#717E76] hover:text-[#1B3B2B] p-2 rounded-xl hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              aria-label="Close details"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3 border-b border-[#EFE8DF] pb-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#EBF3ED] text-[#1E4D32] flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="font-serif font-medium text-lg text-[#14261D]">
                  Session Details
                </h3>
                <p className="text-xs text-[#5D6D63]">
                  Booking Ref:{" "}
                  <span className="font-mono font-medium text-[#1B3B2B]">
                    {selectedBooking._id?.slice(-8).toUpperCase()}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-xs">
              {/* Timing */}
              <div className="bg-[#FAF7F2] border border-[#E9DFD2] rounded-xl p-4 flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F7D74]">
                  Date & Scheduled Time
                </span>
                <span className="font-serif font-medium text-base text-[#14261D]">
                  {formatUtcDate(selectedBooking.startTime, timezone)}
                </span>
                <span className="text-xs font-medium text-[#245437]">
                  {formatUtcTimeRange12h(selectedBooking.startTime, selectedBooking.endTime, timezone)}{" "}
                  ({timezone}) · {selectedBooking.duration} mins
                </span>
              </div>

              {/* Client Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-white border border-[#EBE3D7] rounded-xl p-4">
                <div>
                  <span className="text-[#7F8D84] block mb-0.5">Client Name</span>
                  <span className="font-medium text-[#14261D] text-sm">
                    {selectedBooking.clientName}
                  </span>
                </div>
                <div>
                  <span className="text-[#7F8D84] block mb-0.5">Email Address</span>
                  <span className="font-medium text-[#14261D] text-xs break-all">
                    {selectedBooking.clientEmail}
                  </span>
                </div>
                <div>
                  <span className="text-[#7F8D84] block mb-0.5">Phone Number</span>
                  <span className="font-medium text-[#14261D] text-xs">
                    {selectedBooking.clientPhone || "Not provided"}
                  </span>
                </div>
                <div>
                  <span className="text-[#7F8D84] block mb-0.5">Booking Status</span>
                  <span className="font-medium text-xs capitalize">
                    {selectedBooking.status === "confirmed" ? (
                      <span className="text-[#245437]">Confirmed</span>
                    ) : (
                      <span className="text-[#8C2828]">Cancelled</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Client Notes */}
              <div>
                <span className="font-semibold uppercase tracking-wider text-[#6F7D74] block mb-1">
                  Client Notes / Reason for Visit
                </span>
                <p className="p-3.5 rounded-xl bg-[#FCFAF7] border border-[#EBE3D7] text-[#334239] leading-relaxed italic">
                  {selectedBooking.clientNotes?.trim()
                    ? selectedBooking.clientNotes
                    : "No specific notes provided by the client."}
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#EFE8DF] mt-2">
                {selectedBooking.status === "confirmed" &&
                upcomingBookings.some((u) => u._id === selectedBooking._id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBookingToCancel(selectedBooking);
                      setSelectedBooking(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-[#8C2828] bg-[#FDF4F4] hover:bg-[#F9E5E5] border border-[#F2D1D1] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel Appointment
                  </button>
                ) : (
                  <div></div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedBooking(null)}
                  className="w-auto px-5 py-2 text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. CANCELLATION CONFIRMATION DIALOG                          */}
      {/* ============================================================ */}
      {bookingToCancel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-[#E9DFD2] rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#FDF4F4] text-[#8C2828] flex items-center justify-center mx-auto mb-3.5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="font-serif font-medium text-lg text-[#14261D] mb-1.5">
              Cancel Appointment?
            </h3>

            <p className="text-xs sm:text-sm text-[#4E5C53] leading-relaxed mb-4">
              Are you sure you want to cancel the session with{" "}
              <strong>{bookingToCancel.clientName}</strong> on{" "}
              <strong>{formatUtcDate(bookingToCancel.startTime, timezone)}</strong> at{" "}
              <strong>{formatUtcTimeRange12h(bookingToCancel.startTime, bookingToCancel.endTime, timezone)}</strong>?
            </p>

            <div className="bg-[#FAF7F2] border border-[#E9DFD2] rounded-xl p-3 text-[11px] text-[#6E7B74] mb-5 text-left">
              <strong>Notice:</strong> Cancelling will mark the appointment as cancelled and immediately reopen this time slot on your public booking calendar.
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setBookingToCancel(null)}
                className="w-1/2 px-4 py-2.5 rounded-xl border border-[#D9D1C5] text-xs font-medium text-[#334239] hover:bg-[#F3EFEA] transition-colors cursor-pointer"
              >
                Keep Appointment
              </button>

              <Button
                type="button"
                variant="primary"
                isLoading={isCancelling}
                onClick={handleConfirmCancel}
                className="w-1/2 py-2.5 text-xs bg-[#8C2828] hover:bg-[#732020] text-white border-transparent"
              >
                Yes, Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
