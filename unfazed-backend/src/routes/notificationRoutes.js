const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getNotifications,
  triggerScheduledNotifications,
} = require("../controllers/notificationController");

// Protected therapist routes
router.get("/", authMiddleware, getNotifications);
router.post("/process-reminders", authMiddleware, triggerScheduledNotifications);

module.exports = router;
