const Availability = require("../models/Availability");
const AvailabilityOverride = require("../models/AvailabilityOverride");
const BlockedSlot = require("../models/BlockedSlot");
const Booking = require("../models/Booking");
const ClientPackage = require("../models/ClientPackage");
const { isValidTimezone, is15MinAligned } = require("../utils/timezoneUtils");

/**
 * Get therapist's availability configuration.
 * Route: GET /api/scheduling/availability
 * Access: Private (Therapist)
 */
const getAvailability = async (req, res) => {
  try {
    let availability = await Availability.findOne({
      therapistId: req.therapistId,
    }).lean();

    if (!availability) {
      // Return default configuration without persisting until explicitly saved
      availability = new Availability({ therapistId: req.therapistId }).toObject();
    }

    return res.status(200).json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error("Error fetching availability:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching availability.",
    });
  }
};

/**
 * Update or initialize therapist's availability configuration.
 * Route: PUT /api/scheduling/availability
 * Access: Private (Therapist)
 */
const updateAvailability = async (req, res) => {
  try {
    const {
      timezone,
      weeklySchedule,
      sessionDurations,
      bufferTimeMinutes,
      noticePeriodHours,
      bookingWindowDays,
    } = req.body;

    const updates = {};

    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        return res.status(400).json({
          success: false,
          message: `Invalid IANA timezone identifier: "${timezone}".`,
        });
      }
      updates.timezone = timezone;
    }

    if (sessionDurations !== undefined) {
      if (!Array.isArray(sessionDurations) || sessionDurations.length === 0) {
        return res.status(400).json({
          success: false,
          message: "sessionDurations must be a non-empty array.",
        });
      }
      const allowed = new Set([30, 45, 60, 90]);
      if (!sessionDurations.every((d) => allowed.has(d))) {
        return res.status(400).json({
          success: false,
          message: "Allowed session durations are only 30, 45, 60, and 90 minutes.",
        });
      }
      updates.sessionDurations = [...new Set(sessionDurations)].sort((a, b) => a - b);
    }

    if (bufferTimeMinutes !== undefined) {
      const allowedBuffers = new Set([0, 15, 30, 45, 60]);
      if (!allowedBuffers.has(bufferTimeMinutes)) {
        return res.status(400).json({
          success: false,
          message: "bufferTimeMinutes must be aligned to 15 minutes (0, 15, 30, 45, 60).",
        });
      }
      updates.bufferTimeMinutes = bufferTimeMinutes;
    }

    if (noticePeriodHours !== undefined) {
      if (
        typeof noticePeriodHours !== "number" ||
        noticePeriodHours < 0 ||
        noticePeriodHours > 168
      ) {
        return res.status(400).json({
          success: false,
          message: "noticePeriodHours must be a number between 0 and 168 (7 days).",
        });
      }
      updates.noticePeriodHours = noticePeriodHours;
    }

    if (bookingWindowDays !== undefined) {
      if (
        typeof bookingWindowDays !== "number" ||
        bookingWindowDays < 1 ||
        bookingWindowDays > 365
      ) {
        return res.status(400).json({
          success: false,
          message: "bookingWindowDays must be a number between 1 and 365.",
        });
      }
      updates.bookingWindowDays = bookingWindowDays;
    }

    if (weeklySchedule !== undefined) {
      if (!Array.isArray(weeklySchedule) || weeklySchedule.length !== 7) {
        return res.status(400).json({
          success: false,
          message: "weeklySchedule must be an array of exactly 7 days (0 to 6).",
        });
      }

      for (const day of weeklySchedule) {
        if (typeof day.dayOfWeek !== "number" || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
          return res.status(400).json({
            success: false,
            message: "dayOfWeek must be between 0 (Sunday) and 6 (Saturday).",
          });
        }
        if (day.isOpen && Array.isArray(day.timeSlots)) {
          for (let i = 0; i < day.timeSlots.length; i++) {
            const slot = day.timeSlots[i];
            if (!is15MinAligned(slot.startTime) || !is15MinAligned(slot.endTime)) {
              return res.status(400).json({
                success: false,
                message: `Time slot ${slot.startTime} - ${slot.endTime} must be aligned to a 15-minute boundary.`,
              });
            }
            if (slot.startTime >= slot.endTime) {
              return res.status(400).json({
                success: false,
                message: `Slot end time (${slot.endTime}) must be strictly after start time (${slot.startTime}).`,
              });
            }
            for (let j = i + 1; j < day.timeSlots.length; j++) {
              const other = day.timeSlots[j];
              if (slot.startTime < other.endTime && slot.endTime > other.startTime) {
                return res.status(400).json({
                  success: false,
                  message: `Overlapping intervals detected on day ${day.dayOfWeek}: ${slot.startTime}-${slot.endTime} and ${other.startTime}-${other.endTime}.`,
                });
              }
            }
          }
        }
      }
      updates.weeklySchedule = weeklySchedule;
    }

    const availability = await Availability.findOneAndUpdate(
      { therapistId: req.therapistId },
      { $set: updates },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Availability settings saved successfully.",
      data: availability,
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while updating availability.",
    });
  }
};

/**
 * List one-time availability overrides.
 * Route: GET /api/scheduling/overrides
 * Access: Private (Therapist)
 */
const getOverrides = async (req, res) => {
  try {
    const { from } = req.query;
    const filter = { therapistId: req.therapistId };
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      filter.date = { $gte: from };
    }

    const overrides = await AvailabilityOverride.find(filter)
      .sort({ date: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error("Error fetching overrides:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching date overrides.",
    });
  }
};

/**
 * Create or replace a one-time date override.
 * Route: POST /api/scheduling/overrides
 * Access: Private (Therapist)
 */
