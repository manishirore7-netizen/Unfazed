const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getAvailability,
  updateAvailability,
  getOverrides,
  setOverride,
  deleteOverride,
  getBlockedSlots,
  createBlockedSlot,
  deleteBlockedSlot,
  getTherapistBookings,
  cancelBooking,
} = require("../controllers/availabilityController");
const {
  getPublicAvailableSlots,
  createPublicBooking,
  getTherapistAvailableSlots,
  createTherapistBooking,
} = require("../controllers/bookingController");

const router = express.Router();

// ==========================================
// 1. PUBLIC CLIENT-FACING BOOKING ROUTES
// ==========================================
router.get("/public/:slug/slots", getPublicAvailableSlots);
router.post("/public/:slug/book", createPublicBooking);

// ==========================================
// 2. PROTECTED THERAPIST MANAGEMENT ROUTES
// ==========================================
// Availability & General Settings
router.get("/availability", authMiddleware, getAvailability);
router.put("/availability", authMiddleware, updateAvailability);

// Date Overrides & Off-Days
router.get("/overrides", authMiddleware, getOverrides);
router.post("/overrides", authMiddleware, setOverride);
router.delete("/overrides/:id", authMiddleware, deleteOverride);

// Blocked Slots (Intraday Unavailable Periods)
router.get("/blocks", authMiddleware, getBlockedSlots);
router.post("/blocks", authMiddleware, createBlockedSlot);
router.delete("/blocks/:id", authMiddleware, deleteBlockedSlot);

// Bookings, Scheduling & Cancellations
router.get("/slots", authMiddleware, getTherapistAvailableSlots);
router.get("/bookings", authMiddleware, getTherapistBookings);
router.post("/bookings", authMiddleware, createTherapistBooking);
router.patch("/bookings/:id/cancel", authMiddleware, cancelBooking);

module.exports = router;
