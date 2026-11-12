import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import axiosInstance from "../../api/axiosInstance";
import Button from "../../components/common/Button";
import Alert from "../../components/common/Alert";
import DateOverridesManager from "../../components/scheduling/DateOverridesManager";
import BlockedSlotsManager from "../../components/scheduling/BlockedSlotsManager";
import AppointmentsManager from "../../components/scheduling/AppointmentsManager";

// 7 days of the week in standard order (0 = Sunday ... 6 = Saturday)
const DAYS_OF_WEEK = [
  { index: 1, name: "Monday" },
  { index: 2, name: "Tuesday" },
  { index: 3, name: "Wednesday" },
  { index: 4, name: "Thursday" },
  { index: 5, name: "Friday" },
  { index: 6, name: "Saturday" },
  { index: 0, name: "Sunday" },
];

// Standard IANA timezone list
const COMMON_TIMEZONES = [
  { label: "India Standard Time (IST) — Asia/Kolkata", value: "Asia/Kolkata" },
  { label: "US Eastern Time (EST/EDT) — America/New_York", value: "America/New_York" },
  { label: "US Central Time (CST/CDT) — America/Chicago", value: "America/Chicago" },
  { label: "US Mountain Time (MST/MDT) — America/Denver", value: "America/Denver" },
  { label: "US Pacific Time (PST/PDT) — America/Los_Angeles", value: "America/Los_Angeles" },
  { label: "Greenwich Mean Time / UK — Europe/London", value: "Europe/London" },
  { label: "Central European Time — Europe/Paris", value: "Europe/Paris" },
  { label: "Gulf Standard Time — Asia/Dubai", value: "Asia/Dubai" },
  { label: "Singapore / Hong Kong Time — Asia/Singapore", value: "Asia/Singapore" },
  { label: "Japan Standard Time — Asia/Tokyo", value: "Asia/Tokyo" },
  { label: "Australian Eastern Time — Australia/Sydney", value: "Australia/Sydney" },
  { label: "Coordinated Universal Time (UTC) — UTC", value: "UTC" },
];

// Generate 15-minute time intervals from 00:00 to 23:45
const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    TIME_OPTIONS.push(`${hh}:${mm}`);
  }
}
// Add 24:00 as midnight end of day representation
TIME_OPTIONS.push("24:00");

