const mongoose = require("mongoose");
const Therapist = require("../models/Therapist");
const Client = require("../models/Client");
const {
  SUBSCRIPTION_TIERS,
  SubscriptionTierConfig,
  DEFAULT_TIER,
  getTierConfig,
} = require("../config/subscriptionTierConfig");

class EntitlementService {
  /**
   * Resolves the active subscription tier for a therapist.
   * Handles missing, canceled, or expired subscriptions safely by falling back to DEFAULT_TIER.
   */
  async resolveTherapistSubscription(therapistOrId) {
    let therapist = therapistOrId;

    if (!therapist || typeof therapist === "string" || therapist instanceof mongoose.Types.ObjectId) {
      therapist = await Therapist.findById(therapistOrId);
    }

    if (!therapist) {
      return {
        therapist: null,
        tier: DEFAULT_TIER,
        status: "inactive",
        config: getTierConfig(DEFAULT_TIER),
        isExpired: false,
      };
    }

    const sub = therapist.subscription || {};
    const rawTier = sub.tier || DEFAULT_TIER;
    const status = sub.status || "active";

    // Check expiration if end date is set
    const now = new Date();
    const isPastDue = status === "expired" || status === "canceled";
    const isPeriodExpired = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < now;

    if (isPastDue || isPeriodExpired) {
      return {
        therapist,
        tier: DEFAULT_TIER,
        status: isPastDue ? status : "expired",
        config: getTierConfig(DEFAULT_TIER),
        isExpired: true,
        previousTier: rawTier,
      };
    }

    return {
      therapist,
      tier: rawTier in SubscriptionTierConfig ? rawTier : DEFAULT_TIER,
      status,
      config: getTierConfig(rawTier),
      isExpired: false,
    };
  }

  /**
   * Evaluates feature access for a therapist based on their subscription tier and usage limits.
   * Central gate for all subscription entitlement decisions across Unfazed.
   *
   * @param {string|mongoose.Types.ObjectId} therapistId
   * @param {string} featureKey - "active_clients" | "note_templates" | "detailed_analytics"
   * @param {object} context - Feature-specific parameters (e.g. { template: "soap" }, { days: 30 })
   * @returns {Promise<{ allowed: boolean, reason?: string, currentTier: string, requiredTier?: string, ... }>}
   */
  async canAccess(therapistId, featureKey, context = {}) {
    const subInfo = await this.resolveTherapistSubscription(therapistId);
    const { therapist, tier, config, isExpired } = subInfo;

    if (!therapist) {
      return {
        allowed: false,
        reason: "Therapist account not found.",
        currentTier: DEFAULT_TIER,
      };
    }

    // 1. ACTIVE CLIENT CAP GATE
    if (featureKey === "active_clients") {
      const activeCount = await Client.countDocuments({
        therapist_id: therapist._id,
        status: "active",
      });

      // null activeClientsCap indicates unlimited clients (Premium tier)
      if (config.activeClientsCap !== null && activeCount >= config.activeClientsCap) {
        const requiredTier = tier === SUBSCRIPTION_TIERS.STARTER ? SUBSCRIPTION_TIERS.PRO : SUBSCRIPTION_TIERS.PREMIUM;
        return {
          allowed: false,
          featureKey: "active_clients",
          reason: `Active client limit reached (${activeCount}/${config.activeClientsCap}) for the ${config.name} plan. Upgrade to expand your active client capacity.`,
          currentTier: tier,
          requiredTier,
          limit: config.activeClientsCap,
          currentCount: activeCount,
          isExpired,
        };
      }

      return {
        allowed: true,
        featureKey: "active_clients",
        currentTier: tier,
        limit: config.activeClientsCap,
        currentCount: activeCount,
        remaining: config.activeClientsCap !== null ? config.activeClientsCap - activeCount : null,
      };
    }

    // 2. CLINICAL NOTE TEMPLATE GATE
    if (featureKey === "note_templates") {
      const template = (context.template || "freeform").toLowerCase().trim();

      // Freeform notes are universally allowed on all tiers
      if (template === "freeform") {
        return {
          allowed: true,
          featureKey: "note_templates",
          currentTier: tier,
          template: "freeform",
        };
      }

      if (!config.allowedNoteTemplates.includes(template)) {
        const requiredTier = ["soap", "dap"].includes(template)
          ? SUBSCRIPTION_TIERS.PRO
          : SUBSCRIPTION_TIERS.PREMIUM;

        return {
          allowed: false,
          featureKey: "note_templates",
          reason: `The '${template.toUpperCase()}' structured template is not available on the ${config.name} plan. Upgrade to unlock clinical templates.`,
          currentTier: tier,
          requiredTier,
          requestedTemplate: template,
          allowedTemplates: config.allowedNoteTemplates,
          isExpired,
        };
      }

      return {
        allowed: true,
        featureKey: "note_templates",
        currentTier: tier,
        template,
        allowedTemplates: config.allowedNoteTemplates,
      };
    }

    // 3. ANALYTICS DEPTH & DATE RANGE GATE
    if (featureKey === "detailed_analytics") {
      const requestedDays = parseInt(context.days, 10) || 0;

      if (requestedDays > config.analytics.maxDays) {
        const requiredTier = tier === SUBSCRIPTION_TIERS.STARTER
          ? SUBSCRIPTION_TIERS.PRO
          : SUBSCRIPTION_TIERS.PREMIUM;

        return {
          allowed: false,
          featureKey: "detailed_analytics",
          reason: `Analytics beyond ${config.analytics.maxDays} days require a ${requiredTier === SUBSCRIPTION_TIERS.PRO ? "Professional" : "Premium"} subscription.`,
          currentTier: tier,
          requiredTier,
          maxDays: config.analytics.maxDays,
          requestedDays,
          depth: config.analytics.depth,
          isExpired,
        };
      }

      if (context.requireDetailed && !config.analytics.allowDetailedBreakdown) {
        return {
          allowed: false,
          featureKey: "detailed_analytics",
          reason: `Detailed breakdown and trends require a Professional or Premium subscription.`,
          currentTier: tier,
          requiredTier: SUBSCRIPTION_TIERS.PRO,
          maxDays: config.analytics.maxDays,
          depth: config.analytics.depth,
          isExpired,
        };
      }

      return {
        allowed: true,
        featureKey: "detailed_analytics",
        currentTier: tier,
        maxDays: config.analytics.maxDays,
        depth: config.analytics.depth,
        allowExport: config.analytics.allowExport,
      };
    }

    // 4. GENERIC FEATURE CONFIG CHECK
    if (config.features && config.features[featureKey] !== undefined) {
      const allowed = Boolean(config.features[featureKey]);
      return {
        allowed,
        featureKey,
        currentTier: tier,
        reason: allowed ? undefined : `This feature requires an upgraded subscription plan.`,
        isExpired,
      };
    }

    // Default permit for unspecified features
    return {
      allowed: true,
      featureKey,
      currentTier: tier,
    };
  }

