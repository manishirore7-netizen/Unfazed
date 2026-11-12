const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    therapist_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Therapist",
      required: [true, "Therapist ID is required"],
      index: true,
      alias: "therapistId",
    },
    name: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      maxlength: [100, "Client name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Client email is required"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: [25, "Phone number cannot exceed 25 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "lead", "archived", "discharged"],
        message: "Status must be active, inactive, lead, archived, or discharged",
      },
      default: "active",
      index: true,
    },
    tags: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },
    // Demographics
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      trim: true,
      default: "",
      maxlength: [50, "Gender cannot exceed 50 characters"],
    },
    pronouns: {
      type: String,
      trim: true,
      default: "",
      maxlength: [50, "Pronouns cannot exceed 50 characters"],
    },
    preferredLanguage: {
      type: String,
      trim: true,
      default: "English",
      maxlength: [50, "Preferred language cannot exceed 50 characters"],
    },
    occupation: {
      type: String,
      trim: true,
      default: "",
      maxlength: [100, "Occupation cannot exceed 100 characters"],
    },
    emergencyContact: {
      name: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "Emergency contact name cannot exceed 100 characters"],
      },
      relationship: {
        type: String,
        trim: true,
        default: "",
        maxlength: [50, "Emergency contact relationship cannot exceed 50 characters"],
      },
      phone: {
        type: String,
        trim: true,
        default: "",
        maxlength: [25, "Emergency contact phone cannot exceed 25 characters"],
      },
    },
    address: {
      street: { type: String, trim: true, default: "", maxlength: 200 },
      city: { type: String, trim: true, default: "", maxlength: 100 },
      state: { type: String, trim: true, default: "", maxlength: 100 },
      postalCode: { type: String, trim: true, default: "", maxlength: 20 },
      country: { type: String, trim: true, default: "", maxlength: 100 },
    },
    // Clinical & Intake context
    presentingConcern: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Presenting concern cannot exceed 2000 characters"],
    },
    relevantHistory: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Relevant history cannot exceed 5000 characters"],
    },
    medicalHistory: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Medical history cannot exceed 3000 characters"],
    },
    mentalHealthHistory: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Mental health history cannot exceed 3000 characters"],
    },
    currentMedications: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Current medications cannot exceed 2000 characters"],
    },
    goals: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Goals cannot exceed 2000 characters"],
    },
    // Digital Intake Workflow Tracking
    intakeStatus: {
      type: String,
      enum: {
        values: ["not_sent", "pending", "completed"],
        message: "Intake status must be not_sent, pending, or completed",
      },
      default: "not_sent",
      index: true,
    },
    intakeTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    intakeTokenExpiresAt: {
      type: Date,
      default: null,
    },
    intakeSubmittedAt: {
      type: Date,
      default: null,
    },
    intakeResponses: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Digital Consent & Signature Tracking
    consentStatus: {
      type: String,
      enum: {
        values: ["pending", "completed"],
        message: "Consent status must be pending or completed",
      },
      default: "pending",
      index: true,
    },
    consentRecord: {
      agreed: {
        type: Boolean,
        default: false,
      },
      signedName: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "Signatory name cannot exceed 100 characters"],
      },
      signedAt: {
        type: Date,
        default: null,
      },
      documentVersion: {
        type: String,
        trim: true,
        default: "1.0",
      },
      ipAddress: {
        type: String,
        trim: true,
        default: "",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Compound unique index:
 * Ensures a single therapist cannot create multiple clients with the identical email,
 * while allowing different therapists to have clients with the same email.
 */
clientSchema.index({ therapist_id: 1, email: 1 }, { unique: true });

// Compound index for efficient list, search and filter operations
clientSchema.index({ therapist_id: 1, status: 1, createdAt: -1 });
clientSchema.index({ therapist_id: 1, name: 1 });

const Client = mongoose.models.Client || mongoose.model("Client", clientSchema);

module.exports = Client;

