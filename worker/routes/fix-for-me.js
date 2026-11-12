// upstream: https://developers.cloudflare.com/workers/runtime-apis/hmac/ — the "Have it fixed for you" button (issue #412): the visitor confirms site and email on the report or the free page check, and this Worker hands the request to TinyStudio server-to-server per the contract in shared/fix-for-me.js; the browser never calls TinyStudio; if TinyStudio does not answer the row stays pending and the scheduled queue retries it, so a request is never dropped and success is never claimed early.
import { recordAccessEvent } from "../lib/access-events.js";
import { withD1Retry } from "../lib/d1-retry.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, requestIpHash, sha256Hex } from "../lib/security.js";
import { dayWindow, hourWindow } from "../lib/text.js";
import { body, email, parseJsonBody, text } from "../lib/validation.js";
import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import {
  normalizeFixForMeRequest,
  tinyStudioRequestBody,
  tinyStudioSignatureHeaders,
  TINY_STUDIO_REQUEST_URL
} from "../../shared/fix-for-me.js";

export const FIX_FOR_ME_API_PATH = "/api/fix-for-me";

export const FIX_FOR_ME_LIMITS = { ipHour: 3, ipDay: 8, targetHour: 2, targetDay: 5 };

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 12;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const RETRY_BATCH = 20;

const FixForMeBody = body({
  site: text(2000),
  email: email(),
  reportId: text(128)
});

/** @param {string} ipHash hashed network of the visitor
 *  @param {string} targetHost hostname the request is for */
export async function fixForMeQuotaChecks(ipHash, targetHost) {
  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  const targetKey = (
    await sha256Hex(
      String(targetHost || "")
        .trim()
        .toLowerCase()
    )
  ).slice(0, 32);
  return [
    {
      bucket: `fix-request:ip-hour:${hour.key}:${ipHash}`,
      limit: FIX_FOR_ME_LIMITS.ipHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "You have reached this hour's request limit for your network. Try again in an hour."
    },
    {
      bucket: `fix-request:ip-day:${day.key}:${ipHash}`,
      limit: FIX_FOR_ME_LIMITS.ipDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily fix-request limit reached for your network. Try again tomorrow."
    },
    {
      bucket: `fix-request:target-hour:${hour.key}:${targetKey}`,
      limit: FIX_FOR_ME_LIMITS.targetHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has already been requested several times this hour. Try again in an hour."
    },
    {
      bucket: `fix-request:target-day:${day.key}:${targetKey}`,
      limit: FIX_FOR_ME_LIMITS.targetDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site has reached its daily fix-request limit. Try again tomorrow."
    }
  ];
}

/** @param {string} email the address TinyStudio will reply to — what happens next and when, plain confirmation, no price on this screen */
function fixForMeConfirmation(email) {
  return `Request received. We are handing your report to the TinyStudio repair desk — they will reply to ${email} within one business day. TinyStudio sends the fixed-price offer if the fixes need their hands; nothing is charged here.`;
}

/** @param {Env} env
 *  @param {{ id?: string, site: string, email: string, reportId: string }} row */
async function deliverFixForMeRequest(env, row) {
  const rawBody = tinyStudioRequestBody({ site: row.site, email: row.email, reportId: row.reportId });
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const signature = await tinyStudioSignatureHeaders({
      secret: String(env.SEOFIXKIT_REQUEST_SECRET || ""),
      timestamp,
      rawBody
    });
    // eslint-disable-next-line no-restricted-globals -- fixed vendor host (tinystudio.io) per the #412 contract, never a customer-typed URL
    const response = await fetch(TINY_STUDIO_REQUEST_URL, {
      method: "POST",
      headers: { ...signature, "content-type": "application/json" },
      body: rawBody,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
    });
    if (response.status !== 202) {
      return { status: "pending", error: `TinyStudio answered HTTP ${response.status}` };
    }
    const payload = await response.json().catch(() => ({}));
    if (!payload?.id || typeof payload.id !== "string") {
      return { status: "pending", error: "TinyStudio answered 202 without an id" };
    }
    return { status: "sent", tinyStudioId: payload.id.slice(0, 128) };
  } catch {
    console.error(
      "Fix-for-me delivery to TinyStudio did not succeed; request stays queued for retry, logged without the body so no personal data reaches a log line"
    );
    return { status: "pending", error: "TinyStudio did not answer" };
  }
}