  /**
   * Returns a complete entitlement profile for the therapist.
   * Used by frontend dashboards to configure UI elements and display upgrade options.
   */
  async getEntitlements(therapistId) {
    const subInfo = await this.resolveTherapistSubscription(therapistId);
    const { therapist, tier, status, config, isExpired } = subInfo;

    if (!therapist) {
      return null;
    }

    const activeClientsCount = await Client.countDocuments({
      therapist_id: therapist._id,
      status: "active",
    });

    return {
      tier,
      tierName: config.name,
      badge: config.badge,
      status,
      isExpired,
      currentPeriodEnd: therapist.subscription?.currentPeriodEnd || null,
      activeClients: {
        count: activeClientsCount,
        cap: config.activeClientsCap,
        remaining: config.activeClientsCap !== null ? Math.max(0, config.activeClientsCap - activeClientsCount) : null,
        isLimitReached: config.activeClientsCap !== null && activeClientsCount >= config.activeClientsCap,
      },
      noteTemplates: {
        allowed: config.allowedNoteTemplates,
      },
      analytics: {
        depth: config.analytics.depth,
        maxDays: config.analytics.maxDays,
        allowExport: config.analytics.allowExport,
        allowDetailedBreakdown: config.analytics.allowDetailedBreakdown,
      },
      availableTiers: SubscriptionTierConfig,
    };
  }

  /**
   * Updates therapist subscription tier (for demo upgrades/downgrades/testing).
   */
  async setTherapistTier(therapistId, newTier, options = {}) {
    if (!SubscriptionTierConfig[newTier]) {
      throw new Error(`Invalid subscription tier '${newTier}'. Valid tiers: ${Object.keys(SubscriptionTierConfig).join(", ")}`);
    }

    const updateFields = {
      "subscription.tier": newTier,
      "subscription.status": options.status || "active",
      "subscription.currentPeriodStart": options.currentPeriodStart || new Date(),
      "subscription.currentPeriodEnd": options.currentPeriodEnd || null,
    };

    const therapist = await Therapist.findByIdAndUpdate(
      therapistId,
      { $set: updateFields },
      { new: true }
    );

    return therapist;
  }
}

const entitlementService = new EntitlementService();

module.exports = {
  entitlementService,
  canAccess: (therapistId, featureKey, context) =>
    entitlementService.canAccess(therapistId, featureKey, context),
  getEntitlements: (therapistId) => entitlementService.getEntitlements(therapistId),
};
