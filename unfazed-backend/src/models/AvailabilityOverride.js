const mongoose = require("mongoose");
const { is15MinAligned } = require("../utils/timezoneUtils");

const overrideTimeSlotSchema = new mongoose.Schema(
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

const availabilityOverrideSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: true,
      index: true,
    },
    // Calendar date in the therapist's local timezone (YYYY-MM-DD)
    date: {
      type: String,
      required: [true, "Date is required (YYYY-MM-DD)"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must match format YYYY-MM-DD"],
    },
    // If true, the therapist is taking the day off (no slots available)
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // Custom working hours for this specific date (when isBlocked is false)
    timeSlots: {
      type: [overrideTimeSlotSchema],
      default: [],
      validate: {
        validator: function (slots) {
          if (!slots || slots.length === 0) return true;
          for (let i = 0; i < slots.length; i++) {
            if (slots[i].startTime >= slots[i].endTime) {
              return false;
            }
            for (let j = i + 1; j < slots.length; j++) {
              if (
                slots[i].startTime < slots[j].endTime &&
                slots[i].endTime > slots[j].startTime
              ) {
                return false;
              }
            }
          }
          return true;
        },
        message: "Time slots must have endTime > startTime and cannot overlap with each other.",
      },
    },
    reason: {
      type: String,
      trim: true,
      default: "",
      maxlength: [200, "Reason cannot exceed 200 characters"],
    },
  },
  { timestamps: true }
);

// One override per date per therapist
availabilityOverrideSchema.index({ therapistId: 1, date: 1 }, { unique: true });

const AvailabilityOverride =
  mongoose.models.AvailabilityOverride ||
  mongoose.model("AvailabilityOverride", availabilityOverrideSchema);

module.exports = AvailabilityOverride;
