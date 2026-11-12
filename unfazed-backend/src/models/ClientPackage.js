const mongoose = require("mongoose");

/**
 * ClientPackage Schema
 * Represents an instance of a package purchased by a client.
 * Tracks total, used, and remaining session credits and expiration.
 */
const clientPackageSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: [true, "Therapist reference is required"],
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client reference is required"],
      index: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: [true, "Package reference is required"],
      index: true,
    },
    totalSessions: {
      type: Number,
      required: [true, "Total sessions count is required"],
      min: [1, "Total sessions must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Total sessions must be an integer",
      },
    },
    usedSessions: {
      type: Number,
      default: 0,
      min: [0, "Used sessions cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Used sessions must be an integer",
      },
    },
    remainingSessions: {
      type: Number,
      required: [true, "Remaining sessions is required"],
      min: [0, "Remaining sessions cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Remaining sessions must be an integer",
      },
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
      validate: {
        validator: function (val) {
          return val instanceof Date && !isNaN(val.getTime());
        },
        message: "Invalid expiration date",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["active", "exhausted", "expired"],
        message: "Status must be active, exhausted, or expired",
      },
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-calculate remainingSessions and sync status before validation
clientPackageSchema.pre("validate", function () {
  if (this.totalSessions != null && this.usedSessions != null) {
    if (this.remainingSessions == null) {
      this.remainingSessions = Math.max(0, this.totalSessions - this.usedSessions);
    }
  }

  // Update status based on balance or expiration
  if (this.remainingSessions === 0) {
    this.status = "exhausted";
  } else if (this.expiresAt && new Date() > this.expiresAt && this.status === "active") {
    this.status = "expired";
  }
});

// Custom validator: usedSessions + remainingSessions must equal totalSessions
clientPackageSchema.path("remainingSessions").validate(function (value) {
  if (this.totalSessions != null && this.usedSessions != null && value != null) {
    return this.usedSessions + value === this.totalSessions;
  }
  return true;
}, "Used sessions plus remaining sessions must equal total sessions.");

// Indexes for tenant and client balance queries
clientPackageSchema.index({ therapistId: 1, clientId: 1, status: 1 });
clientPackageSchema.index({ clientId: 1, status: 1 });
clientPackageSchema.index({ expiresAt: 1 });

const ClientPackage =
  mongoose.models.ClientPackage || mongoose.model("ClientPackage", clientPackageSchema);

module.exports = ClientPackage;
