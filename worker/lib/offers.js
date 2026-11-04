import {
  agencyWorkspaceAccessFromEntitlements,
  monitoringAccessFromEntitlements,
  offerCatalog
} from "../../shared/offers.js";
import { dodoMonitoringCheckoutConfigStatus, dodoRepairSprintCheckoutConfigStatus } from "../../shared/dodo.js";

/** @typedef {import("../../shared/offers.js").OfferEntitlementRow} OfferEntitlementRow */

/** @param {Env} env
 * @param {string} ownerEmail
 * @returns {Promise<OfferEntitlementRow[]>}
 */
async function offerEntitlementsForOwner(env, ownerEmail) {
  if (!env.WAITLIST_DB || !ownerEmail) return [];
  try {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM offer_entitlements
       WHERE owner_email = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(ownerEmail)
      .all();
    return /** @type {OfferEntitlementRow[]} */ (rows.results || []);
  } catch {
    return [];
  }
}

/** @param {Env} env
 * @param {string} ownerEmail
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<ReturnType<typeof offerCatalog>>}
 */
async function offerCatalogForOwner(env, ownerEmail, options = {}) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return offerCatalog({
    monitoringCheckoutReady: await monitoringCheckoutReady(env),
    repairSprintCheckoutReady: dodoRepairSprintCheckoutConfigStatus(env).checkoutReady,
    ...options,
    entitlements
  });
}

/** @param {Env} env
 * @param {string} ownerEmail
 * @param {number} [activeCount]
 * @returns {Promise<ReturnType<typeof monitoringAccessFromEntitlements>>}
 */
async function monitoringAccessForOwner(env, ownerEmail, activeCount = 0) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return monitoringAccessFromEntitlements(entitlements, activeCount, {
    checkoutLive: await monitoringCheckoutReady(env)
  });
}

/** @param {Env} env
 * @param {string} ownerEmail
 * @param {Record<string, unknown>} [usage]
 * @returns {Promise<ReturnType<typeof agencyWorkspaceAccessFromEntitlements>>}
 */
async function agencyWorkspaceAccessForOwner(env, ownerEmail, usage = {}) {
  const entitlements = await offerEntitlementsForOwner(env, ownerEmail);
  return agencyWorkspaceAccessFromEntitlements(entitlements, usage);
}

/** @param {Env} env
 * @returns {Promise<boolean>}
 */
async function monitoringCheckoutReady(env) {
  if (!dodoMonitoringCheckoutConfigStatus(env).checkoutReady) return false;
  return monitoringEntitlementSchemaReady(env);
}

/** @param {Env} env
 * @returns {Promise<boolean>}
 */
async function monitoringEntitlementSchemaReady(env) {
  if (!env.WAITLIST_DB) return false;
  try {
    await env.WAITLIST_DB.prepare(
      "SELECT owner_email, offer_key, subscription_id, limits_json, revoked_at FROM offer_entitlements LIMIT 1"
    ).first();
    await env.WAITLIST_DB.prepare("SELECT owner_email, offer_key, event FROM offer_entitlement_events LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

export {
  agencyWorkspaceAccessForOwner,
  offerCatalogForOwner,
  offerEntitlementsForOwner,
  monitoringAccessForOwner,
  monitoringCheckoutReady
};
