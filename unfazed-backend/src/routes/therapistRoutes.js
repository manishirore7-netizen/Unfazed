const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getMe,
  updateMe,
  getTherapistBySlug,
} = require("../controllers/therapistController");

const router = express.Router();

// Protected routes: must be declared BEFORE /:slug so "/me" is not treated as a slug
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, updateMe);

// Public route: fetch therapist profile by unique slug (no JWT required)
router.get("/:slug", getTherapistBySlug);

module.exports = router;
