const mongoose = require("mongoose");
const { isValidTimezone, is15MinAligned } = require("../utils/timezoneUtils");

const timeSlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: [true, "Start time is required (HH:mm)"],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in 24h format HH:mm"],
      validate: {
        validator: is15MinAligned,
        message: "Start time must be aligned to a 15-minute boundary (:00, :15, :30, :45)",
      },
    },
    endTime: {
      type: String,
      required: [true, "End time is required (HH:mm)"],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in 24h format HH:mm"],
      validate: {
        validator: is15MinAligned,
        message: "End time must be aligned to a 15-minute boundary (:00, :15, :30, :45)",
      },
    },
  },
  { _id: false }
);

const dayScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0, // 0 = Sunday
      max: 6, // 6 = Saturday
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    timeSlots: {
      type: [timeSlotSchema],
      default: [],
      validate: {
        validator: function (slots) {
          if (!slots || slots.length === 0) return true;
          // Validate each slot has endTime > startTime and no overlapping intervals
          for (let i = 0; i < slots.length; i++) {
            if (slots[i].startTime >= slots[i].endTime) {
              return false;
            }
            for (let j = i + 1; j < slots.length; j++) {
              if (
                slots[i].startTime < slots[j].endTime &&
                slots[i].endTime > slots[j].startTime
              ) {
                return false; // Overlap detected
              }
            }
          }
          return true;
        },
        message: "Time slots must have endTime > startTime and cannot overlap with each other.",
      },
    },
  },
  { _id: false }
);

// Standard default schedule: Mon - Fri, 09:00 - 17:00
const getDefaultWeeklySchedule = () => [
  { dayOfWeek: 0, isOpen: false, timeSlots: [] }, // Sun
  { dayOfWeek: 1, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] }, // Mon
  { dayOfWeek: 2, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] }, // Tue
  { dayOfWeek: 3, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] }, // Wed
  { dayOfWeek: 4, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] }, // Thu
  { dayOfWeek: 5, isOpen: true, timeSlots: [{ startTime: "09:00", endTime: "17:00" }] }, // Fri
  { dayOfWeek: 6, isOpen: false, timeSlots: [] }, // Sat
];

const availabilitySchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: true,
      unique: true,
      index: true,
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Kolkata",
      validate: {
        validator: isValidTimezone,
        message: "Invalid IANA timezone identifier (e.g. 'Asia/Kolkata', 'America/New_York').",
      },
    },
    sessionDurations: {
      type: [Number],
      default: [30, 45, 60, 90],
      validate: {
        validator: function (durations) {
          if (!Array.isArray(durations) || durations.length === 0) return false;
          const allowed = new Set([30, 45, 60, 90]);
          return durations.every((d) => allowed.has(d));
        },
        message: "Session durations must be a non-empty subset of [30, 45, 60, 90] minutes.",
      },
    },
    bufferTimeMinutes: {
      type: Number,
      default: 15,
      enum: [0, 15, 30, 45, 60],
    },
    noticePeriodHours: {
      type: Number,
      default: 2,
      min: [0, "Notice period cannot be negative"],
      max: [168, "Notice period cannot exceed 168 hours (7 days)"],
    },
    bookingWindowDays: {
      type: Number,
      default: 60,
      min: [1, "Booking window must be at least 1 day"],
      max: [365, "Booking window cannot exceed 365 days"],
    },
    weeklySchedule: {
      type: [dayScheduleSchema],
      default: getDefaultWeeklySchedule,
    },
  },
  { timestamps: true }
);

const Availability =
  mongoose.models.Availability || mongoose.model("Availability", availabilitySchema);

module.exports = Availability;
