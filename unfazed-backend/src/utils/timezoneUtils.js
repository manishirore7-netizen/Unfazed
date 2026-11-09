/**
 * Timezone & Date Utilities for Unfazed Scheduling
 * Handles IANA timezones, DST shifts, local-to-UTC conversions, and 15-minute quantum bucketing.
 */

/**
 * Validates whether a given string is a valid IANA timezone identifier.
 * @param {string} timeZone
 * @returns {boolean}
 */
const isValidTimezone = (timeZone) => {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Extracts localized calendar and time parts from a UTC Date in a given timezone.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {{ year: number, month: number, day: number, dateString: string, hour: number, minute: number, second: number, timeString: string, dayOfWeek: number }}
 */
const getLocalParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // Standard 24:00 normalization to 00:00

  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);
  const dateString = `${parts.year}-${parts.month}-${parts.day}`;
  const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    dateString,
    hour,
    minute,
    second,
    timeString,
    dayOfWeek: weekdayMap[parts.weekday],
  };
};

/**
 * Converts a local calendar date ("YYYY-MM-DD") and time ("HH:mm") in a specific timezone into a canonical UTC Date.
 * Accurately detects and rejects invalid or non-existent local times (e.g. DST spring-forward gaps).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timeStr - "HH:mm" (24-hour)
 * @param {string} timeZone - IANA timezone string
 * @returns {Date}
 */
const getUtcFromLocal = (dateStr, timeStr, timeZone) => {
  if (!isValidTimezone(timeZone)) {
    throw new Error(`Invalid IANA timezone: "${timeZone}"`);
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hour) ||
    isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Malformed date/time format: "${dateStr} ${timeStr}"`);
  }

  // Initial naive UTC approximation
  let candidateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // Iteratively converge to account for timezone offset and DST
  for (let i = 0; i < 4; i++) {
    const local = getLocalParts(candidateUtc, timeZone);
    const candidateLocalAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
      0
    );
    const desiredLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diff = desiredLocalAsUtc - candidateLocalAsUtc;
    if (diff === 0) break;
    candidateUtc = new Date(candidateUtc.getTime() + diff);
  }

  // Validate that the resulting UTC date rounds back to the requested local date & time
  const finalLocal = getLocalParts(candidateUtc, timeZone);
  if (finalLocal.dateString !== dateStr || finalLocal.timeString !== timeStr) {
    throw new Error(
      `Invalid or non-existent local time "${dateStr} ${timeStr}" in timezone "${timeZone}" (e.g., Daylight Saving transition gap).`
    );
  }

  return candidateUtc;
};

/**
 * Checks whether a given Date or "HH:mm" time string is aligned to a 15-minute boundary.
 * @param {Date|string} value
 * @returns {boolean}
 */
const is15MinAligned = (value) => {
  if (value instanceof Date) {
    return (
      value.getUTCMinutes() % 15 === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    );
  }
  if (typeof value === "string") {
    const parts = value.split(":");
    if (parts.length < 2) return false;
    const minutes = parseInt(parts[1], 10);
    return !isNaN(minutes) && minutes % 15 === 0;
  }
  return false;
};

/**
 * Generates an array of discrete 15-minute ISO UTC bucket strings covering the session + buffer duration.
 * Example: 10:00 (45m duration + 15m buffer) -> ['10:00', '10:15', '10:30', '10:45'] (represented in UTC ISO strings).
 * @param {Date} startTime - UTC Date (must be 15-minute aligned)
 * @param {number} durationMinutes - 30, 45, 60, or 90
 * @param {number} bufferMinutes - e.g. 0, 15, 30
 * @returns {string[]} Array of UTC ISO strings
 */
const generateBookedBuckets = (startTime, durationMinutes, bufferMinutes = 0) => {
  const startMs = startTime.getTime();
  const totalMinutes = durationMinutes + bufferMinutes;
  const totalMs = totalMinutes * 60 * 1000;
  const stepMs = 15 * 60 * 1000; // 15-minute quantum

  const buckets = [];
  for (let current = startMs; current < startMs + totalMs; current += stepMs) {
    buckets.push(new Date(current).toISOString());
  }
  return buckets;
};

module.exports = {
  isValidTimezone,
  getLocalParts,
  getUtcFromLocal,
  is15MinAligned,
  generateBookedBuckets,
};
