// Customer audit emails: "your report is ready" after an audit someone ran,
// and the weekly check result after a scheduled rerun. These are the
// product's habit loop: each weekly email names what got fixed (a win), what
// is new (a reason to look), and the one fix to do next, with a link back.
//
// Every email carries a one-click unsubscribe link backed by
// email_preferences.unsubscribe_token, so a customer can stop them without
// signing in; the app's Alerts page toggles the same preference.
import { emailButton } from "../../shared/email-layout.js";
import { escapeHtml } from "../../shared/html.js";
import { emailSender, sendWorkerEmail } from "./email.js";
import { normalizeEmail, randomHex } from "./text.js";

const SEVERITY_RANK = { critical: 0, warning: 1, notice: 2 };
const INK = "#0b0f0d";
const MUTED = "#6b6f6c";
const GOOD = "#0f7a56";
const BAD = "#b42318";
const LINE = "#e7e5df";

function isDeliverableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || ""));
}

// The row is created on first use so every owner has a stable unsubscribe
// token before their first audit email goes out.
async function emailPreferencesFor(env, ownerEmail) {
  const email = normalizeEmail(ownerEmail);
  if (!env.WAITLIST_DB || !email) return null;
  const existing = await env.WAITLIST_DB.prepare(
    `SELECT owner_email, audit_emails, unsubscribe_token FROM email_preferences WHERE owner_email = ? LIMIT 1`
  )
    .bind(email)
    .first();
  if (existing) return preferenceResponse(existing);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO email_preferences (owner_email, audit_emails, unsubscribe_token, created_at, updated_at)
     VALUES (?, 'on', ?, ?, ?)
     ON CONFLICT(owner_email) DO NOTHING`
  )
    .bind(email, randomHex(24), now, now)
    .run();
  const created = await env.WAITLIST_DB.prepare(
    `SELECT owner_email, audit_emails, unsubscribe_token FROM email_preferences WHERE owner_email = ? LIMIT 1`
  )
    .bind(email)
    .first();
  return created ? preferenceResponse(created) : null;
}

function preferenceResponse(row) {
  return {
    ownerEmail: row.owner_email,
    auditEmails: row.audit_emails !== "off",
    unsubscribeToken: row.unsubscribe_token
  };
}

async function setAuditEmails(env, ownerEmail, enabled) {
  const preferences = await emailPreferencesFor(env, ownerEmail);
  if (!preferences) return null;
  await env.WAITLIST_DB.prepare(`UPDATE email_preferences SET audit_emails = ?, updated_at = ? WHERE owner_email = ?`)
    .bind(enabled ? "on" : "off", new Date().toISOString(), preferences.ownerEmail)
    .run();
  return { ...preferences, auditEmails: Boolean(enabled) };
}

async function preferencesForToken(env, token) {
  if (!env.WAITLIST_DB || !/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  const row = await env.WAITLIST_DB.prepare(
    `SELECT owner_email, audit_emails, unsubscribe_token FROM email_preferences WHERE unsubscribe_token = ? LIMIT 1`
  )
    .bind(token)
    .first();
  return row ? preferenceResponse(row) : null;
}

// Developer API audits are programmatic and report through webhooks, and a
// one-page homepage check that is not the site's first report finishes while
// the person is still watching, so neither gets an email.
function shouldEmailAudit(job = {}, report = {}) {
  if (!isDeliverableEmail(job.owner_email)) return false;
  if (job.access_mode === "api") return false;
  if (job.schedule_id) return true;
  if (Number(job.max_pages || 1) > 1) return true;
  return report.reportDelta?.status !== "ready";
}

function reportHost(report = {}, job = {}) {
  try {
    return new URL(report.url || job.target_url).hostname.replace(/^www\./, "");
  } catch {
    return job.target_host || "your site";
  }
}

// Group open findings by title so one problem on twelve pages reads as one
// fix, then order by severity and reach.
function topFixes(report = {}, limit = 3) {
  const groups = new Map();
  for (const finding of report.findings || []) {
    if (!finding?.severity || finding.severity === "good") continue;
    const title = String(finding.title || "").trim();
    if (!title) continue;
    const group = groups.get(title) || {
      title,
      severity: finding.severity,
      fix: String(finding.fix || "").trim(),
      pages: new Set()
    };
    if ((SEVERITY_RANK[finding.severity] ?? 3) < (SEVERITY_RANK[group.severity] ?? 3)) {
      group.severity = finding.severity;
    }
    group.pages.add(finding.pageUrl || report.url || "");
    groups.set(title, group);
  }
  return [...groups.values()]
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || b.pages.size - a.pages.size)
    .slice(0, limit)
    .map((group) => ({ ...group, pageCount: group.pages.size }));
}

function openIssueCount(report = {}) {
  return (report.findings || []).filter((finding) => finding?.severity && finding.severity !== "good").length;
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function signed(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function uniqueTitles(issues = [], limit = 3) {
  const seen = new Set();
  const titles = [];
  for (const issue of issues) {
    const title = String(issue?.title || "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
    if (titles.length === limit) break;
  }
  return titles;
}

// Pure builder, so tests can check the words without sending anything.
function buildAuditEmail({
  report = {},
  job = {},
  autoSchedule = null,
  appOrigin = "https://seofixkit.com",
  unsubscribeUrl = ""
}) {
  const host = reportHost(report, job);
  const scheduled = Boolean(job.schedule_id);
  const delta = report.reportDelta?.status === "ready" ? report.reportDelta : null;
  const summary = delta?.summary || {};
  const score = Math.round(Number(report.score || 0));
  const scoreDelta = Number(summary.scoreDelta || 0);
  const fixedCount = Number(summary.fixedIssuesCount || 0);
  const newCount = Number(summary.newIssuesCount || 0);
  const openCount = openIssueCount(report);
  const pagesScanned = Number(report.summary?.pagesScanned || report.pages?.length || 1);
  const reportUrl = `${appOrigin}${report.reportPath || `/beta/reports/${report.id || ""}`}`;
  const fixes = topFixes(report);
  const fixedTitles = uniqueTitles(delta?.fixedIssues);
  const newTitles = uniqueTitles(delta?.newIssues);

  const milestone = delta && scoreDelta > 0 ? [100, 90].find((mark) => score >= mark && score - scoreDelta < mark) : 0;

  let subject;
  let headline;
  if (milestone) {
    subject = milestone === 100 ? `${host} scored a perfect 100` : `${host} crossed 90: score ${score}`;
    headline =
      milestone === 100
        ? `A perfect 100 on ${host}. Every check passes.`
        : `${host} crossed 90. That puts it in top shape.`;
  } else if (delta && fixedCount > 0) {
    subject = `${host}: ${plural(fixedCount, "problem")} fixed, score ${score}`;
    headline = `Nice work. You fixed ${plural(fixedCount, "problem")} on ${host}.`;
  } else if (delta && newCount > 0) {
    subject = `${host}: ${plural(newCount, "new problem")} found`;
    headline = `${plural(newCount, "new problem")} showed up on ${host}.`;
  } else if (delta) {
    subject = scheduled ? `${host}: weekly check done, score ${score}` : `${host}: rerun done, score ${score}`;
    headline = openCount ? `No change on ${host} since the last check.` : `${host} is still clean.`;
  } else {
    subject = `Your ${host} report is ready: score ${score}`;
    headline = openCount
      ? `${host} scored ${score}. Here’s what to fix first.`
      : `${host} scored ${score}. We found nothing to fix.`;
  }

  const kicker = scheduled ? "Weekly check" : "Audit finished";
  const scoreNote = delta && scoreDelta ? ` (${signed(scoreDelta)} since last check)` : "";
  const stats = delta
    ? [
        ["Score", `${score}`, scoreDelta > 0 ? GOOD : scoreDelta < 0 ? BAD : INK, scoreDelta ? signed(scoreDelta) : ""],
        ["Fixed", String(fixedCount), fixedCount ? GOOD : INK, ""],
        ["New", String(newCount), newCount ? BAD : INK, ""],
        ["Still open", String(Number(summary.persistentIssuesCount || 0)), INK, ""]
      ]
    : [
        ["Score", `${score}`, INK, "out of 100"],
        ["Problems", String(openCount), openCount ? BAD : GOOD, ""],
        ["Pages checked", String(pagesScanned), INK, ""]
      ];

  const statCells = stats
    .map(
      ([label, value, color, note]) =>
        `<td style="border:1px solid ${LINE};border-radius:10px;padding:12px 14px;vertical-align:top;width:${Math.floor(100 / stats.length)}%">` +
        `<div style="color:${MUTED};font-size:12px;line-height:16px">${escapeHtml(label)}</div>` +
        `<div style="color:${color};font-size:24px;font-weight:650;letter-spacing:-0.02em;line-height:32px">${escapeHtml(value)}</div>` +
        (note ? `<div style="color:${MUTED};font-size:12px;line-height:16px">${escapeHtml(note)}</div>` : "") +
        "</td>"
    )
    .join('<td style="width:8px"></td>');

  const listBlock = (title, items, color, mark) =>
    items.length
      ? `<p style="font-size:14px;font-weight:650;margin:24px 0 8px">${escapeHtml(title)}</p>` +
        items
          .map(
            (item) =>
              `<p style="margin:0 0 6px;font-size:14px;line-height:20px"><span style="color:${color};font-weight:700">${mark}</span>&nbsp; ${escapeHtml(item)}</p>`
          )
          .join("")
      : "";

  const fixBlock = fixes.length
    ? `<p style="font-size:14px;font-weight:650;margin:24px 0 8px">${delta ? "Fix next" : "Fix these first"}</p>` +
      fixes
        .map(
          (fix, index) =>
            `<div style="border-top:1px solid ${LINE};padding:10px 0">` +
            `<p style="margin:0;font-size:14px;line-height:20px;font-weight:600">${index + 1}. ${escapeHtml(fix.title)}` +
            (fix.pageCount > 1 ? ` <span style="color:${MUTED};font-weight:400">· ${fix.pageCount} pages</span>` : "") +
            "</p>" +
            (fix.fix
              ? `<p style="margin:2px 0 0;color:${MUTED};font-size:13px;line-height:19px">${escapeHtml(fix.fix.slice(0, 180))}</p>`
              : "") +
            "</div>"
        )
        .join("")
    : "";

  const nextCheck = autoSchedule?.next_run_at
    ? new Date(autoSchedule.next_run_at).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      })
    : "";
  const autoNote = nextCheck
    ? `Weekly checks are now on. We’ll check ${host} again on ${nextCheck} and email you what you fixed and what’s new.`
    : "";

  const why = scheduled
    ? `You get this because weekly checks are on for ${host}.`
    : "You get this when an audit you started finishes.";
  const unsubscribeHtml = unsubscribeUrl
    ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Stop audit emails</a>.`
    : "";

  const html = [
    `<p style="color:${GOOD};font-size:12px;font-weight:650;letter-spacing:0.04em;margin:0 0 8px;text-transform:uppercase">${kicker}</p>`,
    `<p style="font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 20px">${escapeHtml(headline)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>${statCells}</tr></table>`,
    listBlock("Fixed since last check", fixedTitles, GOOD, "✓"),
    listBlock("New since last check", newTitles, BAD, "!"),
    fixBlock,
    emailButton(reportUrl, "Open report"),
    autoNote
      ? `<p style="background:#eef7f2;border-radius:10px;color:${INK};font-size:14px;line-height:20px;margin:16px 0 0;padding:12px 14px">${escapeHtml(autoNote)} <a href="${escapeHtml(`${appOrigin}/beta/sites`)}" style="color:${GOOD}">Change this</a>.</p>`
      : "",
    `<p style="color:${MUTED};font-size:12px;line-height:18px;margin:16px 0 0">${escapeHtml(why)}${unsubscribeHtml}</p>`
  ].join("");

  const text = [
    `${kicker}: ${host}`,
    "",
    headline,
    "",
    `Score: ${score}${scoreNote}`,
    delta
      ? `Fixed: ${fixedCount} · New: ${newCount} · Still open: ${Number(summary.persistentIssuesCount || 0)}`
      : `Problems: ${openCount} · Pages checked: ${pagesScanned}`,
    ...(fixedTitles.length ? ["", "Fixed since last check:", ...fixedTitles.map((title) => `- ${title}`)] : []),
    ...(newTitles.length ? ["", "New since last check:", ...newTitles.map((title) => `- ${title}`)] : []),
    ...(fixes.length
      ? ["", delta ? "Fix next:" : "Fix these first:", ...fixes.map((fix, index) => `${index + 1}. ${fix.title}`)]
      : []),
    "",
    `Open the report: ${reportUrl}`,
    "",
    ...(autoNote ? [autoNote, `Change this: ${appOrigin}/beta/sites`, ""] : []),
    why,
    ...(unsubscribeUrl ? [`Stop audit emails: ${unsubscribeUrl}`] : [])
  ].join("\n");

  const preheader = delta
    ? `Score ${score}${scoreNote}. ${plural(fixedCount, "fixed problem")}, ${plural(newCount, "new one")}.`
    : fixes.length
      ? `First fix: ${fixes[0].title}`
      : `Score ${score} across ${plural(pagesScanned, "page")}.`;

  return { subject, html, text, preheader, tag: scheduled ? "weekly-check" : "audit-ready" };
}