// Default initial 7-day schedule
const buildDefaultSchedule = () => [
  { dayOfWeek: 0, isOpen: false, timeSlots: [] },
  { dayOfWeek: 1, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
  { dayOfWeek: 2, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
  { dayOfWeek: 3, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
  { dayOfWeek: 4, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
  { dayOfWeek: 5, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] },
  { dayOfWeek: 6, isOpen: false, timeSlots: [] },
];

export default function ScheduleManagerPage() {
  const { therapist, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => {
    return ["appointments", "weekly", "overrides", "blocked"].includes(tabParam)
      ? tabParam
      : "weekly";
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Badges State
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [overridesCount, setOverridesCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);

  // Form State
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [sessionDurations, setSessionDurations] = useState([30, 45, 60, 90]);
  const [bufferTimeMinutes, setBufferTimeMinutes] = useState(15);
  const [noticePeriodHours, setNoticePeriodHours] = useState(2);
  const [bookingWindowDays, setBookingWindowDays] = useState(60);
  const [weeklySchedule, setWeeklySchedule] = useState(buildDefaultSchedule);

  // Initial badge count fetch
  useEffect(() => {
    let isMounted = true;

    axiosInstance
      .get("/scheduling/bookings")
      .then((res) => {
        if (isMounted && Array.isArray(res.data?.data)) {
          const now = new Date();
          const upcoming = res.data.data.filter(
            (b) => b.status === "confirmed" && new Date(b.startTime) >= now
          ).length;
          setAppointmentsCount(upcoming);
        }
      })
      .catch(() => {});

    axiosInstance
      .get("/scheduling/overrides")
      .then((res) => {
        if (isMounted && res.data?.data) {
          setOverridesCount(res.data.data.length);
        }
      })
      .catch(() => {});

    axiosInstance
      .get("/scheduling/blocks")
      .then((res) => {
        if (isMounted && res.data?.data) {
          setBlockedCount(res.data.data.length);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Fetch current availability on mount
  useEffect(() => {
    let isMounted = true;

    const fetchAvailability = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        const res = await axiosInstance.get("/scheduling/availability");

        if (isMounted && res.data?.data) {
          const data = res.data.data;
          if (data.timezone) setTimezone(data.timezone);
          if (Array.isArray(data.sessionDurations) && data.sessionDurations.length > 0) {
            setSessionDurations(data.sessionDurations);
          }
          if (typeof data.bufferTimeMinutes === "number") {
            setBufferTimeMinutes(data.bufferTimeMinutes);
          }
          if (typeof data.noticePeriodHours === "number") {
            setNoticePeriodHours(data.noticePeriodHours);
          }
          if (typeof data.bookingWindowDays === "number") {
            setBookingWindowDays(data.bookingWindowDays);
          }
          if (Array.isArray(data.weeklySchedule) && data.weeklySchedule.length === 7) {
            // Sort to ensure days 0 to 6 exist
            const normalized = Array.from({ length: 7 }, (_, i) => {
              const found = data.weeklySchedule.find((d) => d.dayOfWeek === i);
              return (
                found || {
                  dayOfWeek: i,
                  isOpen: false,
                  timeSlots: [],
                }
              );
            });
            setWeeklySchedule(normalized);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(
            err.response?.data?.message ||
              err.message ||
              "Unable to load current availability settings."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAvailability();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Day Toggle Handler
  const toggleDayOpen = (dayIndex) => {
    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek === dayIndex) {
          const nextIsOpen = !day.isOpen;
          return {
            ...day,
            isOpen: nextIsOpen,
            timeSlots:
              nextIsOpen && (!day.timeSlots || day.timeSlots.length === 0)
                ? [{ startTime: "09:00", endTime: "17:00" }]
                : day.timeSlots,
          };
        }
        return day;
      })
    );
  };

  // 3. Time Slot Update Handler
  const updateSlotTime = (dayIndex, slotIndex, field, value) => {
    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek === dayIndex) {
          const nextSlots = [...day.timeSlots];
          nextSlots[slotIndex] = {
            ...nextSlots[slotIndex],
            [field]: value,
          };
          return { ...day, timeSlots: nextSlots };
        }
        return day;
      })
    );
  };

  // 4. Add split time slot
  const addTimeSlot = (dayIndex) => {
    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek === dayIndex) {
          const lastSlot = day.timeSlots[day.timeSlots.length - 1];
          const newStart = lastSlot ? lastSlot.endTime : "09:00";
          return {
            ...day,
            timeSlots: [
              ...day.timeSlots,
              { startTime: newStart, endTime: "17:00" },
            ],
          };
        }
        return day;
      })
    );
  };

  // 5. Remove split time slot
  const removeTimeSlot = (dayIndex, slotIndex) => {
    setWeeklySchedule((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek === dayIndex) {
          const nextSlots = day.timeSlots.filter((_, idx) => idx !== slotIndex);
          return {
            ...day,
            timeSlots: nextSlots,
            isOpen: nextSlots.length > 0 ? day.isOpen : false,
          };
        }
        return day;
      })
    );
  };

  // 6. Session Duration Toggle
  const toggleDuration = (duration) => {
    setSessionDurations((prev) => {
      if (prev.includes(duration)) {
        if (prev.length === 1) return prev; // Keep at least one duration
        return prev.filter((d) => d !== duration);
      }
      return [...prev, duration].sort((a, b) => a - b);
    });
  };

  // 7. Validation
  const validate = () => {
    if (sessionDurations.length === 0) {
      setErrorMessage("Please select at least one supported session duration.");
      return false;
    }

    for (const day of weeklySchedule) {
      if (day.isOpen && Array.isArray(day.timeSlots)) {
        if (day.timeSlots.length === 0) {
          const dayName = DAYS_OF_WEEK.find((d) => d.index === day.dayOfWeek)?.name;
          setErrorMessage(`${dayName} is marked open but has no consulting hours configured.`);
          return false;
        }

        for (let i = 0; i < day.timeSlots.length; i++) {
          const slot = day.timeSlots[i];
          if (slot.startTime >= slot.endTime) {
            const dayName = DAYS_OF_WEEK.find((d) => d.index === day.dayOfWeek)?.name;
            setErrorMessage(
              `Invalid time range on ${dayName}: end time (${slot.endTime}) must be after start time (${slot.startTime}).`
            );
            return false;
          }

          for (let j = i + 1; j < day.timeSlots.length; j++) {
            const other = day.timeSlots[j];
            if (slot.startTime < other.endTime && slot.endTime > other.startTime) {
              const dayName = DAYS_OF_WEEK.find((d) => d.index === day.dayOfWeek)?.name;
              setErrorMessage(
                `Overlapping intervals detected on ${dayName} (${slot.startTime}-${slot.endTime} and ${other.startTime}-${other.endTime}).`
              );
              return false;
            }
          }
        }
      }
    }

    if (noticePeriodHours < 0 || noticePeriodHours > 168) {
      setErrorMessage("Notice period must be between 0 and 168 hours.");
      return false;
    }

    if (bookingWindowDays < 1 || bookingWindowDays > 365) {
      setErrorMessage("Booking window must be between 1 and 365 days.");
      return false;
    }

    return true;
  };

  // 8. Submit Payload
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!validate()) return;

    try {
      setIsSaving(true);

      const payload = {
        timezone,
        sessionDurations,
        bufferTimeMinutes: Number(bufferTimeMinutes),
        noticePeriodHours: Number(noticePeriodHours),
        bookingWindowDays: Number(bookingWindowDays),
        weeklySchedule: weeklySchedule.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          isOpen: d.isOpen,
          timeSlots: d.isOpen ? d.timeSlots : [],
        })),
      };

      const res = await axiosInstance.put("/scheduling/availability", payload);

      if (res.data?.success) {
        setSuccessMessage("Your weekly availability and practice settings have been updated.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          "Failed to save availability settings. Please check your inputs."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C2520] flex flex-col font-sans selection:bg-[#234E39]/15 selection:text-[#1B3B2B]">
      {/* Top Navigation */}
      <header className="w-full bg-white border-b border-[#EBE3D7] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1B3B2B] flex items-center justify-center text-[#FAF7F2]">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm tracking-tight text-[#1B3B2B]">
                  Unfazed
                </span>
                <span className="text-[10px] text-[#717E76] -mt-0.5">
                  Practice Workspace
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              ← Dashboard
            </Link>
            <Link
              to="/clients"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Clients
            </Link>
            <Link
              to="/packages"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Packages
            </Link>
            <Link
              to="/payments"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Billing
            </Link>
            <Link
              to="/analytics"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Analytics
            </Link>
            <Link
              to="/profile"
              className="text-xs font-medium text-[#4C5B52] hover:text-[#1B3B2B] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-[#7D3232] hover:text-[#5F2424] bg-[#FDF4F4] hover:bg-[#FAE8E8] border border-[#F2D1D1] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
        {/* Header Breadcrumbs & Title */}
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-xs text-[#717E76]">
            <Link to="/" className="hover:underline">Workspace</Link>
            <span>/</span>
            <span className="text-[#1B3B2B] font-medium">Availability & Schedule</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif text-[#14261D] tracking-tight">
                {activeTab === "appointments" && "Client Appointments"}
                {activeTab === "weekly" && "Weekly Recurring Schedule"}
                {activeTab === "overrides" && "One-Time Date Overrides"}
                {activeTab === "blocked" && "Blocked Time Slots"}
              </h1>
              <p className="text-xs sm:text-sm text-[#4E5C53] mt-1">
                {activeTab === "appointments" &&
                  "Review scheduled client bookings, inspect session details, or cancel upcoming appointments."}
                {activeTab === "weekly" &&
                  "Configure your practice timezone, standard working hours, session durations, and buffers."}
                {activeTab === "overrides" &&
                  "Set single-day off days or custom working hours for holidays and vacations."}
                {activeTab === "blocked" &&
                  "Block specific intraday intervals (e.g. personal appointments or clinical supervision)."}
              </p>
            </div>

            {therapist?.slug && (
              <Link
                to={`/${therapist.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#1E4D32] bg-[#EBF3ED] hover:bg-[#DEEDE2] border border-[#CDE3D5] px-3.5 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5 w-fit"
              >
                <span>View Public Page</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E8DFD3] pb-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("appointments");
              setSearchParams({ tab: "appointments" });
              setSuccessMessage("");
              setErrorMessage("");
            }}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "appointments"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-white text-[#45544B] border border-[#DDD5C7] hover:bg-[#F3EFEA]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Appointments</span>
            {appointmentsCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  activeTab === "appointments"
                    ? "bg-white/20 text-white"
                    : "bg-[#EBF3ED] text-[#1E4D32]"
                }`}
              >
                {appointmentsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("weekly");
              setSearchParams({ tab: "weekly" });
              setSuccessMessage("");
              setErrorMessage("");
            }}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "weekly"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-white text-[#45544B] border border-[#DDD5C7] hover:bg-[#F3EFEA]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Weekly Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("overrides");
              setSearchParams({ tab: "overrides" });
              setSuccessMessage("");
              setErrorMessage("");
            }}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "overrides"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-white text-[#45544B] border border-[#DDD5C7] hover:bg-[#F3EFEA]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Date Overrides</span>
            {overridesCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  activeTab === "overrides"
                    ? "bg-white/20 text-white"
                    : "bg-[#EBF3ED] text-[#1E4D32]"
                }`}
              >
                {overridesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("blocked");
              setSearchParams({ tab: "blocked" });
              setSuccessMessage("");
              setErrorMessage("");
            }}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "blocked"
                ? "bg-[#1B3B2B] text-white shadow-xs"
                : "bg-white text-[#45544B] border border-[#DDD5C7] hover:bg-[#F3EFEA]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span>Blocked Time Slots</span>
            {blockedCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  activeTab === "blocked"
                    ? "bg-white/20 text-white"
                    : "bg-[#FAF0E6] text-[#784A1A]"
                }`}
              >
                {blockedCount}
              </span>
            )}
          </button>
        </div>

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

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="bg-white border border-[#E9DFD2] rounded-2xl p-8 animate-pulse flex flex-col gap-6">
            <div className="h-6 bg-[#FAF7F2] rounded w-1/3"></div>
            <div className="h-10 bg-[#FAF7F2] rounded"></div>
            <div className="h-40 bg-[#FAF7F2] rounded"></div>
          </div>
        ) : (
          <>
            {/* TAB 1: WEEKLY RECURRING SCHEDULE */}
            {activeTab === "weekly" && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* CARD 1: GENERAL SCHEDULING PREFERENCES */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B3B2B]">
                  General Settings
                </h2>
                <p className="text-xs text-[#5D6D63] mt-0.5">
                  Universal constraints applied across your booking calendar.
                </p>
              </div>

              {/* Practice Timezone Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                  Practice Timezone <span className="text-[#A23333]">*</span>
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                  {/* Keep current custom timezone if not in predefined list */}
                  {!COMMON_TIMEZONES.some((tz) => tz.value === timezone) && (
                    <option value={timezone}>{timezone} (Current)</option>
                  )}
                </select>
                <p className="text-[11px] text-[#6F7D74]">
                  All recurring working hours below are configured according to this timezone.
                </p>
              </div>

              {/* Supported Session Durations */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[#F0EAE2]">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                  Offered Session Durations <span className="text-[#A23333]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[30, 45, 60, 90].map((dur) => {
                    const isSelected = sessionDurations.includes(dur);
                    return (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => toggleDuration(dur)}
                        className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-medium border text-center transition-all cursor-pointer flex items-center justify-center gap-2 ${
                          isSelected
                            ? "bg-[#1B3B2B] text-white border-[#1B3B2B] shadow-xs"
                            : "bg-[#FCFAF7] text-[#3D4B42] border-[#DCD4C7] hover:bg-[#F3EFEA]"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-[#8BE1AC]" : "bg-[#B4BFB8]"}`}></span>
                        <span>{dur} minutes</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#6F7D74]">
                  Select the durations clients can book with you. (At least one required).
                </p>
              </div>

              {/* Inter-Session Buffer Time */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-[#F0EAE2]">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                  Buffer Between Sessions
                </label>
                <select
                  value={bufferTimeMinutes}
                  onChange={(e) => setBufferTimeMinutes(Number(e.target.value))}
                  className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value={0}>0 minutes (No buffer)</option>
                  <option value={15}>15 minutes (Standard recommendation)</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes (1 hour)</option>
                </select>
                <p className="text-[11px] text-[#6F7D74]">
                  Automatically reserves resting and note-taking time after every appointment before another client can book.
                </p>
              </div>

              {/* Advance Notice & Booking Window */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#F0EAE2]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                    Minimum Advance Notice (Hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    value={noticePeriodHours}
                    onChange={(e) => setNoticePeriodHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
                  />
                  <p className="text-[11px] text-[#6F7D74]">
                    Prevents last-minute bookings within this window (e.g. 2 hours).
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#3E4A43]">
                    Maximum Future Horizon (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={bookingWindowDays}
                    onChange={(e) => setBookingWindowDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-4 py-3 text-sm rounded-xl bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:ring-2 focus:ring-[#1B3B2B]/15 focus:outline-none transition-colors"
                  />
                  <p className="text-[11px] text-[#6F7D74]">
                    Furthest date into the future clients are permitted to schedule (e.g. 60 days).
                  </p>
                </div>
              </div>
            </div>

            {/* CARD 2: RECURRING WEEKLY HOURS (7 DAYS) */}
            <div className="bg-white border border-[#E9DFD2] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B3B2B]">
                  Weekly Consulting Hours
                </h2>
                <p className="text-xs text-[#5D6D63] mt-0.5">
                  Set standard working intervals for each day of the week. Times are 15-minute aligned.
                </p>
              </div>

              <div className="flex flex-col divide-y divide-[#F0EAE2]">
                {DAYS_OF_WEEK.map(({ index: dayIndex, name: dayName }) => {
                  const dayConfig = weeklySchedule.find((d) => d.dayOfWeek === dayIndex) || {
                    dayOfWeek: dayIndex,
                    isOpen: false,
                    timeSlots: [],
                  };

                  return (
                    <div
                      key={dayIndex}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                    >
                      {/* Day Label & Toggle */}
                      <div className="w-44 flex items-center justify-between sm:justify-start gap-3">
                        <span className="text-sm font-medium text-[#1E3B2C] w-28">
                          {dayName}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleDayOpen(dayIndex)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            dayConfig.isOpen ? "bg-[#1B3B2B]" : "bg-[#D8D0C4]"
                          }`}
                          role="switch"
                          aria-checked={dayConfig.isOpen}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              dayConfig.isOpen ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Time Slots Area */}
                      <div className="flex-1 flex flex-col gap-2.5">
                        {dayConfig.isOpen ? (
                          <>
                            {dayConfig.timeSlots.map((slot, slotIndex) => (
                              <div
                                key={`${dayIndex}-slot-${slotIndex}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <div className="flex items-center gap-2">
                                  <select
                                    value={slot.startTime}
                                    onChange={(e) =>
                                      updateSlotTime(dayIndex, slotIndex, "startTime", e.target.value)
                                    }
                                    className="px-3 py-2 text-xs rounded-lg bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:outline-none cursor-pointer"
                                  >
                                    {TIME_OPTIONS.slice(0, -1).map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>

                                  <span className="text-xs text-[#7A887F]">to</span>

                                  <select
                                    value={slot.endTime}
                                    onChange={(e) =>
                                      updateSlotTime(dayIndex, slotIndex, "endTime", e.target.value)
                                    }
                                    className="px-3 py-2 text-xs rounded-lg bg-[#FCFAF7] border border-[#DCD4C7] text-[#1C2520] focus:border-[#1B3B2B] focus:outline-none cursor-pointer"
                                  >
                                    {TIME_OPTIONS.slice(1).map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {dayConfig.timeSlots.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeTimeSlot(dayIndex, slotIndex)}
                                    className="text-xs text-[#8A3B3B] hover:text-[#5F2424] p-1.5 hover:bg-[#FDF4F4] rounded-lg transition-colors cursor-pointer"
                                    title="Remove this interval"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => addTimeSlot(dayIndex)}
                              className="text-xs font-medium text-[#1B3B2B] hover:underline underline-offset-4 w-fit flex items-center gap-1 mt-1 cursor-pointer"
                            >
                              <span>+ Add split shift / interval</span>
                            </button>
                          </>
                        ) : (
                          <div className="py-2 text-xs text-[#8E9B93] italic">
                            Closed / Unavailable
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <Link
                to="/"
                className="text-xs font-medium text-[#5E6D64] hover:text-[#1B3B2B] px-4 py-3 rounded-xl border border-[#D9D1C5] hover:bg-[#F3EFEA] transition-colors"
              >
                Cancel
              </Link>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                className="w-auto px-8"
              >
                Save Availability Settings
              </Button>
            </div>
          </form>
        )}

        {/* TAB 1: CLIENT APPOINTMENTS */}
        {activeTab === "appointments" && (
          <AppointmentsManager
            timezone={timezone}
            onCountUpdate={setAppointmentsCount}
          />
        )}

        {/* TAB 2: ONE-TIME DATE OVERRIDES */}
        {activeTab === "overrides" && (
          <DateOverridesManager
            timezone={timezone}
            onCountUpdate={setOverridesCount}
          />
        )}

        {/* TAB 3: BLOCKED TIME SLOTS */}
        {activeTab === "blocked" && (
          <BlockedSlotsManager
            timezone={timezone}
            onCountUpdate={setBlockedCount}
          />
        )}
      </>
    )}
      </main>
    </div>
  );
}

