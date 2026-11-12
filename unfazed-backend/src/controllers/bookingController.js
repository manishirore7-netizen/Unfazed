const Therapist = require("../models/Therapist");
const Availability = require("../models/Availability");
const AvailabilityOverride = require("../models/AvailabilityOverride");
const BlockedSlot = require("../models/BlockedSlot");
const Booking = require("../models/Booking");
const Client = require("../models/Client");
const ClientPackage = require("../models/ClientPackage");
const { calculateAvailableSlots } = require("../utils/slotCalculator");
const { notificationService, NOTIFICATION_EVENTS } = require("../services/notificationService");
const {
  isValidTimezone,
  is15MinAligned,
  generateBookedBuckets,
  getUtcFromLocal,
} = require("../utils/timezoneUtils");

/**
 * Safely find or create a Client for a therapist when an appointment is booked.
 * Preserves all existing client demographics, clinical history, goals, and tags.
 * Concurrency-safe against race conditions on the unique { therapist_id, email } index.
 */
const syncClientForBooking = async ({ therapistId, clientName, clientEmail, clientPhone }) => {
  const normalizedEmail = clientEmail.trim().toLowerCase();

  // 1. Check for existing client belonging to this therapist
  let client = await Client.findOne({
    therapist_id: therapistId,
    email: normalizedEmail,
  });

  if (client) {
    // Existing record found: preserve all existing demographics, clinical history, notes, and tags
    return client;
  }

  // 2. Client does not exist: create new record
  try {
    client = await Client.create({
      therapist_id: therapistId,
      name: clientName.trim(),
      email: normalizedEmail,
      phone: typeof clientPhone === "string" ? clientPhone.trim() : "",
      status: "active",
      tags: [],
    });
    return client;
  } catch (err) {
    // If a concurrent booking request created this client at the exact same millisecond
    if (err.code === 11000 || (err.message && err.message.includes("E11000"))) {
      client = await Client.findOne({
        therapist_id: therapistId,
        email: normalizedEmail,
      });
      if (client) return client;
    }
    throw err;
  }
};

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
      date,
      duration: parsedDuration,
      clientTimezone,
    });

    return res.status(200).json({
      success: true,
      data: {
        date,
        duration: parsedDuration,
        timezone: clientTimezone,
        therapist: {
          name: therapist.name,
          slug: therapist.slug,
          timezone: availability.timezone || "Asia/Kolkata",
          sessionDurations: availability.sessionDurations,
        },
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
 * Synchronizes booking with CRM Client record while preserving existing client data.
 * Route: POST /api/scheduling/public/:slug/book
 * Access: Public
 */
const createPublicBooking = async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      clientName,
      clientEmail,
      clientPhone,
      clientNotes,
      startTime,
      duration,
      usePackageCredit,
    } = req.body;

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
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
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

    // 10.5 Session Credit Redemption: check and deduct package credit if requested
    let redeemedPkg = null;
    let paymentStatus = "unpaid";
    let clientPackageId = null;

    if (usePackageCredit === true || usePackageCredit === "true") {
      const existingClient = await Client.findOne({
        therapist_id: therapist._id,
        email: normalizedEmail,
      });

      if (!existingClient) {
        return res.status(400).json({
          success: false,
          message: "No registered client profile or package found for this email.",
        });
      }

      // Find earliest expiring active package with remaining sessions
      const candidatePkg = await ClientPackage.findOne({
        therapistId: therapist._id,
        clientId: existingClient._id,
        status: "active",
        remainingSessions: { $gt: 0 },
        expiresAt: { $gt: new Date() },
      }).sort({ expiresAt: 1 });

      if (!candidatePkg) {
        return res.status(400).json({
          success: false,
          message: "No active package credit available or package has expired.",
        });
      }

      // Atomically decrement 1 credit to prevent race conditions on final credit
      const updatedPkg = await ClientPackage.findOneAndUpdate(
        {
          _id: candidatePkg._id,
          status: "active",
          remainingSessions: { $gt: 0 },
          expiresAt: { $gt: new Date() },
        },
        {
          $inc: { remainingSessions: -1, usedSessions: 1 },
        },
        { returnDocument: "after" }
      );

      if (!updatedPkg) {
        return res.status(409).json({
          success: false,
          message:
            "Insufficient session credits. The final credit may have just been redeemed by another session.",
        });
      }

      if (updatedPkg.remainingSessions === 0) {
        await ClientPackage.findByIdAndUpdate(updatedPkg._id, {
          $set: { status: "exhausted" },
        });
      }

      redeemedPkg = updatedPkg;
      paymentStatus = "package_credit";
      clientPackageId = updatedPkg._id;
    }

    // 11. ATOMIC INSERTION: Final Concurrency Protection
    let newBooking;
    try {
      newBooking = await Booking.create({
        therapistId: therapist._id,
        clientName: clientName.trim(),
        clientEmail: normalizedEmail,
        clientPhone: typeof clientPhone === "string" ? clientPhone.trim() : "",
        clientNotes: typeof clientNotes === "string" ? clientNotes.trim() : "",
        duration: parsedDuration,
        startTime: parsedStart,
        endTime: parsedEnd,
        status: "confirmed",
        bookedBuckets,
        paymentStatus,
        clientPackageId,
      });
    } catch (insertError) {
      // Rollback redeemed credit if booking creation fails
      if (redeemedPkg) {
        await ClientPackage.findByIdAndUpdate(redeemedPkg._id, {
          $inc: { remainingSessions: 1, usedSessions: -1 },
          $set: { status: "active" },
        });
      }

      // Catch MongoDB duplicate key error code 11000 on { therapistId, bookedBuckets }
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

    // 12. CRM SYNCHRONIZATION:
    // Only executed after booking creation succeeds to prevent orphan CRM records.
    try {
      const clientRecord = await syncClientForBooking({
        therapistId: therapist._id,
        clientName,
        clientEmail: normalizedEmail,
        clientPhone,
      });
      if (clientRecord) {
        newBooking.clientId = clientRecord._id;
        await newBooking.save();
      }
    } catch (crmErr) {
      console.error("CRM sync error in createPublicBooking:", crmErr);
      if (redeemedPkg) {
        await ClientPackage.findByIdAndUpdate(redeemedPkg._id, {
          $inc: { remainingSessions: 1, usedSessions: -1 },
          $set: { status: "active" },
        });
      }
      // Clean up booking if CRM sync fails to ensure complete consistency
      await Booking.deleteOne({ _id: newBooking._id });
      throw crmErr;
    }

    // Trigger event-driven notification (non-blocking)
    notificationService.emit(NOTIFICATION_EVENTS.BOOKING_CONFIRMED, {
      booking: newBooking,
      therapist,
      client: {
        name: newBooking.clientName,
        email: newBooking.clientEmail,
        phone: newBooking.clientPhone,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Booking confirmed successfully.",
      data: {
        id: newBooking._id,
        clientId: newBooking.clientId,
        clientName: newBooking.clientName,
        clientEmail: newBooking.clientEmail,
        clientPhone: newBooking.clientPhone,
        clientNotes: newBooking.clientNotes,
        duration: newBooking.duration,
        startTime: newBooking.startTime,
        endTime: newBooking.endTime,
        status: newBooking.status,
        paymentStatus: newBooking.paymentStatus,
        clientPackageId: newBooking.clientPackageId,
        therapist: {
          name: therapist.name,
          slug: therapist.slug,
        },
      },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while confirming booking.",
    });
  }
};

/**
 * Protected Therapist Slot Discovery API
 * Computes open, conflict-free booking slots for the authenticated therapist on a given date.
 * Route: GET /api/scheduling/slots
 * Access: Private (authMiddleware required)
 */
const getTherapistAvailableSlots = async (req, res) => {
  try {
    const therapistId = req.therapistId;
    const { date, duration, timezone } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "A valid date parameter in format YYYY-MM-DD is required.",
      });
    }

    const therapist = await Therapist.findById(therapistId).lean();
    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    let availability = await Availability.findOne({ therapistId }).lean();
    if (!availability) {
      availability = new Availability({ therapistId }).toObject();
    }

    const parsedDuration = parseInt(duration, 10) || 60;
    if (!availability.sessionDurations.includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: `Duration ${parsedDuration} minutes is not offered by your practice settings. Allowed: ${availability.sessionDurations.join(", ")} minutes.`,
      });
    }

    const resolvedTimezone = isValidTimezone(timezone)
      ? timezone
      : availability.timezone || "Asia/Kolkata";

    const clientDayStart = getUtcFromLocal(date, "00:00", resolvedTimezone);
    const windowStart = new Date(clientDayStart.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(clientDayStart.getTime() + 48 * 60 * 60 * 1000);

    const [overrides, blockedSlots, bookings] = await Promise.all([
      AvailabilityOverride.find({ therapistId }).lean(),
      BlockedSlot.find({
        therapistId,
        startTime: { $lt: windowEnd },
        endTime: { $gt: windowStart },
      }).lean(),
      Booking.find({
        therapistId,
        status: "confirmed",
        startTime: { $lt: windowEnd },
        endTime: { $gt: windowStart },
      }).lean(),
    ]);

    const slots = calculateAvailableSlots({
      availability,
      overrides,
      blockedSlots,
      bookings,
      queryDate: date,
      date,
      duration: parsedDuration,
      clientTimezone: resolvedTimezone,
    });

    return res.status(200).json({
      success: true,
      data: {
        date,
        duration: parsedDuration,
        timezone: resolvedTimezone,
        therapist: {
          id: therapist._id,
          name: therapist.name,
          slug: therapist.slug,
          timezone: availability.timezone || "Asia/Kolkata",
          sessionDurations: availability.sessionDurations,
        },
        slots,
      },
    });
  } catch (error) {
    console.error("Error computing therapist available slots:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while computing available slots.",
    });
  }
};

