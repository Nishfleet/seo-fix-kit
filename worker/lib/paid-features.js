import { json } from "./http.js";

export const PAID_FIX_PACK_STATUSES = ["paid", "in_progress", "delivered"];

export const PAID_FEATURE_MESSAGE =
  "Branded client reports, custom report domains and the audit widget come with the Fix Pack. Buy one on any report with open problems to unlock them.";

// Agency features unlock once the owner has bought at least one Fix Pack that wasn't refunded, disputed or a test payment.
export async function hasPaidFixPack(env, ownerEmail, access = null) {
  if (access?.accessMode === "founder-override") return true;
  if (!env.WAITLIST_DB || !ownerEmail) return false;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT 1 AS paid FROM fix_requests
     WHERE owner_email = ? AND status IN (${PAID_FIX_PACK_STATUSES.map(() => "?").join(", ")}) AND is_test = 0
     LIMIT 1`
  )
    .bind(ownerEmail, ...PAID_FIX_PACK_STATUSES)
    .first();
  return Boolean(row);
}

export function paidFeatureLockedResponse() {
  return json({ error: PAID_FEATURE_MESSAGE, code: "PAID_FEATURE_LOCKED" }, 402);
}
