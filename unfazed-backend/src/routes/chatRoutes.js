const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getTherapistMessages,
  sendTherapistMessage,
  getClientMessages,
  sendClientMessage,
} = require("../controllers/chatController");

// ==========================================
// 1. CLIENT PORTAL TOKEN-GATED ENDPOINTS
// ==========================================
router.get("/portal/:token/messages", getClientMessages);
router.post("/portal/:token/messages", sendClientMessage);

// ==========================================
// 2. THERAPIST AUTHENTICATED ENDPOINTS
// ==========================================
router.get("/messages/:clientId", authMiddleware, getTherapistMessages);
router.post("/messages/:clientId", authMiddleware, sendTherapistMessage);

module.exports = router;
