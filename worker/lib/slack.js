/** @typedef {{
 *   report?: SlackReport,
 *   audit?: { url?: string, error?: string },
 *   error?: string,
 *   repair_action?: SlackRepairAction,
 *   large_crawl?: { url?: string, target_url?: string }
 * }} SlackEventData
 */

/** @typedef {{
 *   url?: string,
 *   id?: string,
 *   score?: number,
 *   summary?: { critical?: number, warnings?: number },
 *   report_delta?: { status?: string, summary?: { fixedIssuesCount?: number, newIssuesCount?: number, persistentIssuesCount?: number, scoreDelta?: number } } | null
 * }} SlackReport
 */

/** @typedef {{ page_url?: string, issue_title?: string, page_label?: string, report_path?: string, report_id?: string }} SlackRepairAction
 */

/** @param {unknown} value
 * @returns {boolean}
 */
export function isSlackWebhookUrl(value) {
  try {
    const url = new URL(/** @type {string} */ (value));
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && url.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

// upstream: https://api.slack.com/reference/surfaces/formatting — Slack mrkdwn needs the three control characters escaped, and a link label must not break out of <url|label>.
/** @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** @param {string} url
 * @param {unknown} label
 * @returns {string}
 */
function link(url, label) {
  return `<${url}|${esc(label).replace(/\|/g, "¦")}>`;
}

/** @param {unknown} url
 * @returns {string}
 */
function host(url) {
  try {
    return new URL(/** @type {string} */ (url)).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "your site");
  }
}

/** @param {unknown} count
 * @param {string} word
 * @returns {string}
 */
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** @param {SlackEventData} data
 * @param {string} origin
 * @returns {{ text: string, header: string, body: string, action: { url: string, label: string } }}
 */
function auditCompleted(data, origin) {
  const report = /** @type {SlackReport} */ (data.report || {});
  const audit = data.audit || {};
  const site = host(report.url || audit.url);
  const summary = /** @type {NonNullable<SlackReport["summary"]>} */ (report.summary || {});
  const delta = report.report_delta?.status === "ready" ? report.report_delta.summary : null;
  const reportUrl = report.id ? `${origin}/beta/reports/${report.id}` : `${origin}/beta`;
  const counts = [
    summary.critical ? plural(summary.critical, "critical problem") : "",
    summary.warnings ? plural(summary.warnings, "warning") : ""
  ].filter(Boolean);
  const lines = [
    `*Score ${report.score ?? "–"}*${counts.length ? ` · ${counts.join(" · ")}` : " · no critical problems"}`
  ];
  if (delta) {
    const parts = [];
    if (delta.fixedIssuesCount) parts.push(`${delta.fixedIssuesCount} fixed`);
    if (delta.newIssuesCount) parts.push(`${delta.newIssuesCount} new`);
    if (delta.persistentIssuesCount) parts.push(`${delta.persistentIssuesCount} still open`);
    const change = delta.scoreDelta ? ` (${delta.scoreDelta > 0 ? "+" : ""}${delta.scoreDelta} since last run)` : "";
    if (parts.length) lines.push(`Since the last audit: ${parts.join(", ")}${change}.`);
  }
  const alarming = Boolean(delta && delta.newIssuesCount && delta.newIssuesCount > 0);
  return {
    text: `${alarming ? "New problems found" : "Audit finished"} on ${site}: score ${report.score ?? "–"}`,
    header: `${alarming ? "New SEO problems on" : "Audit finished for"} ${site}`,
    body: lines.join("\n"),
    action: { url: reportUrl, label: "Open the report" }
  };
}

/** @param {SlackEventData} data
 * @param {string} origin
 * @returns {{ text: string, header: string, body: string, action: { url: string, label: string } }}
 */
function auditFailed(data, origin) {
  const site = host(data.audit?.url);
  return {
    text: `Audit failed for ${site}`,
    header: `Audit failed for ${site}`,
    body: esc(data.error || data.audit?.error || "The audit could not finish."),
    action: { url: `${origin}/beta`, label: "Open SEO Fix Kit" }
  };
}

const REPAIR_HEADERS = /** @type {Record<string, string>} */ ({
  "repair_action.drafted": "Fix drafted",
  "repair_action.approved": "Fix approved",
  "repair_action.applied": "Fix applied, waiting for a rerun",
  "repair_action.fixed": "Fix confirmed by rerun",
  "repair_action.regressed": "A fixed problem is back"
});

/** @param {string} eventType
 * @param {SlackEventData} data
 * @param {string} origin
 * @returns {{ text: string, header: string, body: string, action: { url: string, label: string } }}
 */
function repairAction(eventType, data, origin) {
  const action = /** @type {SlackRepairAction} */ (data.repair_action || {});
  const site = host(data.report?.url || action.page_url);
  const title = action.issue_title || "A repair";
  const page = action.page_label || action.page_url || "";
  const path = action.report_path || (action.report_id ? `/beta/reports/${action.report_id}` : "/beta");
  return {
    text: `${REPAIR_HEADERS[eventType]} on ${site}: ${title}`,
    header: `${REPAIR_HEADERS[eventType]} on ${site}`,
    body: `*${esc(title)}*${page ? `\n${esc(page)}` : ""}`,
    action: { url: `${origin}${path}`, label: "Open the report" }
  };
}

/** @param {string} eventType
 * @param {SlackEventData} data
 * @param {string} origin
 * @returns {{ text: string, header: string, body: string, action: { url: string, label: string } }}
 */
function largeCrawl(eventType, data, origin) {
  const crawl = data.large_crawl || {};
  const site = host(crawl.url || crawl.target_url);
  const header =
    eventType === "large_crawl.ready_to_merge" ? `Large crawl ready for ${site}` : `Large crawl started for ${site}`;
  return { text: header, header, body: "", action: { url: `${origin}/beta`, label: "Open SEO Fix Kit" } };
}

/** @param {string} eventType
 * @param {SlackEventData} [data]
 * @param {string} [origin]
 */
export function slackMessage(eventType, data = {}, origin = "https://seofixkit.com") {
  const base = String(origin).replace(/\/+$/, "");
  const message = eventType.startsWith("repair_action.")
    ? repairAction(eventType, data, base)
    : eventType === "audit.completed"
      ? auditCompleted(data, base)
      : eventType === "audit.failed"
        ? auditFailed(data, base)
        : largeCrawl(eventType, data, base);
  /** @type {Array<{ type: string, text?: { type: string, text: string, emoji?: boolean }, elements?: { type: string, text: string }[] }>} */
  const blocks = [{ type: "header", text: { type: "plain_text", text: message.header.slice(0, 150), emoji: false } }];
  if (message.body) blocks.push({ type: "section", text: { type: "mrkdwn", text: message.body } });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${link(message.action.url, message.action.label)} · SEO Fix Kit` }]
  });
  return { text: message.text, blocks };
}

/** @param {string} [origin]
 */
export function slackConnectedMessage(origin = "https://seofixkit.com") {
  const base = String(origin).replace(/\/+$/, "");
  return {
    text: "SEO Fix Kit alerts are connected to this channel.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*SEO Fix Kit alerts are connected to this channel.*\nYou’ll hear when an audit finishes or fails, when a rerun confirms a fix, and when a fixed problem comes back."
        }
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `${link(`${base}/beta`, "Open SEO Fix Kit")}` }] }
    ]
  };
}
