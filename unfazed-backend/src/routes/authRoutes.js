const express = require("express");
const {
  registerTherapist,
  loginTherapist,
} = require("../controllers/authController");

const router = express.Router();

// POST /api/auth/register
router.post("/register", registerTherapist);

// POST /api/auth/login
router.post("/login", loginTherapist);

module.exports = router;
