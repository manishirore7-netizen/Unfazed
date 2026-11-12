const {
  SubscriptionTierConfig,
  SUBSCRIPTION_TIERS,
} = require("../config/subscriptionTierConfig");
const {
  getEntitlements,
  entitlementService,
} = require("../services/entitlementService");

/**
 * Get current therapist's subscription profile and entitlements
 * Route: GET /api/subscriptions/entitlements
 * Access: Private (authMiddleware required)
 */
const getMySubscription = async (req, res) => {
  try {
    const entitlements = await getEntitlements(req.therapistId);
    if (!entitlements) {
      return res.status(404).json({
        success: false,
        message: "Therapist subscription not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: entitlements,
    });
  } catch (error) {
    console.error("Error retrieving subscription entitlements:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while retrieving subscription.",
    });
  }
};

/**
 * Switch therapist subscription tier (for demonstration, testing, and plan upgrade flows)
 * Route: POST /api/subscriptions/tier
 * Access: Private (authMiddleware required)
 */
const switchTier = async (req, res) => {
  try {
    const { tier, status = "active", currentPeriodEnd = null } = req.body;

    if (!tier || !SubscriptionTierConfig[tier]) {
      return res.status(400).json({
        success: false,
        message: `Invalid subscription tier '${tier}'. Valid options: ${Object.values(SUBSCRIPTION_TIERS).join(", ")}.`,
      });
    }

    await entitlementService.setTherapistTier(req.therapistId, tier, {
      status,
      currentPeriodEnd,
    });

    const updatedEntitlements = await getEntitlements(req.therapistId);

    return res.status(200).json({
      success: true,
      message: `Subscription successfully updated to ${updatedEntitlements.tierName} plan.`,
      data: updatedEntitlements,
    });
  } catch (error) {
    console.error("Error switching subscription tier:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update subscription tier.",
    });
  }
};

/**
 * Public/Private metadata endpoint: list all available subscription tiers
 * Route: GET /api/subscriptions/tiers
 */
const getTiersList = (req, res) => {
  return res.status(200).json({
    success: true,
    data: SubscriptionTierConfig,
  });
};

module.exports = {
  getMySubscription,
  switchTier,
  getTiersList,
};
