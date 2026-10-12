import { safeDodoCheckoutUrl } from "./dodo-checkout-url.js";

function monitoringCheckoutDisabled({ checkoutReady = false, status = "idle", hasEligibleSite = true } = {}) {
  return status === "submitting" || !checkoutReady || !hasEligibleSite;
}

// `offerName` keeps the fallback copy truthful when a different one-time offer
// (Repair Sprint) reuses this outcome shape.
function monitoringCheckoutOutcome(payload = {}, { offerName = "Proof Monitoring" } = {}) {
  const checkoutUrl = safeDodoCheckoutUrl(payload.checkoutUrl || "");
  if (checkoutUrl) {
    return {
      status: "redirecting",
      message: payload.message || "Opening checkout…",
      checkoutUrl
    };
  }
  if (payload.checkoutUrl) {
    return {
      status: "error",
      message:
        "Checkout sent back a link we couldn’t verify, so we didn’t open it. Try again or email support@seofixkit.com.",
      checkoutUrl: ""
    };
  }
  if (payload.mode === "active") {
    return {
      status: "success",
      message: payload.message || `${offerName} is already active.`,
      checkoutUrl: ""
    };
  }
  return {
    status: payload.checkoutAvailable === false ? "unavailable" : "error",
    message: payload.message || payload.error || `${offerName} checkout is unavailable.`,
    checkoutUrl: ""
  };
}

function monitoringCheckoutErrorOutcome(error, { offerName = "Proof Monitoring" } = {}) {
  return {
    status: "error",
    message: error?.message || `${offerName} checkout is unavailable.`,
    checkoutUrl: ""
  };
}

export { monitoringCheckoutDisabled, monitoringCheckoutErrorOutcome, monitoringCheckoutOutcome };