/** @param {import("../lib/d1-retry.js").D1RetryDatabase} db
 *  @param {{ id: string }} row
 *  @param {{ status: string, tinyStudioId?: string, error?: string }} delivery
 *  @param {string} attemptedAt */
async function markDelivered(db, row, delivery, attemptedAt) {
  if (delivery.status === "sent") {
    await db
      .prepare(
        `UPDATE fix_for_me_requests
         SET status = 'sent', tiny_studio_id = ?, attempts = attempts + 1, last_attempt_at = ?, last_error = NULL, sent_at = ?
         WHERE id = ?`
      )
      .bind(delivery.tinyStudioId, attemptedAt, attemptedAt, row.id)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE fix_for_me_requests
         SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?
         WHERE id = ?`
      )
      .bind(attemptedAt, String(delivery.error || "").slice(0, 300), row.id)
      .run();
  }
}

/** @param {Request} request
 *  @param {Env} env — POST /api/fix-for-me, the only place the browser talks to for this */
export async function runFixForMe(request, env) {
  if (!env.WAITLIST_DB) {
    return jsonNoStore(
      { error: "Request storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  }
  const parsed = await parseJsonBody(request, FixForMeBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const normalized = normalizeFixForMeRequest(parsed.data);
  if (!normalized.ok) return jsonNoStore({ error: normalized.error }, 400);
  const { site, email, reportId } = normalized.value;

  const hostname = new URL(site).hostname;
  if (await resolvesToPrivateAddress(hostname)) {
    return jsonNoStore({ error: "This URL points at a private or internal address and cannot be requested." }, 400);
  }

  const ipHash = await requestIpHash(request);
  const quota = await checkQuotaSet(env, await fixForMeQuotaChecks(ipHash, hostname));
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  const db = withD1Retry(env.WAITLIST_DB);

  if (reportId) {
    const existing = await db
      .prepare(`SELECT * FROM fix_for_me_requests WHERE email = ? AND report_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(email, reportId)
      .first();
    if (existing) {
      return jsonNoStore({
        ok: true,
        alreadyRequested: true,
        requestId: existing.id,
        tinyStudioId: existing.tiny_studio_id || "",
        status: existing.status,
        confirmation: fixForMeConfirmation(email)
      });
    }
  }

  const now = new Date().toISOString();
  const id = `ffm_${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO fix_for_me_requests (id, site, email, report_id, status, attempts, created_at, last_attempt_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`
    )
    .bind(id, site, email, reportId, now, now)
    .run();

  const row = { id, site, email, reportId };
  const delivery = await deliverFixForMeRequest(env, row);
  await markDelivered(db, row, delivery, now);

  await recordAccessEvent(env, {
    step: "fix_request_submitted",
    ownerEmail: email,
    source: "fix-for-me",
    landingPath: "/api/fix-for-me",
    request,
    metadata: { fromReport: Boolean(reportId), delivered: delivery.status === "sent" }
  });

  return jsonNoStore({
    ok: true,
    requestId: id,
    tinyStudioId: delivery.tinyStudioId || "",
    status: delivery.status,
    confirmation: fixForMeConfirmation(email)
  });
}

/** @param {Env} env — scheduled-queue retry for requests TinyStudio did not answer */
export async function retryPendingFixForMe(env) {
  if (!env?.WAITLIST_DB) return { retried: 0, sent: 0 };
  const db = withD1Retry(env.WAITLIST_DB);
  const cutoff = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  const result = await db
    .prepare(
      `SELECT * FROM fix_for_me_requests
       WHERE status = 'pending' AND attempts < ${MAX_ATTEMPTS} AND last_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ${RETRY_BATCH}`
    )
    .bind(cutoff)
    .all();
  const rows = result?.results || [];
  let sent = 0;
  for (const row of rows) {
    const attemptedAt = new Date().toISOString();
    const delivery = await deliverFixForMeRequest(env, row);
    await markDelivered(db, row, delivery, attemptedAt);
    if (delivery.status === "sent") sent += 1;
  }
  return { retried: rows.length, sent };
}
