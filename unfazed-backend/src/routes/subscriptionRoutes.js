const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getMySubscription,
  switchTier,
  getTiersList,
} = require("../controllers/subscriptionController");

// Public list of available subscription tiers
router.get("/tiers", getTiersList);

// Protected therapist subscription & entitlement management
router.get("/entitlements", authMiddleware, getMySubscription);
router.post("/tier", authMiddleware, switchTier);

module.exports = router;
