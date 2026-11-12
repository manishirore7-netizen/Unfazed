const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getAnalytics,
  getDetailedAnalytics,
} = require("../controllers/analyticsController");

// Protected therapist analytics endpoints
router.get("/", authMiddleware, getAnalytics);
router.get("/detailed", authMiddleware, getDetailedAnalytics);

module.exports = router;
