const mongoose = require("mongoose");
const { CURRENCY } = require("../config/paymentConfig");

/**
 * Payment Schema
 * Immutable transaction ledger for appointments and package purchases.
 * All monetary amounts are recorded in minor currency units (paise: ₹1 = 100 paise).
 */
const paymentSchema = new mongoose.Schema(
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
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    clientPackageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientPackage",
      default: null,
      index: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      default: null,
      index: true,
    },
    itemType: {
      type: String,
      required: [true, "Item type is required"],
      enum: {
        values: ["single_session", "package"],
        message: "Item type must be either single_session or package",
      },
      index: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    // Gross transaction amount in paise
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Payment amount cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Payment amount must be an integer (in paise)",
      },
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      default: CURRENCY || "INR",
      uppercase: true,
      trim: true,
    },
    // Platform commission fee in paise
    platformFee: {
      type: Number,
      required: [true, "Platform fee is required"],
      default: 0,
      min: [0, "Platform fee cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Platform fee must be an integer (in paise)",
      },
    },
    // Net earnings for therapist in paise (amount - deductions)
    netTherapistAmount: {
      type: Number,
      required: [true, "Net therapist amount is required"],
      min: [0, "Net therapist amount cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Net therapist amount must be an integer (in paise)",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["created", "captured", "failed", "refunded"],
        message: "Status must be created, captured, failed, or refunded",
      },
      default: "created",
      index: true,
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: "",
    },
    invoiceNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Consistency check: Net therapist amount + platformFee must not exceed gross amount
paymentSchema.pre("validate", function () {
  if (this.amount != null && this.platformFee != null && this.netTherapistAmount == null) {
    this.netTherapistAmount = Math.max(0, this.amount - this.platformFee);
  }
});

paymentSchema.path("netTherapistAmount").validate(function (value) {
  if (this.amount != null && value != null) {
    return value <= this.amount;
  }
  return true;
}, "Net therapist amount cannot exceed total payment amount.");

// Tenant and reporting indexes
paymentSchema.index({ therapistId: 1, status: 1 });
paymentSchema.index({ clientId: 1, status: 1 });
paymentSchema.index({ therapistId: 1, createdAt: -1 });

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

module.exports = Payment;
