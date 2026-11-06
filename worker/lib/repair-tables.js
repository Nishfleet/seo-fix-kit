import { jsonNoStore } from "./http.js";

const REPAIR_TABLES_MISSING_CODE = "REPAIR_QUEUE_MIGRATION_MISSING";

/** @param {unknown} error
 * @returns {boolean}
 */
function isRepairTablesMissingError(error) {
  const message = String(/** @type {{ message?: unknown }} */ (error)?.message || error || "").toLowerCase();
  return (
    (message.includes("no such table") || message.includes("does not exist") || message.includes("not found")) &&
    (message.includes("repair_queue_items") ||
      message.includes("repair_agent_actions") ||
      message.includes("repair_proposals"))
  );
}

function repairTablesMissingResponse() {
  return jsonNoStore(
    {
      error: "Repair queue storage has not been migrated yet.",
      code: REPAIR_TABLES_MISSING_CODE
    },
    503
  );
}

/** @param {D1PreparedStatement} statement
 * @returns {Promise<{ results: unknown[], repairTablesMissing?: boolean }>}
 */
async function repairTableAll(statement) {
  try {
    return await statement.all();
  } catch (error) {
    if (isRepairTablesMissingError(error)) return { results: [], repairTablesMissing: true };
    throw error;
  }
}

/** @param {Env} env
 * @returns {Promise<{ ok: boolean, response?: Response, code?: string }>}
 */
async function requireRepairTables(env) {
  try {
    await firstPrepared(env.WAITLIST_DB.prepare("SELECT id FROM repair_queue_items LIMIT 1"));
    await firstPrepared(env.WAITLIST_DB.prepare("SELECT id FROM repair_agent_actions LIMIT 1"));
    return { ok: true };
  } catch (error) {
    if (isRepairTablesMissingError(error)) {
      return { ok: false, response: repairTablesMissingResponse(), code: REPAIR_TABLES_MISSING_CODE };
    }
    throw error;
  }
}

/** @param {D1PreparedStatement} statement
 * @returns {Promise<unknown>}
 */
function firstPrepared(statement) {
  if (statement?.first) return statement.first();
  return statement.bind().first();
}

export { isRepairTablesMissingError, repairTableAll, requireRepairTables };
