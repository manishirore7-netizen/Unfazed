const mongoose = require("mongoose");
const NotificationLog = require("../models/NotificationLog");
const { notificationService } = require("../services/notificationService");

/**
 * Get notification history for authenticated therapist
 * Route: GET /api/notifications
 * Access: Private (Therapist)
 */
const getNotifications = async (req, res) => {
  try {
    const { clientId, bookingId, limit = 50 } = req.query;
    const filter = { therapistId: req.therapistId };

    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      filter.clientId = clientId;
    }
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
      filter.bookingId = bookingId;
    }

    const notifications = await NotificationLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 100));

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error("Error retrieving notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notification logs.",
    });
  }
};

/**
 * Manually trigger the scheduled reminder/followup processor
 * Route: POST /api/notifications/process-reminders
 * Access: Private (Therapist)
 */
const triggerScheduledNotifications = async (req, res) => {
  try {
    const results = await notificationService.processScheduledNotifications();
    return res.status(200).json({
      success: true,
      message: "Scheduled notifications processed successfully.",
      results,
    });
  } catch (error) {
    console.error("Error processing scheduled notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process scheduled notifications.",
    });
  }
};

module.exports = {
  getNotifications,
  triggerScheduledNotifications,
};
