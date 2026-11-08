const mongoose = require("mongoose");

/**
 * Therapist Schema
 * Represents a mental health professional using the Unfazed platform.
 */
const therapistSchema = new mongoose.Schema(
  {
    // Full name of the therapist
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    // Unique contact and login email
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    // Hashed password for authentication
    // 'select: false' prevents this field from being returned in query results by default
    password_hash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },

    // Unique URL-friendly identifier for the therapist's public profile/booking page (e.g., "dr-jane-doe")
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Professional summary / biography (optional)
    bio: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2500, "Bio cannot exceed 2500 characters"],
    },

    // Areas of clinical focus (e.g., ["Anxiety", "CBT", "Trauma"])
    specializations: {
      type: [String],
      default: [],
    },

    // Languages spoken by the therapist (e.g., ["English", "Hindi"])
    languages: {
      type: [String],
      default: [],
    },
  },
  {
    // Automatically manages createdAt and updatedAt fields
    timestamps: true,
  }
);

// Prevent model overwrite/recompilation errors during hot reloads or multiple imports
const Therapist =
  mongoose.models.Therapist || mongoose.model("Therapist", therapistSchema);

module.exports = Therapist;

