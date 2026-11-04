import { json } from "./http.js";

export const PAID_FEATURE_MESSAGE =
  "Branded client reports, custom report domains and the audit widget come with the Fix Pack. Buy one on any report with open problems to unlock them.";

export async function hasPaidFixPack(env, ownerEmail, access = null) {
  if (access?.accessMode === "founder-override") return true;
  if (!env.WAITLIST_DB || !ownerEmail) return false;
  const row = await env.WAITLIST_DB.prepare(`SELECT 1 AS paid FROM paid_owners WHERE owner_email = ? LIMIT 1`)
    .bind(ownerEmail)
    .first();
  return Boolean(row);
}

export function paidFeatureLockedResponse() {
  return json({ error: PAID_FEATURE_MESSAGE, code: "PAID_FEATURE_LOCKED" }, 402);
}