/**
 * Protected Therapist Booking Creation API
 * Allows an authenticated therapist to schedule an appointment for an existing or new client.
 * Enforces ownership, conflict-prevention, 15-minute quantum bucketing, and CRM sync.
 * Route: POST /api/scheduling/bookings
 * Access: Private (authMiddleware required)
 */
const createTherapistBooking = async (req, res) => {
  try {
    const therapistId = req.therapistId;
    const {
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      clientNotes,
      startTime,
      duration,
      usePackageCredit,
    } = req.body;

    // 1. Basic field checks
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
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
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

    if (!is15MinAligned(parsedStart)) {
      return res.status(400).json({
        success: false,
        message: "Booking start time must be aligned to a 15-minute boundary (:00, :15, :30, :45).",
      });
    }

    const parsedDuration = parseInt(duration, 10);
    if (![30, 45, 60, 90].includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: "Session duration must be 30, 45, 60, or 90 minutes.",
      });
    }

    // 2. Verify therapist
    const therapist = await Therapist.findById(therapistId).lean();
    if (!therapist) {
      return res.status(404).json({
        success: false,
        message: "Therapist not found.",
      });
    }

    // 3. If clientId is provided, verify ownership
    let clientRecord = null;
    if (clientId) {
      clientRecord = await Client.findOne({
        _id: clientId,
        therapist_id: therapistId,
      });
      if (!clientRecord) {
        return res.status(404).json({
          success: false,
          message: "Client not found or belongs to another practice.",
        });
      }
    }

    // 4. Verify duration offered in availability
    let availability = await Availability.findOne({ therapistId }).lean();
    if (!availability) {
      availability = new Availability({ therapistId }).toObject();
    }

    if (!availability.sessionDurations.includes(parsedDuration)) {
      return res.status(400).json({
        success: false,
        message: `Therapist practice settings do not offer ${parsedDuration}-minute sessions.`,
      });
    }

    // 5. Compute end time & buffer
    const parsedEnd = new Date(parsedStart.getTime() + parsedDuration * 60 * 1000);
    const bufferMinutes = availability.bufferTimeMinutes ?? 15;

    // 6. Generate 15-minute quantum tokens
    const bookedBuckets = generateBookedBuckets(
      parsedStart,
      parsedDuration,
      bufferMinutes
    );

    // 7. Check collisions with blocked slots
    const windowEndWithBuffer = new Date(
      parsedStart.getTime() + (parsedDuration + bufferMinutes) * 60 * 1000
    );

    const hasBlockedCollision = await BlockedSlot.findOne({
      therapistId,
      startTime: { $lt: windowEndWithBuffer },
      endTime: { $gt: parsedStart },
    }).lean();

    if (hasBlockedCollision) {
      return res.status(409).json({
        success: false,
        message: "The requested time slot overlaps with a blocked period. Please choose another time.",
      });
    }

    // 8. Check collisions with existing confirmed bookings
    const existingConflict = await Booking.findOne({
      therapistId,
      status: "confirmed",
      bookedBuckets: { $in: bookedBuckets },
    }).lean();

    if (existingConflict) {
      return res.status(409).json({
        success: false,
        message: "This slot is no longer available. Please select another time.",
      });
    }

    // 8.5 Session Credit Redemption: check and deduct package credit if requested
    let redeemedPkg = null;
    let paymentStatus = "unpaid";
    let clientPackageId = null;

    if (usePackageCredit === true || usePackageCredit === "true") {
      const targetClientId = clientRecord?._id;
      if (!targetClientId) {
        return res.status(400).json({
          success: false,
          message: "A registered client is required to redeem a package credit.",
        });
      }

      const candidatePkg = await ClientPackage.findOne({
        therapistId,
        clientId: targetClientId,
        status: "active",
        remainingSessions: { $gt: 0 },
        expiresAt: { $gt: new Date() },
      }).sort({ expiresAt: 1 });

      if (!candidatePkg) {
        return res.status(400).json({
          success: false,
          message: "No active session package credit available for this client.",
        });
      }

      const updatedPkg = await ClientPackage.findOneAndUpdate(
        {
          _id: candidatePkg._id,
          status: "active",
          remainingSessions: { $gt: 0 },
          expiresAt: { $gt: new Date() },
        },
        {
          $inc: { remainingSessions: -1, usedSessions: 1 },
        },
        { returnDocument: "after" }
      );

      if (!updatedPkg) {
        return res.status(409).json({
          success: false,
          message:
            "Insufficient session credits. The final credit may have just been redeemed by another session.",
        });
      }

      if (updatedPkg.remainingSessions === 0) {
        await ClientPackage.findByIdAndUpdate(updatedPkg._id, {
          $set: { status: "exhausted" },
        });
      }

      redeemedPkg = updatedPkg;
      paymentStatus = "package_credit";
      clientPackageId = updatedPkg._id;
    }

    // 9. Atomic insertion with unique index concurrency protection
    let newBooking;
    try {
      newBooking = await Booking.create({
        therapistId,
        clientId: clientRecord?._id || undefined,
        clientName: clientName.trim(),
        clientEmail: normalizedEmail,
        clientPhone: typeof clientPhone === "string" ? clientPhone.trim() : "",
        clientNotes: typeof clientNotes === "string" ? clientNotes.trim() : "",
        duration: parsedDuration,
        startTime: parsedStart,
        endTime: parsedEnd,
        status: "confirmed",
        bookedBuckets,
        paymentStatus,
        clientPackageId,
      });
    } catch (insertError) {
      if (redeemedPkg) {
        await ClientPackage.findByIdAndUpdate(redeemedPkg._id, {
          $inc: { remainingSessions: 1, usedSessions: -1 },
          $set: { status: "active" },
        });
      }

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

    // 10. Synchronize with CRM if clientId was not already resolved
    if (!newBooking.clientId) {
      try {
        const syncedClient = await syncClientForBooking({
          therapistId,
          clientName,
          clientEmail: normalizedEmail,
          clientPhone,
        });
        if (syncedClient) {
          newBooking.clientId = syncedClient._id;
          await newBooking.save();
        }
      } catch (crmErr) {
        console.error("CRM sync error in createTherapistBooking:", crmErr);
        if (redeemedPkg) {
          await ClientPackage.findByIdAndUpdate(redeemedPkg._id, {
            $inc: { remainingSessions: 1, usedSessions: -1 },
            $set: { status: "active" },
          });
        }
        await Booking.deleteOne({ _id: newBooking._id });
        throw crmErr;
      }
    }

    // Trigger event-driven notification (non-blocking)
    notificationService.emit(NOTIFICATION_EVENTS.BOOKING_CONFIRMED, {
      booking: newBooking,
      therapist,
      client: {
        name: newBooking.clientName,
        email: newBooking.clientEmail,
        phone: newBooking.clientPhone,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Appointment scheduled successfully.",
      data: {
        id: newBooking._id,
        clientId: newBooking.clientId,
        clientName: newBooking.clientName,
        clientEmail: newBooking.clientEmail,
        clientPhone: newBooking.clientPhone,
        clientNotes: newBooking.clientNotes,
        duration: newBooking.duration,
        startTime: newBooking.startTime,
        endTime: newBooking.endTime,
        status: newBooking.status,
        paymentStatus: newBooking.paymentStatus,
        clientPackageId: newBooking.clientPackageId,
        therapist: {
          name: therapist.name,
          slug: therapist.slug,
        },
      },
    });
  } catch (error) {
    console.error("Error creating therapist booking:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while scheduling appointment.",
    });
  }
};

module.exports = {
  getPublicAvailableSlots,
  createPublicBooking,
  getTherapistAvailableSlots,
  createTherapistBooking,
  syncClientForBooking,
};
