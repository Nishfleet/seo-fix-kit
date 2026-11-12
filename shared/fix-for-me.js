// upstream: https://docs.stripe.com/webhooks — Stripe and GitHub sign webhooks the same way, an HMAC over "<timestamp>.<raw body>" with a shared secret; this file is that contract for "Have it fixed for you" (seo-fix-kit#412, TinyStudio.io-public#149), sent by the Worker with the shared secret SEOFIXKIT_REQUEST_SECRET — the browser never calls TinyStudio.
export const TINY_STUDIO_ORIGIN = "https://tinystudio.io";
export const TINY_STUDIO_REQUEST_PATH = "/api/requests/from-seofixkit";
export const TINY_STUDIO_REQUEST_URL = `${TINY_STUDIO_ORIGIN}${TINY_STUDIO_REQUEST_PATH}`;

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

/** @param {{ secret: string, timestamp: number, rawBody: string }} options
 *  @returns {Promise<{ "X-TinyStudio-Timestamp": string, "X-TinyStudio-Signature": string }>} */
export async function tinyStudioSignatureHeaders({ secret, timestamp, rawBody }) {
  const signingSecret = String(secret || "");
  if (!signingSecret) {
    throw new Error("Fix-request signing is not configured. Set the SEOFIXKIT_REQUEST_SECRET secret.");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    "X-TinyStudio-Timestamp": String(Math.floor(timestamp)),
    "X-TinyStudio-Signature": `sha256=${hex}`
  };
}

/** @param {{ site: string, email: string, reportId: string, consentText?: string }} request — the JSON body the contract fixes: site, email, reportId, consentText
 *  @returns {string} the exact raw body that gets signed */
export function tinyStudioRequestBody({ site, email, reportId, consentText = FIX_FOR_ME_CONSENT_TEXT }) {
  return JSON.stringify({ site, email, reportId, consentText });
}
