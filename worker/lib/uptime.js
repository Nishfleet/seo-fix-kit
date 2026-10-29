import { emailButton } from "../../shared/email-layout.js";
import { escapeHtml } from "../../shared/html.js";
import { fetchPublicUrl, resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { D1_MAX_CONCURRENCY, runBounded } from "./bounded.js";
import { emailPreferencesFor } from "./audit-emails.js";
import { emailSender, sendWorkerEmail } from "./email.js";
import { hasPaidFixPack, PAID_FIX_PACK_STATUSES } from "./paid-features.js";

const CHECK_EVERY_MINUTES = 14;
const CHECK_BATCH = 25;
const CHECK_CONCURRENCY = D1_MAX_CONCURRENCY;
const MAX_BATCHES_PER_TICK = 4;
const CHECK_TIMEOUT_MS = 10_000;
const FAILS_BEFORE_DOWN = 2;
const USER_AGENT = "SEOFixKitUptime/1.0 (+https://seofixkit.com)";
const INK = "#0b0f0d";
const MUTED = "#6b6f6c";
const GOOD = "#0f7a56";
const BAD = "#b42318";

const PAID_STATUS_SQL = PAID_FIX_PACK_STATUSES.map((status) => `'${status}'`).join(", ");
const PAID_OWNER_SQL = (owner) => `(
  EXISTS (SELECT 1 FROM fix_requests f
          WHERE f.owner_email = ${owner} AND f.status IN (${PAID_STATUS_SQL}) AND f.is_test = 0)
  OR EXISTS (SELECT 1 FROM offer_entitlements e
             WHERE e.owner_email = ${owner} AND e.status = 'active' AND e.revoked_at IS NULL)
)`;

async function uptimeAlertsIncluded(env, ownerEmail, access = null) {
  if (!env.WAITLIST_DB || !ownerEmail) return false;
  try {
    if (await hasPaidFixPack(env, ownerEmail, access)) return true;
    const row = await env.WAITLIST_DB.prepare(
      `SELECT EXISTS (SELECT 1 FROM offer_entitlements
                      WHERE owner_email = ? AND status = 'active' AND revoked_at IS NULL) AS included`
    )
      .bind(ownerEmail)
      .first();
    return Boolean(row?.included);
  } catch {
    return false;
  }
}

async function probe(url, fetchImpl, privateAddressResolver) {
  let response;
  try {
    ({ response } = await fetchPublicUrl(
      fetchImpl,
      url,
      {
        method: "GET",
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      },
      { privateAddressResolver }
    ));
  } catch (error) {
    if (/private|internal|public website URL/i.test(String(error?.message || ""))) return { blocked: true };
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      up: false,
      error: timedOut ? "The site did not answer within 10 seconds." : "The site could not be reached."
    };
  }
  response.body?.cancel?.().catch?.(() => {});
  if (response.status >= 500) return { up: false, error: `The server answered with error ${response.status}.` };
  return { up: true };
}

