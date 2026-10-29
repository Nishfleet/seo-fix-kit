const OFFER_KEYS = {
  FIX_PACK: "fix_pack",
  MONITORING: "proof_monitoring",
  REPAIR_SPRINT: "repair_sprint",
  SEO_GEO_AGENT: "seo_geo_repair_agent",
  AGENCY_WORKSPACE: "agency_workspace"
};

const BETA_MONITOR_LIMIT = 5;
const PAID_MONITOR_LIMIT = BETA_MONITOR_LIMIT;

const OFFER_CATALOG = [
  {
    key: OFFER_KEYS.FIX_PACK,
    name: "SEO Fix Pack",
    type: "one_time",
    stage: "live_beta",
    statusLabel: "Live beta",
    priceRange: "Dodo checkout price",
    checkoutState: "report_checkout",
    description: "One guided repair pass on one saved report, then one rerun to check the fixes.",
    availability: "Buy it from a saved report that has open problems.",
    requirements: ["Saved report", "Proven findings", "Dodo checkout config", "No ranking promises"],
    limits: { reports: 1, reruns: 1 }
  },
  {
    key: OFFER_KEYS.MONITORING,
    name: "Proof Monitoring",
    type: "subscription",
    stage: "beta_gated",
    statusLabel: "Config gated",
    priceRange: "$49-$99/mo target",
    checkoutState: "account_checkout",
    description: "Scheduled reruns on verified sites, with a list of what got fixed, what's still open and what's new.",
    availability:
      "For verified sites. Weekly monitoring is free during the beta. The paid plan is sold only once checkout is turned on.",
    requirements: ["Verified site", "Audit schedules", "Report deltas", "Billing entitlement"],
    limits: { monitoredSites: PAID_MONITOR_LIMIT, cadenceDays: 7 }
  },
  {
    key: OFFER_KEYS.REPAIR_SPRINT,
    name: "Repair Sprint",
    type: "one_time",
    stage: "beta_gated",
    statusLabel: "Config gated",
    priceRange: "$249-$499 one-time target",
    checkoutState: "report_checkout",
    description: "A fixed list of repairs you approve, notes on what changed, and a final rerun.",
    availability:
      "Starts from a report once you approve at least one proposed fix. Sold only once checkout is turned on.",
    requirements: ["Saved report", "Executable proposals", "Owner approval", "Final rerun proof"],
    limits: { proposalQueue: 1, reruns: 1 }
  },
  {
    key: OFFER_KEYS.SEO_GEO_AGENT,
    name: "SEO/GEO Repair Agent",
    type: "subscription",
    stage: "planned",
    statusLabel: "Planned",
    priceRange: "$199-$399/mo target",
    checkoutState: "paused",
    description: "Regular SEO and AI search readiness fix proposals based on fresh audits.",
    availability: "Planned. Not available yet.",
    requirements: ["Verified site", "Recurring monitors", "Keyword or opportunity inputs", "Owner approval"],
    limits: { monitoredSites: 1, monthlyProposalBatches: 1 }
  },
  {
    key: OFFER_KEYS.AGENCY_WORKSPACE,
    name: "Agency Workspace",
    type: "subscription",
    stage: "planned",
    statusLabel: "Planned",
    priceRange: "$299-$799/mo target",
    checkoutState: "paused",
    description: "Branded reports for several clients, client share links, team assignment and repair status.",
    availability: "Planned. Not available yet.",
    requirements: ["Branding", "Client share links", "Team members", "Workspace entitlements"],
    limits: { clientSites: 5, teamSeats: 3 }
  }
];

const BETA_AGENCY_LIMITS = {
  clientLinksPerReport: 10,
  teamSeats: 10,
  reportDomains: 1,
  clientSites: 5
};

function offerCatalog({
  fixPackCheckoutReady = false,
  monitoringCheckoutReady = false,
  repairSprintCheckoutReady = false,
  entitlements = []
} = {}) {
  const entitlementMap = new Map((entitlements || []).map((row) => [row.offer_key || row.offerKey, row]));
  return OFFER_CATALOG.map((offer) => {
    const entitlement = entitlementMap.get(offer.key) || null;
    const repairSprintProviderReady = repairSprintCheckoutReady && offer.checkoutState === "report_checkout";
    const liveCheckout =
      offer.key === OFFER_KEYS.FIX_PACK
        ? fixPackCheckoutReady && offer.checkoutState === "report_checkout"
        : offer.key === OFFER_KEYS.MONITORING
          ? monitoringCheckoutReady && offer.checkoutState === "account_checkout"
          : false;
    return {
      ...offer,
      statusLabel:
        entitlement?.status === "active" ? "Active entitlement" : liveCheckout ? "Checkout live" : offer.statusLabel,
      checkoutLive: liveCheckout,
      checkoutConfigured: offer.key === OFFER_KEYS.REPAIR_SPRINT ? repairSprintProviderReady : liveCheckout,
      entitlementStatus: entitlement?.status || "inactive",
      entitlementSource: entitlement?.source || "",
      currentPeriodEnd: entitlement?.current_period_end || entitlement?.currentPeriodEnd || "",
      limits: effectiveOfferLimits(offer, parseLimits(entitlement?.limits_json || entitlement?.limitsJson))
    };
  });
}

