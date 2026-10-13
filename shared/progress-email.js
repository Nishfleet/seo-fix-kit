import { emailButton } from "./email-layout.js";
import { escapeHtml } from "./html.js";

const MAX_LISTED = 5;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : word.endsWith("x") ? "es" : "s"}`;
}

function titleOf(issue) {
  return String(issue?.title || issue?.label || issue?.key || "An issue").slice(0, 120);
}

// Builds the "your site this week" email sent after a scheduled re-check.
// Returns null when there is nothing honest to say (no earlier report to
// compare with), so the first run never sends a hollow email.
export function buildProgressEmail({ report = {}, delta = {}, reportUrl = "", host = "" } = {}) {
  if (delta.status !== "ready" || !delta.summary) return null;
  const { scoreBefore, scoreNow, scoreDelta, fixedIssuesCount, newIssuesCount, issuesNow } = delta.summary;
  const site = host || String(report.url || "your site");
  const fixed = (delta.fixedIssues || []).slice(0, MAX_LISTED);
  const fresh = (delta.newIssues || []).slice(0, MAX_LISTED);

  let subject;
  let headline;
  if (fixedIssuesCount > 0 && scoreDelta > 0) {
    subject = `${site}: ${plural(fixedIssuesCount, "fix")} confirmed, score up ${scoreDelta}`;
    headline = `${plural(fixedIssuesCount, "fix")} confirmed. Score ${scoreBefore} → ${scoreNow}.`;
  } else if (newIssuesCount > 0) {
    subject = `${site}: ${plural(newIssuesCount, "new problem")} found this week`;
    headline = `We caught ${plural(newIssuesCount, "new problem")} before it cost you traffic.`;
  } else if (issuesNow === 0) {
    subject = `${site}: clean check, nothing to fix`;
    headline = "Clean check. Nothing needs fixing.";
  } else {
    subject = `${site}: still ${plural(issuesNow, "issue")} to fix, nothing new`;
    headline = `Score ${scoreNow}. Nothing new broke; ${plural(issuesNow, "issue")} still open.`;
  }

  const textLines = [headline, "", `Site: ${site}`, `Score: ${scoreBefore} → ${scoreNow}`];
  if (fixed.length) textLines.push("", "Confirmed fixed:", ...fixed.map((i) => `- ${titleOf(i)}`));
  if (fresh.length) textLines.push("", "New this week:", ...fresh.map((i) => `- ${titleOf(i)}`));
  textLines.push("", `Open the report: ${reportUrl}`, "", "Pause these weekly emails any time by pausing the monitor in your dashboard.");

  const list = (title, rows, color) =>
    rows.length
      ? `<p style="font-weight:600;margin:16px 0 4px">${escapeHtml(title)}</p><ul style="margin:0;padding-left:20px">${rows
          .map((i) => `<li style="color:${color}">${escapeHtml(titleOf(i))}</li>`)
          .join("")}</ul>`
      : "";
  const html = [
    `<p style="font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 8px">${escapeHtml(headline)}</p>`,
    `<p style="margin:0">${escapeHtml(site)} · score ${escapeHtml(scoreBefore)} → ${escapeHtml(scoreNow)}</p>`,
    list("Confirmed fixed", fixed, "#0f7a56"),
    list("New this week", fresh, "#b3261e"),
    emailButton(reportUrl, "Open the report"),
    '<p style="color:#6b6f6c;font-size:13px;line-height:20px;margin:0">Pause these weekly emails any time by pausing the monitor in your dashboard.</p>'
  ].join("");

  return { subject, text: textLines.join("\n"), html, preheader: headline };
}
