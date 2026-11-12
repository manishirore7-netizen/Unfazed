const mongoose = require("mongoose");
const { is15MinAligned } = require("../utils/timezoneUtils");

const bookingSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
    },
    clientName: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      maxlength: [100, "Client name cannot exceed 100 characters"],
    },
    clientEmail: {
      type: String,
      required: [true, "Client email is required"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    clientPhone: {
      type: String,
      trim: true,
      default: "",
      maxlength: [25, "Phone number cannot exceed 25 characters"],
    },
    clientNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    duration: {
      type: Number,
      required: [true, "Session duration is required"],
      enum: {
        values: [30, 45, 60, 90],
        message: "Duration must be 30, 45, 60, or 90 minutes",
      },
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required (UTC Date)"],
      validate: {
        validator: is15MinAligned,
        message: "Booking start time must be aligned to a 15-minute boundary.",
      },
    },
    endTime: {
      type: Date,
      required: [true, "End time is required (UTC Date)"],
      validate: {
        validator: function (value) {
          if (!is15MinAligned(value)) return false;
          return this.startTime ? value > this.startTime : true;
        },
        message: "Booking end time must be after start time and aligned to 15 minutes.",
      },
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "completed"],
      default: "confirmed",
      index: true,
    },
    // Optional payment integration fields (Module 4)
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "package_credit", "waived"],
      default: "unpaid",
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    clientPackageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientPackage",
      default: null,
      index: true,
    },
    // Discrete 15-minute time tokens representing the occupied duration and buffer
    bookedBuckets: {
      type: [String],
      required: true,
    },
  },
  { timestamps: true }
);

/**
 * CONCURRENCY PROTECTION INDEX:
 * Unique compound multikey index on therapistId and bookedBuckets.
 * Restricted to confirmed bookings via partialFilterExpression.
 * Guarantees that no two overlapping confirmed bookings can ever exist for the same therapist,
 * preventing race conditions at the database storage engine layer.
 */
bookingSchema.index(
  { therapistId: 1, bookedBuckets: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "confirmed" },
  }
);

// Fast range lookup index for calendar queries
bookingSchema.index({ therapistId: 1, startTime: 1, endTime: 1, status: 1 });

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

module.exports = Booking;
