const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    therapistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: [true, "Therapist ID is required"],
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: [true, "Client ID is required"],
      index: true,
    },
    senderType: {
      type: String,
      enum: {
        values: ["therapist", "client"],
        message: "Sender type must be either 'therapist' or 'client'",
      },
      required: [true, "Sender type is required"],
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    senderName: {
      type: String,
      required: [true, "Sender name is required"],
      trim: true,
      maxlength: [100, "Sender name cannot exceed 100 characters"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [5000, "Message content cannot exceed 5000 characters"],
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying chronological message thread between a therapist and client
messageSchema.index({ therapistId: 1, clientId: 1, createdAt: 1 });
messageSchema.index({ clientId: 1, read: 1 });

const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

module.exports = Message;
