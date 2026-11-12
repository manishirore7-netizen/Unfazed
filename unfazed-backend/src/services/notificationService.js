const EventEmitter = require("events");
const mongoose = require("mongoose");
const NotificationLog = require("../models/NotificationLog");
const Booking = require("../models/Booking");
const Therapist = require("../models/Therapist");
const Client = require("../models/Client");

const NOTIFICATION_EVENTS = {
  BOOKING_CONFIRMED: "booking:confirmed",
  REMINDER_24H: "appointment:reminder_24h",
  POST_SESSION_FOLLOWUP: "session:followup",
};

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.initListeners();
  }

  initListeners() {
    this.on(NOTIFICATION_EVENTS.BOOKING_CONFIRMED, async (payload) => {
      try {
        await this.handleBookingConfirmed(payload);
      } catch (err) {
        console.error("Error in handleBookingConfirmed:", err);
      }
    });

    this.on(NOTIFICATION_EVENTS.REMINDER_24H, async (payload) => {
      try {
        await this.handleReminder24h(payload);
      } catch (err) {
        console.error("Error in handleReminder24h:", err);
      }
    });

    this.on(NOTIFICATION_EVENTS.POST_SESSION_FOLLOWUP, async (payload) => {
      try {
        await this.handlePostSessionFollowup(payload);
      } catch (err) {
        console.error("Error in handlePostSessionFollowup:", err);
      }
    });
  }

  /**
   * Dispatches and logs a notification across WhatsApp and/or Email channels
   */
  async dispatchNotification({
    bookingId,
    therapistId,
    clientId,
    recipientName,
    recipientEmail,
    recipientPhone,
    type,
    channel = "whatsapp",
    title,
    message,
    metadata = {},
  }) {
    // Prevent duplicate notification by checking database record first
    if (bookingId) {
      const existing = await NotificationLog.findOne({
        bookingId,
        type,
        channel,
      });
      if (existing) {
        return existing;
      }
    }

    // WhatsApp Integration Stub: Logs formatted payload
    if (channel === "whatsapp") {
      console.log(
        `[WhatsApp Stub] Dispatched to ${recipientPhone || "N/A"}: [${type}] ${message}`
      );
    } else if (channel === "email") {
      console.log(
        `[Email Stub] Dispatched to ${recipientEmail || "N/A"}: [${title}] ${message}`
      );
    }

    try {
      const log = await NotificationLog.create({
        bookingId: bookingId || null,
        therapistId,
        clientId: clientId || null,
        recipientName: recipientName || "",
        recipientEmail: recipientEmail || "",
        recipientPhone: recipientPhone || "",
        type,
        channel,
        status: "sent",
        title: title || "",
        message,
        metadata,
        sentAt: new Date(),
      });
      return log;
    } catch (err) {
      // E11000 duplicate key error means already dispatched concurrently
      if (err.code === 11000) {
        return await NotificationLog.findOne({ bookingId, type, channel });
      }
      throw err;
    }
  }

  /**
   * 1. Booking Confirmed Trigger
   */
  async handleBookingConfirmed({ booking, therapist, client }) {
    if (!booking) return;

    const therapistName = therapist?.name || "Your Therapist";
    const practiceName = therapist?.practiceName || therapistName;
    const clientName = client?.name || booking.clientName;
    const clientPhone = client?.phone || booking.clientPhone;
    const clientEmail = client?.email || booking.clientEmail;
    const sessionDate = new Date(booking.startTime).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const sessionTime = new Date(booking.startTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const message = `Hello ${clientName}, your appointment with ${therapistName} (${practiceName}) on ${sessionDate} at ${sessionTime} UTC is confirmed.`;

    await this.dispatchNotification({
      bookingId: booking._id,
      therapistId: booking.therapistId,
      clientId: booking.clientId || null,
      recipientName: clientName,
      recipientEmail: clientEmail,
      recipientPhone: clientPhone,
      type: "booking_confirmed",
      channel: "whatsapp",
      title: "Appointment Confirmed",
      message,
      metadata: {
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
      },
    });
  }

  /**
   * 2. 24-Hour Appointment Reminder Trigger
   */
  async handleReminder24h({ booking, therapist }) {
    if (!booking) return;

    const therapistName = therapist?.name || "Your Therapist";
    const clientName = booking.clientName;
    const clientPhone = booking.clientPhone;
    const clientEmail = booking.clientEmail;
    const sessionDate = new Date(booking.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const sessionTime = new Date(booking.startTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const message = `Reminder: Hi ${clientName}, you have an upcoming therapy session tomorrow, ${sessionDate} at ${sessionTime} UTC with ${therapistName}.`;

    return await this.dispatchNotification({
      bookingId: booking._id,
      therapistId: booking.therapistId,
      clientId: booking.clientId || null,
      recipientName: clientName,
      recipientEmail: clientEmail,
      recipientPhone: clientPhone,
      type: "reminder_24h",
      channel: "whatsapp",
      title: "24-Hour Appointment Reminder",
      message,
      metadata: {
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
      },
    });
  }

  /**
   * 3. Post-Session Follow-Up Trigger
   */
  async handlePostSessionFollowup({ booking, therapist }) {
    if (!booking) return;

    const therapistName = therapist?.name || "Your Therapist";
    const clientName = booking.clientName;
    const clientPhone = booking.clientPhone;
    const clientEmail = booking.clientEmail;

    const message = `Hi ${clientName}, thank you for attending your session today with ${therapistName}. You can check your Client Portal anytime to view care summaries and shared reflections.`;

    return await this.dispatchNotification({
      bookingId: booking._id,
      therapistId: booking.therapistId,
      clientId: booking.clientId || null,
      recipientName: clientName,
      recipientEmail: clientEmail,
      recipientPhone: clientPhone,
      type: "post_session_followup",
      channel: "whatsapp",
      title: "Post-Session Care Follow-Up",
      message,
      metadata: {
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    });
  }

  /**
   * Scheduler mechanism for 24-hour reminders and post-session follow-ups
   * Reliably scans database for eligible bookings and dispatches notifications
   * without sending duplicates.
   */
  async processScheduledNotifications() {
    if (mongoose.connection.readyState !== 1) {
      return { remindersSent: 0, followupsSent: 0, errors: [] };
    }

    const now = new Date();
    const results = {
      remindersSent: 0,
      followupsSent: 0,
      errors: [],
    };

    try {
      // 1. Process 24-hour reminders:
      // Bookings confirmed, starting between now and next 25 hours (allowing 1h buffer)
      const windowStart = now;
      const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

      const reminderCandidates = await Booking.find({
        status: "confirmed",
        startTime: { $gte: windowStart, $lte: windowEnd },
      }).populate("therapistId", "name practiceName email");

      for (const booking of reminderCandidates) {
        try {
          const alreadySent = await NotificationLog.findOne({
            bookingId: booking._id,
            type: "reminder_24h",
            channel: "whatsapp",
          });

          if (!alreadySent) {
            await this.handleReminder24h({
              booking,
              therapist: booking.therapistId,
            });
            results.remindersSent++;
          }
        } catch (err) {
          results.errors.push({ bookingId: booking._id, error: err.message });
        }
      }

      // 2. Process Post-Session follow-ups:
      // Bookings completed or confirmed where endTime has passed within the last 48 hours
      const pastWindowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const pastWindowEnd = now;

      const followupCandidates = await Booking.find({
        status: { $in: ["confirmed", "completed"] },
        endTime: { $gte: pastWindowStart, $lte: pastWindowEnd },
      }).populate("therapistId", "name practiceName email");

      for (const booking of followupCandidates) {
        try {
          const alreadySent = await NotificationLog.findOne({
            bookingId: booking._id,
            type: "post_session_followup",
            channel: "whatsapp",
          });

          if (!alreadySent) {
            await this.handlePostSessionFollowup({
              booking,
              therapist: booking.therapistId,
            });
            results.followupsSent++;
          }
        } catch (err) {
          results.errors.push({ bookingId: booking._id, error: err.message });
        }
      }
    } catch (err) {
      console.error("Error in processScheduledNotifications:", err);
      results.errors.push({ general: err.message });
    }

    return results;
  }

  /**
   * Starts background recurring reminder processor.
   * Runs an immediate check on startup to ensure notifications survive server restarts,
   * then continues running periodically.
   */
  startScheduler(intervalMs = 15 * 60 * 1000) {
    if (this.schedulerInterval) {
      return Promise.resolve();
    }

    // Run immediately on startup
    const startupPromise =
      mongoose.connection.readyState === 1
        ? this.processScheduledNotifications().catch((err) => {
            console.error("Error in initial processScheduledNotifications on startup:", err);
          })
        : Promise.resolve();

    this.schedulerInterval = setInterval(() => {
      if (mongoose.connection.readyState === 1) {
        this.processScheduledNotifications().catch((err) => {
          console.error("Error in recurring processScheduledNotifications:", err);
        });
      }
    }, intervalMs);

    if (this.schedulerInterval.unref) {
      this.schedulerInterval.unref();
    }

    return startupPromise;
  }

  /**
   * Stops background recurring processor (useful during graceful shutdown or tests)
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();

module.exports = {
  notificationService,
  NOTIFICATION_EVENTS,
};