function downFor(since, now) {
  const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

function buildUptimeEmail({ kind, host, url, error = "", since = "", now, appOrigin, unsubscribeUrl = "" }) {
  const down = kind === "down";
  const subject = down ? `${host} is down` : `${host} is back up`;
  const headline = down
    ? `${host} stopped answering. ${error}`
    : `${host} is answering again after about ${downFor(since, now)}.`;
  const next = down
    ? "Check your hosting dashboard or ask whoever runs your server. We keep checking every 15 minutes and will email you when it is back."
    : "Nothing else to do. If this keeps happening, ask your host about it, because search engines may skip pages they can't reach.";
  const sitesUrl = `${appOrigin}/beta/sites`;
  const why = "You get this because weekly checks are on for this site.";
  const html = [
    `<p style="color:${down ? BAD : GOOD};font-size:12px;font-weight:650;letter-spacing:0.04em;margin:0 0 8px;text-transform:uppercase">${down ? "Site down" : "Site back up"}</p>`,
    `<p style="color:${INK};font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 12px">${escapeHtml(headline)}</p>`,
    `<p style="color:${INK};font-size:14px;line-height:21px;margin:0 0 4px">${escapeHtml(next)}</p>`,
    `<p style="color:${MUTED};font-size:13px;line-height:19px;margin:0">Checked: ${escapeHtml(url)}</p>`,
    emailButton(down ? url : sitesUrl, down ? "Open the site" : "See your sites"),
    `<p style="color:${MUTED};font-size:12px;line-height:18px;margin:16px 0 0">${escapeHtml(why)}` +
      (unsubscribeUrl
        ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Stop audit emails</a>.`
        : "") +
      "</p>"
  ].join("");
  const text = [
    headline,
    "",
    next,
    `Checked: ${url}`,
    "",
    `Your sites: ${sitesUrl}`,
    "",
    why,
    ...(unsubscribeUrl ? [`Stop audit emails: ${unsubscribeUrl}`] : [])
  ].join("\n");
  return { subject, html, text, preheader: headline, tag: down ? "uptime-down" : "uptime-up" };
}

async function sendUptimeEmail(env, schedule, details) {
  if (!env.EMAIL || !emailSender(env)) return "skipped";
  try {
    const preferences = await emailPreferencesFor(env, schedule.owner_email);
    if (!preferences?.auditEmails) return "skipped";
    const message = buildUptimeEmail({
      ...details,
      host: schedule.target_host,
      url: schedule.target_url,
      unsubscribeUrl: `${details.appOrigin}/email/unsubscribe/${preferences.unsubscribeToken}`
    });
    await sendWorkerEmail(env, { to: preferences.ownerEmail, ...message });
    return "sent";
  } catch (error) {
    console.error("Uptime email failed", error);
    return "failed";
  }
}

const STALE_STATE_MINUTES = 60;

function freshState(schedule, now) {
  const checkedAt = Date.parse(schedule.uptime_checked_at || "");
  if (!Number.isFinite(checkedAt) || Date.parse(now) - checkedAt <= STALE_STATE_MINUTES * 60_000) return schedule;
  return {
    ...schedule,
    uptime_status: null,
    uptime_fail_count: 0,
    uptime_first_fail_at: null,
    uptime_down_since: null,
    uptime_alerted: null,
    staleState: true
  };
}

async function checkSchedule(env, storedSchedule, { fetchImpl, privateAddressResolver, now, appOrigin }) {
  const schedule = freshState(storedSchedule, now);
  const result = await probe(schedule.target_url, fetchImpl, privateAddressResolver);
  const db = env.WAITLIST_DB;
  const current = await db
    .prepare(`SELECT status, uptime_alerted FROM audit_schedules WHERE id = ? LIMIT 1`)
    .bind(schedule.id)
    .first();
  if (current?.status !== "active") return "skipped";
  if (result.blocked) {
    await db
      .prepare(`UPDATE audit_schedules SET uptime_checked_at = ? WHERE id = ? AND status = 'active'`)
      .bind(now, schedule.id)
      .run();
    return "skipped";
  }

  let status;
  let fails = 0;
  let firstFailAt = null;
  let downSince = null;
  if (result.up) {
    status = "up";
  } else {
    fails = Number(schedule.uptime_fail_count || 0) + 1;
    firstFailAt = schedule.uptime_first_fail_at || now;
    status = fails >= FAILS_BEFORE_DOWN || schedule.uptime_status === "down" ? "down" : schedule.uptime_status || null;
    downSince = status === "down" ? schedule.uptime_down_since || firstFailAt : null;
  }

  let alerted = schedule.staleState ? null : current.uptime_alerted || null;
  if (status === "down" && alerted !== "down") {
    const sent = await sendUptimeEmail(env, schedule, { kind: "down", error: result.error, now, appOrigin });
    if (sent !== "failed") alerted = "down";
  } else if (status === "up" && alerted === "down") {
    const since = schedule.uptime_down_since || schedule.uptime_first_fail_at || now;
    const sent = await sendUptimeEmail(env, schedule, { kind: "up", since, now, appOrigin });
    if (sent !== "failed") alerted = null;
  }

  const outageStart = status === "up" && alerted === "down" ? schedule.uptime_down_since : downSince;

  await db
    .prepare(
      `UPDATE audit_schedules
       SET uptime_status = ?, uptime_checked_at = ?, uptime_fail_count = ?, uptime_first_fail_at = ?,
           uptime_down_since = ?, uptime_last_error = ?, uptime_alerted = ?
       WHERE id = ? AND status = 'active'`
    )
    .bind(status, now, fails, firstFailAt, outageStart, result.up ? null : result.error, alerted, schedule.id)
    .run();
  if (!result.up) return status === "down" ? "down" : "failing";
  return "up";
}

async function runUptimeChecks(
  env,
  {
    fetchImpl = fetch,
    privateAddressResolver = (hostname) => resolvesToPrivateAddress(hostname),
    now = new Date().toISOString()
  } = {}
) {
  if (!env.WAITLIST_DB) return [];
  const cutoff = new Date(Date.parse(now) - CHECK_EVERY_MINUTES * 60_000).toISOString();
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com");
  const outcomes = [];
  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT * FROM audit_schedules
       WHERE status = 'active' AND (uptime_checked_at IS NULL OR uptime_checked_at <= ?)
         AND ${PAID_OWNER_SQL("audit_schedules.owner_email")}
       ORDER BY uptime_checked_at IS NOT NULL, uptime_checked_at ASC
       LIMIT ?`
    )
      .bind(cutoff, CHECK_BATCH)
      .all();
    const due = rows.results || [];
    if (!due.length) break;
    const results = await runBounded(due, CHECK_CONCURRENCY, (schedule) =>
      checkSchedule(env, schedule, { fetchImpl, privateAddressResolver, now, appOrigin }).catch(async () => {
        await env.WAITLIST_DB.prepare("UPDATE audit_schedules SET uptime_checked_at = ? WHERE id = ?")
          .bind(now, schedule.id)
          .run()
          .catch(() => {});
        return "error";
      })
    );
    outcomes.push(...results);
    if (due.length < CHECK_BATCH) break;
  }
  return outcomes;
}

export { buildUptimeEmail, runUptimeChecks, uptimeAlertsIncluded };
