import { emailButton } from "../../shared/email-layout.js";
import { escapeHtml } from "../../shared/html.js";
import { emailPreferencesFor } from "./audit-emails.js";
import { emailSender, sendWorkerEmail } from "./email.js";

const NUDGE_KIND = "first-audit-nudge";
const NUDGE_AFTER_HOURS = 20;
const NUDGE_WITHIN_DAYS = 6;
const INK = "#0b0f0d";
const MUTED = "#6b6f6c";
const GOOD = "#0f7a56";

function isNudgeableEmail(value = "") {
  const email = String(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return false;
  return (
    !/@(.+\.)?(example\.(com|org|net)|test|invalid|localhost)$/.test(email) && !/\.(test|example|invalid)$/.test(email)
  );
}

function buildFirstAuditNudge({ appOrigin = "https://seofixkit.com", unsubscribeUrl = "" } = {}) {
  const auditUrl = `${appOrigin}/beta#new-audit`;
  const subject = "Your first SEO check takes about a minute";
  const headline = "Paste your homepage and see your score.";
  const gets = [
    ["A score out of 100", "and every problem we found, with proof from your real page."],
    ["The 3 fixes to do first", "each with code you can copy and paste."],
    ["A weekly check", "that emails you what you fixed and what’s new."]
  ];
  const why = "You get this once because you signed in to SEO Fix Kit but haven’t run an audit yet.";

  const html = [
    `<p style="color:${GOOD};font-size:12px;font-weight:650;letter-spacing:0.04em;margin:0 0 8px;text-transform:uppercase">Get started</p>`,
    `<p style="font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 12px">${escapeHtml(headline)}</p>`,
    `<p style="color:${INK};font-size:15px;line-height:22px;margin:0 0 16px">You signed in but haven’t checked a site yet. Here’s what you get back:</p>`,
    ...gets.map(
      ([title, detail]) =>
        `<p style="margin:0 0 8px;font-size:14px;line-height:20px"><span style="color:${GOOD};font-weight:700">✓</span>&nbsp; <strong>${escapeHtml(title)}</strong> ${escapeHtml(detail)}</p>`
    ),
    emailButton(auditUrl, "Run my first audit"),
    `<p style="color:${MUTED};font-size:12px;line-height:18px;margin:16px 0 0">${escapeHtml(why)}` +
      (unsubscribeUrl
        ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Stop these emails</a>.`
        : "") +
      "</p>"
  ].join("");

  const text = [
    headline,
    "",
    "You signed in but haven’t checked a site yet. Here’s what you get back:",
    ...gets.map(([title, detail]) => `- ${title} ${detail}`),
    "",
    `Run my first audit: ${auditUrl}`,
    "",
    why,
    ...(unsubscribeUrl ? [`Stop these emails: ${unsubscribeUrl}`] : [])
  ].join("\n");

  return {
    subject,
    html,
    text,
    preheader: "A score, the 3 fixes to do first, and the code to paste.",
    tag: NUDGE_KIND
  };
}

async function dueFirstAuditNudges(env, { now = new Date(), limit = 25 } = {}) {
  const latest = new Date(now.getTime() - NUDGE_AFTER_HOURS * 3_600_000).toISOString();
  const earliest = new Date(now.getTime() - NUDGE_WITHIN_DAYS * 86_400_000).toISOString();
  const { results = [] } = await env.WAITLIST_DB.prepare(
    `SELECT s.owner_email AS owner_email, MIN(s.created_at) AS first_seen
     FROM beta_sessions s
     WHERE NOT EXISTS (SELECT 1 FROM audit_reports r WHERE r.owner_email = s.owner_email)
       AND NOT EXISTS (SELECT 1 FROM audit_jobs j WHERE j.owner_email = s.owner_email)
       AND NOT EXISTS (SELECT 1 FROM lifecycle_emails l WHERE l.owner_email = s.owner_email AND l.kind = ?)
       AND NOT EXISTS (SELECT 1 FROM email_preferences p WHERE p.owner_email = s.owner_email AND p.audit_emails = 'off')
     GROUP BY s.owner_email
     HAVING first_seen <= ? AND first_seen >= ?
     ORDER BY first_seen
     LIMIT ?`
  )
    .bind(NUDGE_KIND, latest, earliest, limit)
    .all();
  return results.filter((row) => isNudgeableEmail(row.owner_email));
}

async function sendFirstAuditNudges(env, { now = new Date(), appOrigin = "https://seofixkit.com" } = {}) {
  const sent = [];
  try {
    if (!env.WAITLIST_DB || !env.EMAIL || !emailSender(env)) return sent;
    for (const row of await dueFirstAuditNudges(env, { now })) {
      const claim = await env.WAITLIST_DB.prepare(
        `INSERT OR IGNORE INTO lifecycle_emails (owner_email, kind, sent_at) VALUES (?, ?, ?)`
      )
        .bind(row.owner_email, NUDGE_KIND, now.toISOString())
        .run();
      if (!claim.meta?.changes) continue;
      try {
        const preferences = await emailPreferencesFor(env, row.owner_email);
        if (!preferences?.auditEmails) continue;
        const unsubscribeUrl = `${appOrigin}/email/unsubscribe/${preferences.unsubscribeToken}`;
        await sendWorkerEmail(env, {
          to: preferences.ownerEmail,
          ...buildFirstAuditNudge({ appOrigin, unsubscribeUrl })
        });
        sent.push(preferences.ownerEmail);
      } catch (error) {
        console.error("First-audit nudge failed", error);
      }
    }
  } catch (error) {
    console.error("First-audit nudges failed", error);
  }
  return sent;
}

export { buildFirstAuditNudge, dueFirstAuditNudges, isNudgeableEmail, sendFirstAuditNudges };