const setOverride = async (req, res) => {
  try {
    const { date, isBlocked, timeSlots, reason } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Valid date in format YYYY-MM-DD is required.",
      });
    }

    const validatedSlots = [];
    if (!isBlocked && Array.isArray(timeSlots)) {
      for (let i = 0; i < timeSlots.length; i++) {
        const slot = timeSlots[i];
        if (!is15MinAligned(slot.startTime) || !is15MinAligned(slot.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Time slot ${slot.startTime} - ${slot.endTime} must be aligned to 15-minute intervals.`,
          });
        }
        if (slot.startTime >= slot.endTime) {
          return res.status(400).json({
            success: false,
            message: "Slot end time must be after start time.",
          });
        }
        for (let j = i + 1; j < timeSlots.length; j++) {
          const other = timeSlots[j];
          if (slot.startTime < other.endTime && slot.endTime > other.startTime) {
            return res.status(400).json({
              success: false,
              message: "Overlapping time slots are not permitted.",
            });
          }
        }
        validatedSlots.push({ startTime: slot.startTime, endTime: slot.endTime });
      }
    }

    const override = await AvailabilityOverride.findOneAndUpdate(
      { therapistId: req.therapistId, date },
      {
        $set: {
          isBlocked: Boolean(isBlocked),
          timeSlots: isBlocked ? [] : validatedSlots,
          reason: typeof reason === "string" ? reason.trim().slice(0, 200) : "",
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Date override saved successfully.",
      data: override,
    });
  } catch (error) {
    console.error("Error setting date override:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while saving the override.",
    });
  }
};

/**
 * Delete a date override.
 * Route: DELETE /api/scheduling/overrides/:id
 * Access: Private (Therapist)
 */
const deleteOverride = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await AvailabilityOverride.findOneAndDelete({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Date override not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Date override removed successfully.",
    });
  } catch (error) {
    console.error("Error deleting override:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while removing the override.",
    });
  }
};

/**
 * List blocked slots.
 * Route: GET /api/scheduling/blocks
 * Access: Private (Therapist)
 */
const getBlockedSlots = async (req, res) => {
  try {
    const { from } = req.query;
    const filter = { therapistId: req.therapistId };
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        filter.endTime = { $gte: fromDate };
      }
    }

    const blocks = await BlockedSlot.find(filter).sort({ startTime: 1 }).lean();

    return res.status(200).json({
      success: true,
      data: blocks,
    });
  } catch (error) {
    console.error("Error fetching blocked slots:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching blocked slots.",
    });
  }
};

/**
 * Create a new blocked slot.
 * Route: POST /api/scheduling/blocks
 * Access: Private (Therapist)
 */
const createBlockedSlot = async (req, res) => {
  try {
    const { startTime, endTime, reason } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "startTime and endTime are required (UTC ISO strings).",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid ISO date string provided.",
      });
    }

    if (!is15MinAligned(start) || !is15MinAligned(end)) {
      return res.status(400).json({
        success: false,
        message: "Blocked slot start and end times must be aligned to 15-minute boundaries.",
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "Blocked end time must be strictly after start time.",
      });
    }

    const blockedSlot = await BlockedSlot.create({
      therapistId: req.therapistId,
      startTime: start,
      endTime: end,
      reason: typeof reason === "string" ? reason.trim().slice(0, 200) : "Blocked",
    });

    return res.status(201).json({
      success: true,
      message: "Time slot blocked successfully.",
      data: blockedSlot,
    });
  } catch (error) {
    console.error("Error creating blocked slot:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while blocking time slot.",
    });
  }
};

/**
 * Delete a blocked slot.
 * Route: DELETE /api/scheduling/blocks/:id
 * Access: Private (Therapist)
 */
const deleteBlockedSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BlockedSlot.findOneAndDelete({
      _id: id,
      therapistId: req.therapistId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Blocked slot not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Blocked slot removed successfully.",
    });
  } catch (error) {
    console.error("Error deleting blocked slot:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while removing the blocked slot.",
    });
  }
};

/**
 * List therapist's bookings.
 * Route: GET /api/scheduling/bookings
 * Access: Private (Therapist)
 */
const getTherapistBookings = async (req, res) => {
  try {
    const { status, from } = req.query;
    const filter = { therapistId: req.therapistId };

    if (status && ["confirmed", "cancelled", "completed"].includes(status)) {
      filter.status = status;
    }

    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        filter.startTime = { $gte: fromDate };
      }
    }

    const bookings = await Booking.find(filter)
      .sort({ startTime: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while fetching bookings.",
    });
  }
};

/**
 * Cancel a booking.
 * Route: PATCH /api/scheduling/bookings/:id/cancel
 * Access: Private (Therapist)
 */
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOneAndUpdate(
      { _id: id, therapistId: req.therapistId },
      { $set: { status: "cancelled" } },
      { returnDocument: "after" }
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Refund policy for session packages:
    // If cancelled booking was redeemed using a package credit, restore 1 credit to the ClientPackage
    if (booking.paymentStatus === "package_credit" && booking.clientPackageId) {
      const clientPkg = await ClientPackage.findById(booking.clientPackageId);
      if (clientPkg) {
        clientPkg.remainingSessions += 1;
        clientPkg.usedSessions = Math.max(0, clientPkg.usedSessions - 1);
        if (clientPkg.status === "exhausted" && clientPkg.remainingSessions > 0) {
          clientPkg.status = "active";
        }
        await clientPkg.save();
      }
      booking.paymentStatus = "waived";
      await booking.save();
    }

    return res.status(200).json({
      success: true,
      message: "Booking has been cancelled.",
      data: booking,
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while cancelling booking.",
    });
  }
};

module.exports = {
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
};
