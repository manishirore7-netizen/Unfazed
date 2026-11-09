const mongoose = require("mongoose");
const { is15MinAligned } = require("../utils/timezoneUtils");

const blockedSlotSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required (UTC Date)"],
      validate: {
        validator: is15MinAligned,
        message: "Blocked start time must be aligned to a 15-minute boundary.",
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
        message:
          "Blocked end time must be after start time and aligned to a 15-minute boundary.",
      },
    },
    reason: {
      type: String,
      trim: true,
      default: "Blocked",
      maxlength: [200, "Reason cannot exceed 200 characters"],
    },
  },
  { timestamps: true }
);

blockedSlotSchema.index({ therapistId: 1, startTime: 1, endTime: 1 });

const BlockedSlot =
  mongoose.models.BlockedSlot || mongoose.model("BlockedSlot", blockedSlotSchema);

module.exports = BlockedSlot;
