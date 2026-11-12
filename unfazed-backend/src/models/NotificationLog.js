const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: [true, "Therapist ID is required"],
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },
    recipientName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },
    recipientEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    recipientPhone: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: {
        values: ["booking_confirmed", "reminder_24h", "post_session_followup"],
        message: "Notification type must be booking_confirmed, reminder_24h, or post_session_followup",
      },
      required: [true, "Notification type is required"],
      index: true,
    },
    channel: {
      type: String,
      enum: ["whatsapp", "email"],
      default: "whatsapp",
      index: true,
    },
    status: {
      type: String,
      enum: ["logged", "sent", "failed"],
      default: "sent",
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, "Notification message content is required"],
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate notifications of the same type and channel for the same booking
notificationLogSchema.index(
  { bookingId: 1, type: 1, channel: 1 },
  { unique: true, sparse: true }
);

notificationLogSchema.index({ therapistId: 1, createdAt: -1 });

const NotificationLog =
  mongoose.models.NotificationLog ||
  mongoose.model("NotificationLog", notificationLogSchema);

module.exports = NotificationLog;
