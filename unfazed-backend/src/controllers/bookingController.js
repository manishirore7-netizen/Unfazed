const Therapist = require("../models/Therapist");
const Availability = require("../models/Availability");
const AvailabilityOverride = require("../models/AvailabilityOverride");
const BlockedSlot = require("../models/BlockedSlot");
const Booking = require("../models/Booking");
const { calculateAvailableSlots } = require("../utils/slotCalculator");
const {
  isValidTimezone,
  is15MinAligned,
  generateBookedBuckets,
  getUtcFromLocal,
  getLocalParts,
} = require("../utils/timezoneUtils");

/**
 * Public Slot Discovery API
 * Computes open, conflict-free booking slots for a therapist on a given date.
 * Route: GET /api/scheduling/public/:slug/slots
 * Access: Public
 */
const getPublicAvailableSlots = async (req, res) => {
  try {
    const { slug } = req.params;
    const { date, duration, timezone } = req.query;

    if (!slug || typeof slug !== "string") {
      return res.status(400).json({
        success: false,
        message: "Therapist slug is required.",
      });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "A valid date parameter in format YYYY-MM-DD is required.",
      });
    }

    // 1. Locate therapist
    const therapist = await Therapist.findOne({
      slug: slug.trim().toLowerCase(),
    }).lean();

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // 2. Fetch therapist's availability config
    let availability = await Availability.findOne({
      therapistId: therapist._id,
    }).lean();

    if (!availability) {
      availability = new Availability({ therapistId: therapist._id }).toObject();
    }

    // 3. Validate requested duration
    const parsedDuration = parseInt(duration, 10) || 60;
    if (!availability.sessionDurations.includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: `Duration ${parsedDuration} minutes is not offered by this practitioner. Allowed: ${availability.sessionDurations.join(", ")} minutes.`,
      });
    }

    // 4. Resolve client timezone
    const clientTimezone = isValidTimezone(timezone)
      ? timezone
      : availability.timezone || "Asia/Kolkata";

    // 5. Query relevant overrides, blocks, and bookings
    const clientDayStart = getUtcFromLocal(date, "00:00", clientTimezone);
    const windowStart = new Date(clientDayStart.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(clientDayStart.getTime() + 48 * 60 * 60 * 1000);

    const [overrides, blockedSlots, bookings] = await Promise.all([
      AvailabilityOverride.find({ therapistId: therapist._id }).lean(),
      BlockedSlot.find({
        therapistId: therapist._id,
        startTime: { $lt: windowEnd },
        endTime: { $gt: windowStart },
      }).lean(),
      Booking.find({
        therapistId: therapist._id,
        status: "confirmed",
        startTime: { $lt: windowEnd },
        endTime: { $gt: windowStart },
      }).lean(),
    ]);

    // 6. Calculate available slots
    const slots = calculateAvailableSlots({
      availability,
      overrides,
      blockedSlots,
      bookings,
      queryDate: date,
      duration: parsedDuration,
      clientTimezone,
      now: new Date(),
    });

    return res.status(200).json({
      success: true,
      data: {
        therapist: {
          name: therapist.name,
          slug: therapist.slug,
          timezone: availability.timezone,
        },
        date,
        duration: parsedDuration,
        clientTimezone,
        slots,
      },
    });
  } catch (error) {
    console.error("Error computing available slots:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while computing available slots.",
    });
  }
};

/**
 * Public Booking Creation API
 * Atomically reserves a slot and creates an instant confirmed booking.
 * Enforces 15-minute quantum bucketing and database-level unique index concurrency protection.
 * Route: POST /api/scheduling/public/:slug/book
 * Access: Public
 */
