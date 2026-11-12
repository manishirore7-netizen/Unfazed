const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
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
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ["private", "shared"],
        message: "Note type must be either 'private' or 'shared'",
      },
      default: "private",
      required: [true, "Note type is required"],
      index: true,
    },
    template: {
      type: String,
      enum: {
        values: ["freeform", "soap", "dap", "girp", "birp"],
        message: "Template must be freeform, soap, dap, girp, or birp",
      },
      default: "freeform",
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
      maxlength: [200, "Note title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      required: [true, "Note content is required"],
      trim: true,
    },
    sharedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Manage sharedAt timestamp automatically when type is updated
noteSchema.pre("save", function () {
  if (this.isModified("type")) {
    if (this.type === "shared" && !this.sharedAt) {
      this.sharedAt = new Date();
    } else if (this.type === "private") {
      this.sharedAt = null;
    }
  }
});

// Compound indices for performant querying and strict tenancy scoping
noteSchema.index({ therapistId: 1, clientId: 1, createdAt: -1 });
noteSchema.index({ clientId: 1, type: 1, createdAt: -1 });
noteSchema.index({ therapistId: 1, bookingId: 1 });

const Note = mongoose.models.Note || mongoose.model("Note", noteSchema);

module.exports = Note;
