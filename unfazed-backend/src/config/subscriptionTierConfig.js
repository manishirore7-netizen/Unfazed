/**
 * Subscription Tier Configuration
 * Centralized, configuration-driven definition of subscription tiers, monetary values,
 * active-client limits, clinical note template permissions, and analytics depth.
 */

const SUBSCRIPTION_TIERS = Object.freeze({
  STARTER: "starter",
  PRO: "pro",
  PREMIUM: "premium",
});

const SubscriptionTierConfig = Object.freeze({
  [SUBSCRIPTION_TIERS.STARTER]: {
    id: SUBSCRIPTION_TIERS.STARTER,
    name: "Starter",
    badge: "Starter Plan",
    description: "Essential practice management for solo practitioners starting out.",
    priceMonthlyINR: 0,
    activeClientsCap: 5,
    allowedNoteTemplates: ["freeform"],
    analytics: {
      depth: "basic",
      maxDays: 7,
      allowExport: false,
      allowDetailedBreakdown: false,
    },
    features: {
      clientPortal: true,
      realtimeChat: true,
      notifications: true,
      basicNotes: true,
      advancedNotes: false,
      detailedAnalytics: false,
    },
  },
  [SUBSCRIPTION_TIERS.PRO]: {
    id: SUBSCRIPTION_TIERS.PRO,
    name: "Professional",
    badge: "Pro Plan",
    description: "Expanded client capacity and structured clinical documentation for active practices.",
    priceMonthlyINR: 1499,
    activeClientsCap: 25,
    allowedNoteTemplates: ["freeform", "soap", "dap"],
    analytics: {
      depth: "standard",
      maxDays: 30,
      allowExport: true,
      allowDetailedBreakdown: true,
    },
    features: {
      clientPortal: true,
      realtimeChat: true,
      notifications: true,
      basicNotes: true,
      advancedNotes: true,
      detailedAnalytics: true,
    },
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    id: SUBSCRIPTION_TIERS.PREMIUM,
    name: "Premium",
    badge: "Premium Plan",
    description: "Unlimited client capacity with advanced clinical templates and deep longitudinal analytics.",
    priceMonthlyINR: 3999,
    activeClientsCap: null, // null represents unlimited active clients
    allowedNoteTemplates: ["freeform", "soap", "dap", "girp", "birp"],
    analytics: {
      depth: "detailed",
      maxDays: 365,
      allowExport: true,
      allowDetailedBreakdown: true,
    },
    features: {
      clientPortal: true,
      realtimeChat: true,
      notifications: true,
      basicNotes: true,
      advancedNotes: true,
      detailedAnalytics: true,
    },
  },
});

const DEFAULT_TIER = SUBSCRIPTION_TIERS.STARTER;

/**
 * Returns configuration object for given tier with safe fallback to DEFAULT_TIER.
 */
function getTierConfig(tier) {
  if (tier && SubscriptionTierConfig[tier]) {
    return SubscriptionTierConfig[tier];
  }
  return SubscriptionTierConfig[DEFAULT_TIER];
}

module.exports = {
  SUBSCRIPTION_TIERS,
  SubscriptionTierConfig,
  DEFAULT_TIER,
  getTierConfig,
};
