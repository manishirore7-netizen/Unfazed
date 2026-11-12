const mongoose = require("mongoose");

/**
 * Package Schema
 * Represents a session package/bundle created by a therapist (e.g. 5-session pack).
 * Price is stored in minor currency units (paise) for consistency with payment gateways.
 */
const packageSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: [true, "Therapist reference is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Package title is required"],
      trim: true,
      maxlength: [100, "Package title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Package description cannot exceed 1000 characters"],
    },
    sessionCount: {
      type: Number,
      required: [true, "Session count is required"],
      min: [1, "Package must contain at least 1 session"],
      validate: {
        validator: Number.isInteger,
        message: "Session count must be an integer",
      },
    },
    durationMinutes: {
      type: Number,
      required: [true, "Session duration is required"],
      enum: {
        values: [30, 45, 60, 90],
        message: "Duration must be 30, 45, 60, or 90 minutes",
      },
    },
    // Stored in paise (minor currency unit: ₹1 = 100 paise)
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Price must be an integer (in paise)",
      },
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100%"],
    },
    validityDays: {
      type: Number,
      required: [true, "Validity days is required"],
      default: 90,
      min: [1, "Validity must be at least 1 day"],
      validate: {
        validator: Number.isInteger,
        message: "Validity days must be an integer",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for active packages per therapist
packageSchema.index({ therapistId: 1, isActive: 1 });
packageSchema.index({ therapistId: 1, createdAt: -1 });

const Package = mongoose.models.Package || mongoose.model("Package", packageSchema);

module.exports = Package;
