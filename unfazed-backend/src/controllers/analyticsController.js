const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Client = require("../models/Client");
const { canAccess, getEntitlements } = require("../services/entitlementService");

/**
 * Helper to compute date boundaries based on range string
 */
function resolveDateRange(range = "7d", customStart, customEnd) {
  const end = customEnd ? new Date(customEnd) : new Date();
  let start = customStart ? new Date(customStart) : null;
  let days = 7;

  if (!start) {
    switch (range) {
      case "30d":
        days = 30;
        break;
      case "90d":
        days = 90;
        break;
      case "1y":
      case "365d":
        days = 365;
        break;
      case "7d":
      default:
        days = 7;
        break;
    }
    start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  } else {
    days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  }

  return { start, end, days };
}

/**
 * Primary Therapist Practice Analytics API
 * Aggregates Revenue Trend, Active Clients, and No-Show Rates.
 * Enforces subscription entitlement restrictions on date ranges and metric depth.
 *
 * Route: GET /api/analytics
 * Access: Private (authMiddleware required)
 */
const getAnalytics = async (req, res) => {
  try {
    const therapistId = new mongoose.Types.ObjectId(req.therapistId);
    const { range = "7d", startDate, endDate } = req.query;

    const { start: requestedStart, end, days: requestedDays } = resolveDateRange(
      range,
      startDate,
      endDate
    );

    // 1. Entitlement Gate Check for Analytics Range & Depth (Module 7)
    const entitlement = await canAccess(req.therapistId, "detailed_analytics", {
      days: requestedDays,
      range,
    });

    let effectiveStart = requestedStart;
    let isClampedToEntitlement = false;

    // If therapist tier does not permit requested range, clamp to tier's maxDays
    if (!entitlement.allowed) {
      const allowedDays = entitlement.maxDays || 7;
      effectiveStart = new Date(end.getTime() - allowedDays * 24 * 60 * 60 * 1000);
      isClampedToEntitlement = true;
    }

    // 2. Revenue Trend Aggregation Pipeline
    const revenuePipeline = [
      {
        $match: {
          therapistId,
          status: "captured",
          createdAt: { $gte: effectiveStart, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          grossPaise: { $sum: "$amount" },
          platformFeePaise: { $sum: "$platformFee" },
          netEarningsPaise: { $sum: "$netTherapistAmount" },
          transactionsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const revenueTrendData = await Payment.aggregate(revenuePipeline);

    // Total in-period revenue sums
    const periodRevenue = revenueTrendData.reduce(
      (acc, item) => {
        acc.grossPaise += item.grossPaise;
        acc.platformFeePaise += item.platformFeePaise;
        acc.netEarningsPaise += item.netEarningsPaise;
        acc.transactionsCount += item.transactionsCount;
        return acc;
      },
      { grossPaise: 0, platformFeePaise: 0, netEarningsPaise: 0, transactionsCount: 0 }
    );

    // 3. Client Status Breakdown & Active Clients Aggregation
    const clientPipeline = [
      {
        $match: {
          therapist_id: therapistId,
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ];

    const clientStatusCounts = await Client.aggregate(clientPipeline);

    const clientStats = {
      total: 0,
      active: 0,
      lead: 0,
      inactive: 0,
      archived: 0,
      discharged: 0,
    };

    clientStatusCounts.forEach((group) => {
      if (group._id && clientStats[group._id] !== undefined) {
        clientStats[group._id] = group.count;
      }
      clientStats.total += group.count;
    });

    // 4. Appointment Status & No-Show Rate Aggregation Pipeline
    const appointmentPipeline = [
      {
        $match: {
          therapistId,
          startTime: { $gte: effectiveStart, $lte: end },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ];

    const appointmentCounts = await Booking.aggregate(appointmentPipeline);

    const bookingStats = {
      total: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };

    appointmentCounts.forEach((group) => {
      if (group._id && bookingStats[group._id] !== undefined) {
        bookingStats[group._id] = group.count;
      }
      bookingStats.total += group.count;
    });

    // Compute No-Show Rate:
    // Defined as no_show / (completed + no_show) if completed sessions exist,
    // or no_show / total bookings within the window.
    const resolvedSessions = bookingStats.completed + bookingStats.no_show;
    const noShowRate =
      resolvedSessions > 0
        ? Math.round((bookingStats.no_show / resolvedSessions) * 1000) / 10
        : bookingStats.total > 0
        ? Math.round((bookingStats.no_show / bookingStats.total) * 1000) / 10
        : 0;

    // Fetch unified therapist entitlements profile
    const therapistEntitlements = await getEntitlements(req.therapistId);

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          requestedRange: range,
          requestedDays,
          startDate: effectiveStart,
          endDate: end,
          isClamped: isClampedToEntitlement,
        },
        entitlements: therapistEntitlements,
        revenue: {
          trend: revenueTrendData.map((d) => ({
            date: d._id,
            grossPaise: d.grossPaise,
            netEarningsPaise: d.netEarningsPaise,
            transactionsCount: d.transactionsCount,
          })),
          summary: periodRevenue,
        },
        clients: {
          activeCount: clientStats.active,
          cap: therapistEntitlements?.activeClients?.cap || null,
          remainingSlots: therapistEntitlements?.activeClients?.remaining || null,
          statusBreakdown: clientStats,
        },
        appointments: {
          summary: bookingStats,
          noShowRatePercentage: noShowRate,
          attendanceRatePercentage: Math.max(0, 100 - noShowRate),
        },
        restrictionNotice: isClampedToEntitlement
          ? {
              restricted: true,
              message: entitlement.reason,
              currentTier: entitlement.currentTier,
              requiredTier: entitlement.requiredTier,
              maxAllowedDays: entitlement.maxDays,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while computing practice analytics.",
    });
  }
};

/**
 * Detailed Analytics API (Strictly Gated to Pro/Premium Tiers)
 * Route: GET /api/analytics/detailed
 * Access: Private (authMiddleware required)
 */
const getDetailedAnalytics = async (req, res) => {
  try {
    const entitlement = await canAccess(req.therapistId, "detailed_analytics", {
      requireDetailed: true,
    });

    if (!entitlement.allowed) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_RESTRICTED",
        message: entitlement.reason,
        entitlement,
      });
    }

    // Call base analytics with extended scope
    return getAnalytics(req, res);
  } catch (error) {
    console.error("Error in getDetailedAnalytics:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while retrieving detailed analytics.",
    });
  }
};

module.exports = {
  getAnalytics,
  getDetailedAnalytics,
};