function effectiveOfferLimits(offer, storedLimits) {
  const limits = { ...offer.limits, ...storedLimits };
  if (offer.key === OFFER_KEYS.MONITORING) {
    limits.monitoredSites = Math.max(Number(limits.monitoredSites || 0), PAID_MONITOR_LIMIT);
  }
  return limits;
}

function monitoringAccessFromEntitlements(entitlements = [], activeCount = 0, options = {}) {
  const entitlement = (entitlements || []).find(
    (row) => (row.offer_key || row.offerKey) === OFFER_KEYS.MONITORING && row.status === "active"
  );
  const limits = parseLimits(entitlement?.limits_json || entitlement?.limitsJson);
  const limit = entitlement
    ? Math.max(Number(limits.monitoredSites || limits.monitors || 0), PAID_MONITOR_LIMIT)
    : BETA_MONITOR_LIMIT;
  const checkoutLive = Boolean(options.checkoutLive);
  return {
    offerKey: OFFER_KEYS.MONITORING,
    status: entitlement ? "active" : "beta_allowance",
    activeCount: Number(activeCount || 0),
    limit,
    remaining: Math.max(0, limit - Number(activeCount || 0)),
    cadenceDays: Number(limits.cadenceDays || 7),
    checkoutLive,
    currentPeriodEnd: entitlement?.current_period_end || entitlement?.currentPeriodEnd || "",
    message: entitlement
      ? "Paid monitoring is active for this workspace."
      : checkoutLive
        ? "You can buy monitoring for verified sites. It turns on once payment is confirmed."
        : "Weekly monitoring is included free for verified sites during the beta."
  };
}

function repairSprintEligibilityFromProposals(proposals = [], fixRequest = null, options = {}) {
  const executable = (proposals || []).filter(
    (proposal) => (proposal.executionMode || proposal.execution_mode) !== "unsupported"
  );
  const approved = executable.filter(
    (proposal) => (proposal.approvalStatus || proposal.approval_status) === "approved"
  );
  const delivered = executable.filter(
    (proposal) => (proposal.deliveryStatus || proposal.delivery_status) === "delivered"
  );
  const paidStatus = fixRequest?.status || "";
  const hasPaidRequest = ["paid", "in_progress", "delivered"].includes(paidStatus);
  const checkoutReady = Boolean(options.checkoutReady);
  const status = !executable.length
    ? "unsupported"
    : approved.length
      ? hasPaidRequest
        ? "active"
        : "approval_ready"
      : "needs_owner_approval";
  return {
    offerKey: OFFER_KEYS.REPAIR_SPRINT,
    status,
    checkoutReady,
    checkoutLive: status === "approval_ready" && checkoutReady,
    checkoutPath: "/api/beta/repair-sprint-checkout",
    priceRange: "$249-$499 one-time target",
    executable: executable.length,
    approved: approved.length,
    delivered: delivered.length,
    hasPaidRequest,
    message:
      status === "unsupported"
        ? "This report has no fixes we can carry out as a Repair Sprint."
        : status === "needs_owner_approval"
          ? "Approve at least one proposed fix to start a Repair Sprint."
          : hasPaidRequest
            ? "This report has a paid Fix Pack, so the approved fixes go through it."
            : checkoutReady
              ? "You can buy a Repair Sprint for the fixes you approved."
              : "Your fixes are approved. Repair Sprint isn't on sale yet."
  };
}

function agencyWorkspaceAccessFromEntitlements(entitlements = [], usage = {}) {
  const entitlement = (entitlements || []).find(
    (row) => (row.offer_key || row.offerKey) === OFFER_KEYS.AGENCY_WORKSPACE && row.status === "active"
  );
  const limits = {
    ...BETA_AGENCY_LIMITS,
    ...parseLimits(entitlement?.limits_json || entitlement?.limitsJson)
  };
  return {
    offerKey: OFFER_KEYS.AGENCY_WORKSPACE,
    status: entitlement ? "active" : "beta_allowance",
    checkoutLive: false,
    limits,
    usage: {
      clientLinks: Number(usage.clientLinks || 0),
      teamSeats: Number(usage.teamSeats || 0),
      reportDomains: Number(usage.reportDomains || 0),
      clientSites: Number(usage.clientSites || 0)
    },
    message: entitlement
      ? "Agency Workspace is active for this workspace."
      : "Branded client reports and the audit widget come with the Fix Pack. Agency Workspace isn't on sale yet."
  };
}

function sellableOffers(offers = []) {
  return offers.filter((offer) => offer.checkoutLive || offer.entitlementStatus === "active");
}

function parseLimits(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export {
  OFFER_KEYS,
  OFFER_CATALOG,
  BETA_AGENCY_LIMITS,
  BETA_MONITOR_LIMIT,
  PAID_MONITOR_LIMIT,
  agencyWorkspaceAccessFromEntitlements,
  offerCatalog,
  monitoringAccessFromEntitlements,
  repairSprintEligibilityFromProposals,
  sellableOffers
};
