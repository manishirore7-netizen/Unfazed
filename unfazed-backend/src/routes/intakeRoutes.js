const express = require("express");
const router = express.Router();
const {
  getIntakeByToken,
  submitIntake,
} = require("../controllers/intakeController");
const { getClientSharedNotes } = require("../controllers/noteController");

// Public, token-gated client intake endpoints
router.get("/:token", getIntakeByToken);
router.post("/:token/submit", submitIntake);
router.get("/:token/notes", getClientSharedNotes);

module.exports = router;