// Called after a queued audit saves its report. Never throws: a failed email
// must not fail the audit.
async function sendAuditCompletedEmail(
  env,
  { job = {}, report = {}, autoSchedule = null, appOrigin = "https://seofixkit.com" }
) {
  try {
    if (!env.EMAIL || !emailSender(env) || !env.WAITLIST_DB) return { sent: false, reason: "email-not-configured" };
    if (!shouldEmailAudit(job, report)) return { sent: false, reason: "not-needed" };
    const preferences = await emailPreferencesFor(env, job.owner_email);
    if (!preferences) return { sent: false, reason: "no-preferences" };
    if (!preferences.auditEmails) return { sent: false, reason: "unsubscribed" };
    const unsubscribeUrl = `${appOrigin}/email/unsubscribe/${preferences.unsubscribeToken}`;
    const message = buildAuditEmail({ report, job, autoSchedule, appOrigin, unsubscribeUrl });
    await sendWorkerEmail(env, { to: preferences.ownerEmail, ...message });
    return { sent: true, tag: message.tag };
  } catch (error) {
    console.error("Audit email failed", error);
    return { sent: false, reason: "error" };
  }
}

export {
  buildAuditEmail,
  emailPreferencesFor,
  preferencesForToken,
  sendAuditCompletedEmail,
  setAuditEmails,
  shouldEmailAudit,
  topFixes
};
