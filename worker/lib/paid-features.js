/** @param {Env} env
 * @param {string} ownerEmail
 * @param {{ accessMode?: unknown } | null} [access]
 * @returns {Promise<boolean>}
 */
export async function hasPaidFixPack(env, ownerEmail, access = null) {
  if (access?.accessMode === "founder-override") return true;
  if (!env.WAITLIST_DB || !ownerEmail) return false;
  const row = await env.WAITLIST_DB.prepare(`SELECT 1 AS paid FROM paid_owners WHERE owner_email = ? LIMIT 1`)
    .bind(ownerEmail)
    .first();
  return Boolean(row);
}