const createPublicBooking = async (req, res) => {
  try {
    const { slug } = req.params;
    const { clientName, clientEmail, clientPhone, clientNotes, startTime, duration } =
      req.body;

    // 1. Basic field presence checks
    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client name is required.",
      });
    }

    if (!clientEmail || typeof clientEmail !== "string" || !clientEmail.trim()) {
      return res.status(400).json({
        success: false,
        message: "Client email is required.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (!startTime) {
      return res.status(400).json({
        success: false,
        message: "startTime is required (UTC ISO string).",
      });
    }

    const parsedStart = new Date(startTime);
    if (isNaN(parsedStart.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid startTime ISO timestamp.",
      });
    }

    // 2. Enforce 15-minute alignment
    if (!is15MinAligned(parsedStart)) {
      return res.status(400).json({
        success: false,
        message: "Booking start time must be aligned to a 15-minute boundary (:00, :15, :30, :45).",
      });
    }

    // 3. Validate duration
    const parsedDuration = parseInt(duration, 10);
    if (![30, 45, 60, 90].includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: "Session duration must be 30, 45, 60, or 90 minutes.",
      });
    }

    // 4. Find therapist
    const therapist = await Therapist.findOne({
      slug: slug.trim().toLowerCase(),
    }).lean();

    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // 5. Fetch availability settings
    let availability = await Availability.findOne({
      therapistId: therapist._id,
    }).lean();

    if (!availability) {
      availability = new Availability({ therapistId: therapist._id }).toObject();
    }

    if (!availability.sessionDurations.includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: `Therapist does not offer ${parsedDuration}-minute sessions.`,
      });
    }

    // 6. Compute end time and buffer window
    const parsedEnd = new Date(parsedStart.getTime() + parsedDuration * 60 * 1000);
    const bufferMinutes = availability.bufferTimeMinutes ?? 15;
    const now = new Date();

    // 7. Check advance notice & booking window limits
    const noticeHours = availability.noticePeriodHours ?? 2;
    const bookingWindowDays = availability.bookingWindowDays ?? 60;

    const earliestAllowed = new Date(now.getTime() + noticeHours * 60 * 60 * 1000);
    if (parsedStart < earliestAllowed) {
      return res.status(400).json({
        success: false,
        message: `Bookings require at least ${noticeHours} hour(s) advance notice.`,
      });
    }

    const latestAllowed = new Date(
      now.getTime() + bookingWindowDays * 24 * 60 * 60 * 1000
    );
    if (parsedStart > latestAllowed) {
      return res.status(400).json({
        success: false,
        message: `Cannot book appointments more than ${bookingWindowDays} days in advance.`,
      });
    }

    // 8. Generate discrete 15-minute concurrency tokens
    const bookedBuckets = generateBookedBuckets(
      parsedStart,
      parsedDuration,
      bufferMinutes
    );

    // 9. Pre-check: Collision with BlockedSlots
    const windowEndWithBuffer = new Date(
      parsedStart.getTime() + (parsedDuration + bufferMinutes) * 60 * 1000
    );

    const hasBlockedCollision = await BlockedSlot.findOne({
      therapistId: therapist._id,
      startTime: { $lt: windowEndWithBuffer },
      endTime: { $gt: parsedStart },
    }).lean();

    if (hasBlockedCollision) {
      return res.status(409).json({
        success: false,
        message: "The requested time slot is blocked by the therapist. Please choose another time.",
      });
    }

    // 10. Pre-check: Immediate collision check against confirmed bookings
    const existingConflict = await Booking.findOne({
      therapistId: therapist._id,
      status: "confirmed",
      bookedBuckets: { $in: bookedBuckets },
    }).lean();

    if (existingConflict) {
      return res.status(409).json({
        success: false,
        message: "This slot is no longer available. Please select another time.",
      });
    }

    // 11. ATOMIC INSERTION: Final Concurrency Protection
    // In case two concurrent requests race past the pre-check at the exact same millisecond,
    // the unique compound index on { therapistId: 1, bookedBuckets: 1 } will trigger E11000
    // at the storage engine level, atomically preventing double-booking.
    try {
      const newBooking = await Booking.create({
        therapistId: therapist._id,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim().toLowerCase(),
        clientPhone: typeof clientPhone === "string" ? clientPhone.trim() : "",
        clientNotes: typeof clientNotes === "string" ? clientNotes.trim() : "",
        duration: parsedDuration,
        startTime: parsedStart,
        endTime: parsedEnd,
        status: "confirmed",
        bookedBuckets,
      });

      return res.status(201).json({
        success: true,
        message: "Booking confirmed successfully.",
        data: {
          id: newBooking._id,
          clientName: newBooking.clientName,
          clientEmail: newBooking.clientEmail,
          clientPhone: newBooking.clientPhone,
          clientNotes: newBooking.clientNotes,
          duration: newBooking.duration,
          startTime: newBooking.startTime,
          endTime: newBooking.endTime,
          status: newBooking.status,
          therapist: {
            name: therapist.name,
            slug: therapist.slug,
          },
        },
      });
    } catch (insertError) {
      // Catch MongoDB duplicate key error code 11000
      if (
        insertError.code === 11000 ||
        (insertError.message && insertError.message.includes("E11000"))
      ) {
        return res.status(409).json({
          success: false,
          message: "This slot was just booked by another client. Please select another time.",
        });
      }
      throw insertError;
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while confirming booking.",
    });
  }
};

module.exports = {
  getPublicAvailableSlots,
  createPublicBooking,
};
