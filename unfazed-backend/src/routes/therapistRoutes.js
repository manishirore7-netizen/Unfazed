const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const Therapist = require("../models/Therapist");

const router = express.Router();

/**
 * Protected route to get the authenticated therapist's profile.
 * Route: GET /api/therapist/me
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // Find therapist by ID stored in token (password_hash is excluded by default in schema)
    const therapist = await Therapist.findById(req.therapistId);

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // Return safe public fields only
    return res.status(200).json({
      success: true,
      data: {
        id: therapist._id,
        name: therapist.name,
        email: therapist.email,
        slug: therapist.slug,
      },
    });
  } catch (error) {
    console.error("Error fetching therapist profile:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching the profile.",
    });
  }
});

module.exports = router;

