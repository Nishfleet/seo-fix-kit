// upstream: https://developers.cloudflare.com/queues/ — "Have it fixed for you" (seo-fix-kit#412, TinyStudio.io-public#149): the Worker puts each request on the Cloudflare Queue `tinystudio-requests` through a producer binding — no signed HTTP call and no shared secret; the browser never calls TinyStudio. This file is the message contract both sides share.

/** @param {string} [consentText] test override; the default is the owner's consent line (Nish, 2026-11-12) — the email is used for this request only, never for a marketing list
 *  @returns {string} the consent line sent to TinyStudio */
export function fixForMeConsentText(consentText) {
  return (
    consentText ||
    "Send my site address, email and this report to TinyStudio, the repair desk. TinyStudio uses your email to reply about this request only — never for a marketing list."
  );
}

export const FIX_FOR_ME_CONSENT_TEXT = fixForMeConsentText();

const FIX_FOR_ME_LIMITS = { site: 2000, email: 254, reportId: 128 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** @param {unknown} [input] the visitor's confirmation: site, email, reportId
 *  @returns {{ ok: true, value: { site: string, email: string, reportId: string } } | { ok: false, error: string }} */
export function normalizeFixForMeRequest(input = {}) {
  const rawSite = clean(input.site, FIX_FOR_ME_LIMITS.site);
  const email = clean(input.email, FIX_FOR_ME_LIMITS.email).toLowerCase();
  const reportId = clean(input.reportId, FIX_FOR_ME_LIMITS.reportId);

  if (!rawSite) return { ok: false, error: "Enter your site address." };
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`);
  } catch {
    return { ok: false, error: "Enter your site address, like example.com." };
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    return { ok: false, error: "Enter your site address, like example.com." };
  }
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Enter a valid email address." };

  return { ok: true, value: { site: url.href, email, reportId } };
}

/** @param {{ site: string, email: string, reportId: string, consentText?: string }} request — the message the contract fixes: site, email, reportId, consentText
 *  @returns {{ site: string, email: string, reportId: string, consentText: string }} the exact message sent to the `tinystudio-requests` queue */
export function fixForMeQueueMessage({ site, email, reportId, consentText = FIX_FOR_ME_CONSENT_TEXT }) {
  return { site, email, reportId, consentText };
}
