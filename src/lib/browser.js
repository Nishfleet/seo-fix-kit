import { FUNNEL_KEY } from "./constants.js";

export function reportIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/beta\/reports\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function copyText(value) {
  if (!value || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function trackingPayload(formStartedAt) {
  const params = new URLSearchParams(window.location.search);
  return {
    landingPath: `${window.location.pathname}${window.location.search}` || "/",
    timeToSubmitMs: Date.now() - formStartedAt,
    utm: {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      term: params.get("utm_term") || "",
      content: params.get("utm_content") || ""
    }
  };
}

export function readOrCreateFunnelKey() {
  try {
    const existing = window.sessionStorage.getItem(FUNNEL_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    const key = "fk_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.sessionStorage.setItem(FUNNEL_KEY, key);
    return key;
  } catch {
    return "";
  }
}

export function sendAccessBeacon(step, { funnelKey = "", source = "", landingPath = "", timeOnPageMs = null } = {}) {
  try {
    if (!navigator.sendBeacon && !window.fetch) return;
    const body = JSON.stringify({
      step,
      funnelKey,
      source,
      landingPath,
      timeOnPageMs
    });
    const blob = new Blob([body], { type: "application/json" });
    const beacon = navigator.sendBeacon ? navigator.sendBeacon("/api/access/track", blob) : false;
    if (!beacon) {
      window
        .fetch("/api/access/track", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true
        })
        .catch(() => {});
    }
  } catch {}
}
