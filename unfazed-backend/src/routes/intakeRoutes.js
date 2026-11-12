const express = require("express");
const router = express.Router();
const {
  getIntakeByToken,
  submitIntake,
} = require("../controllers/intakeController");

// Public, token-gated client intake endpoints
router.get("/:token", getIntakeByToken);
router.post("/:token/submit", submitIntake);

module.exports = router;
