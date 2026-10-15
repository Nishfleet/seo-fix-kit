import { emailButton } from "../../shared/email-layout.js";
import { escapeHtml } from "../../shared/html.js";
import { emailPreferencesFor } from "./audit-emails.js";
import { emailSender, sendWorkerEmail } from "./email.js";

const CHECK_EVERY_MINUTES = 14;
const CHECK_BATCH = 25;
const CHECK_TIMEOUT_MS = 10_000;
const FAILS_BEFORE_DOWN = 2;
const USER_AGENT = "SEOFixKitUptime/1.0 (+https://seofixkit.com)";
const INK = "#0b0f0d";
const MUTED = "#6b6f6c";
const GOOD = "#0f7a56";
const BAD = "#b42318";

// Only server errors and no answer at all count as down. A 403 or 404 usually
// means a bot rule or a moved page, which the weekly audit already reports.
async function probe(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    response.body?.cancel?.().catch?.(() => {});
    if (response.status >= 500) return { up: false, error: `The server answered with error ${response.status}.` };
    return { up: true };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      up: false,
      error: timedOut ? "The site did not answer within 10 seconds." : "The site could not be reached."
    };
  }
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
  if (!env.EMAIL || !emailSender(env)) return false;
  try {
    const preferences = await emailPreferencesFor(env, schedule.owner_email);
    if (!preferences?.auditEmails) return false;
    const message = buildUptimeEmail({
      ...details,
      host: schedule.target_host,
      url: schedule.target_url,
      unsubscribeUrl: `${details.appOrigin}/email/unsubscribe/${preferences.unsubscribeToken}`
    });
    await sendWorkerEmail(env, { to: preferences.ownerEmail, ...message });
    return true;
  } catch (error) {
    console.error("Uptime email failed", error);
    return false;
  }
}

async function checkSchedule(env, schedule, { fetchImpl, now, appOrigin }) {
  const result = await probe(schedule.target_url, fetchImpl);
  const db = env.WAITLIST_DB;
  if (result.up) {
    if (schedule.uptime_status === "down") {
      await sendUptimeEmail(env, schedule, { kind: "up", since: schedule.uptime_down_since || now, now, appOrigin });
    }
    await db
      .prepare(
        `UPDATE audit_schedules
         SET uptime_status = 'up', uptime_checked_at = ?, uptime_fail_count = 0, uptime_first_fail_at = NULL,
             uptime_down_since = NULL, uptime_last_error = NULL
         WHERE id = ?`
      )
      .bind(now, schedule.id)
      .run();
    return "up";
  }
  const fails = Number(schedule.uptime_fail_count || 0) + 1;
  const firstFailAt = schedule.uptime_first_fail_at || now;
  const goesDown = fails >= FAILS_BEFORE_DOWN && schedule.uptime_status !== "down";
  const status = goesDown || schedule.uptime_status === "down" ? "down" : schedule.uptime_status || null;
  const downSince = schedule.uptime_down_since || (goesDown ? firstFailAt : null);
  if (goesDown) await sendUptimeEmail(env, schedule, { kind: "down", error: result.error, now, appOrigin });
  await db
    .prepare(
      `UPDATE audit_schedules
       SET uptime_status = ?, uptime_checked_at = ?, uptime_fail_count = ?, uptime_first_fail_at = ?,
           uptime_down_since = ?, uptime_last_error = ?
       WHERE id = ?`
    )
    .bind(status, now, fails, firstFailAt, downSince, result.error, schedule.id)
    .run();
  return status === "down" ? "down" : "failing";
}

async function runUptimeChecks(env, { fetchImpl = fetch, now = new Date().toISOString() } = {}) {
  if (!env.WAITLIST_DB) return [];
  const cutoff = new Date(Date.parse(now) - CHECK_EVERY_MINUTES * 60_000).toISOString();
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT * FROM audit_schedules
     WHERE status = 'active' AND (uptime_checked_at IS NULL OR uptime_checked_at <= ?)
     ORDER BY uptime_checked_at IS NOT NULL, uptime_checked_at ASC
     LIMIT ?`
  )
    .bind(cutoff, CHECK_BATCH)
    .all();
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com");
  const results = await Promise.allSettled(
    (rows.results || []).map((schedule) => checkSchedule(env, schedule, { fetchImpl, now, appOrigin }))
  );
  return results.map((result) => (result.status === "fulfilled" ? result.value : "error"));
}

export { buildUptimeEmail, runUptimeChecks };
