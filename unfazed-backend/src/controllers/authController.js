const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Therapist = require("../models/Therapist");
const generateSlug = require("../utils/generateSlug");

/**
 * Register a new therapist.
 * Route: POST /api/auth/register
 */
const registerTherapist = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Basic presence and type validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Password is required.",
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // 3. Minimum password length check
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    // 4. Duplicate email check
    const existingTherapist = await Therapist.findOne({ email: normalizedEmail });
    if (existingTherapist) {
      return res.status(409).json({
        success: false,
        message: "A therapist with this email address already exists.",
      });
    }

    // 5. Hash password with bcryptjs
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 6. Generate unique slug from the therapist's name
    const slug = await generateSlug(trimmedName);

    // 7. Create therapist record in database
    const therapist = await Therapist.create({
      name: trimmedName,
      email: normalizedEmail,
      password_hash,
      slug,
    });

    // 8. Return response with safe public fields
    return res.status(201).json({
      success: true,
      message: "Therapist registered successfully.",
      data: {
        id: therapist._id,
        name: therapist.name,
        email: therapist.email,
        slug: therapist.slug,
      },
    });
  } catch (error) {
    console.error("Error during therapist registration:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during registration. Please try again later.",
    });
  }
};

/**
 * Log in an existing therapist.
 * Route: POST /api/auth/login
 */
const loginTherapist = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Presence and type validation
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Password is required.",
      });
    }

    // 2. Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Query therapist by email and explicitly select password_hash (select: false in schema)
    const therapist = await Therapist.findOne({ email: normalizedEmail }).select("+password_hash");

    // 4. Return generic 401 if therapist does not exist
    if (!therapist) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 5. Compare plain-text password with stored hash
    const isPasswordValid = await bcrypt.compare(password, therapist.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 6. Ensure JWT_SECRET is available in environment
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured in environment variables.");
      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error.",
      });
    }

    // 7. Generate JWT token with therapistId and 7-day expiration
    const token = jwt.sign(
      { therapistId: therapist._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 8. Return success response with token and safe public details (no password_hash)
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      data: {
        id: therapist._id,
        name: therapist.name,
        email: therapist.email,
        slug: therapist.slug,
      },
    });
  } catch (error) {
    console.error("Error during therapist login:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login. Please try again later.",
    });
  }
};

module.exports = {
  registerTherapist,
  loginTherapist,
};
