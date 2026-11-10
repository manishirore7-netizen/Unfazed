/**
 * Date and Timezone Utilities for Unfazed Scheduling Frontend
 */

// Generate 15-minute time intervals from 00:00 to 23:45 plus 24:00 (midnight end)
export const TIME_OPTIONS = (() => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      options.push(`${hh}:${mm}`);
    }
  }
  options.push("24:00");
  return options;
})();

/**
 * Returns today's calendar date as "YYYY-MM-DD" in the specified timezone.
 * @param {string} timeZone - IANA timezone (e.g. "Asia/Kolkata")
 * @returns {string}
 */
export const getTodayDateString = (timeZone = "Asia/Kolkata") => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date()).map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return new Date().toISOString().split("T")[0];
  }
};

/**
 * Converts a local calendar date ("YYYY-MM-DD") and time ("HH:mm") in a specific timezone to an exact UTC ISO string.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timeStr - "HH:mm"
 * @param {string} timeZone - IANA timezone
 * @returns {string} - UTC ISO string (e.g. "2026-11-16T06:30:00.000Z")
 */
export const localToUtcIso = (dateStr, timeStr, timeZone = "Asia/Kolkata") => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  let candidateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  for (let i = 0; i < 4; i++) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(candidateUtc).map((p) => [p.type, p.value])
    );
    let h = parseInt(parts.hour, 10);
    if (h === 24) h = 0;

    const candidateLocalAsUtc = Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      h,
      parseInt(parts.minute, 10),
      0,
      0
    );
    const desiredLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diff = desiredLocalAsUtc - candidateLocalAsUtc;
    if (diff === 0) break;
    candidateUtc = new Date(candidateUtc.getTime() + diff);
  }

  return candidateUtc.toISOString();
};

/**
 * Formats a UTC ISO string in a given timezone.
 * @param {string} utcIsoStr
 * @param {string} timeZone
 * @returns {string} e.g. "Mon, Nov 16, 2026"
 */
export const formatUtcDate = (utcIsoStr, timeZone = "Asia/Kolkata") => {
  try {
    const d = new Date(utcIsoStr);
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return utcIsoStr;
  }
};

/**
 * Formats a start and end time interval in a given timezone.
 * @param {string} startUtcIso
 * @param {string} endUtcIso
 * @param {string} timeZone
 * @returns {string} e.g. "12:00 – 13:00"
 */
export const formatUtcTimeRange = (startUtcIso, endUtcIso, timeZone = "Asia/Kolkata") => {
  try {
    const start = new Date(startUtcIso);
    const end = new Date(endUtcIso);
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
  } catch {
    return `${startUtcIso} - ${endUtcIso}`;
  }
};

/**
 * Formats a start and end time interval into 12-hour format (e.g. "10:30 AM – 11:30 AM").
 * @param {string} startUtcIso
 * @param {string} endUtcIso
 * @param {string} timeZone
 * @returns {string}
 */
export const formatUtcTimeRange12h = (startUtcIso, endUtcIso, timeZone = "Asia/Kolkata") => {
  try {
    const start = new Date(startUtcIso);
    const end = new Date(endUtcIso);
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
  } catch {
    return `${startUtcIso} - ${endUtcIso}`;
  }
};

/**
 * Converts a 24-hour time string ("HH:mm") into a 12-hour string (e.g. "9:00 AM", "2:30 PM").
 * @param {string} time24h - "HH:mm"
 * @returns {string}
 */
export const formatTime12h = (time24h) => {
  if (!time24h || typeof time24h !== "string") return "";
  const [hStr, mStr] = time24h.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return time24h;
  const m = mStr || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

/**
 * Formats a calendar date string ("YYYY-MM-DD") into a human-friendly format (e.g. "Monday, Nov 16, 2026").
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
export const formatFriendlyDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dateObj);
  } catch {
    return dateStr;
  }
};

/**
 * Returns a future date string ("YYYY-MM-DD") N days from a base date.
 * @param {string} baseDateStr - "YYYY-MM-DD"
 * @param {number} daysToAdd
 * @returns {string}
 */
export const addDaysToDate = (baseDateStr, daysToAdd) => {
  try {
    const [year, month, day] = baseDateStr.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dayOfMonth}`;
  } catch {
    return baseDateStr;
  }
};

/**
 * Creates an "Add to Google Calendar" web link URL.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.startTimeIso - UTC ISO string
 * @param {string} options.endTimeIso - UTC ISO string
 * @param {string} [options.details]
 * @returns {string}
 */
export const createGoogleCalendarUrl = ({ title, startTimeIso, endTimeIso, details = "" }) => {
  try {
    const formatCalDate = (isoStr) => {
      return new Date(isoStr).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    };

    const start = formatCalDate(startTimeIso);
    const end = formatCalDate(endTimeIso);

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${start}/${end}`,
      details,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  } catch {
    return "#";
  }
};


