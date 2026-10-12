import {
  cleanActionMode,
  cleanActionType,
  cleanApprovalState,
  cleanExecutionState,
  cleanRerunState
} from "./repair-queue.js";
import {
  comparableReportHost,
  repairProofIssueForAction,
  reportTimestampMs,
  rerunProofFreshAfterMs,
  rerunReportProvesIssue,
  validRerunProofReport
} from "./repair-action-rules.js";

const REPAIR_PROOF_RECEIPT_CONTENT_TYPE = "text/markdown; charset=utf-8";

function buildRepairProofReceipt({ report = {}, item = {}, action = {}, rerunReport = {} } = {}) {
  const actionId = text(action.id || action.actionId, 160);
  const reportId = text(action.report_id || action.reportId || report.id || item.reportId || item.report_id, 160);
  const queueItemId = text(action.queue_item_id || action.queueItemId || item.id, 160);
  const issueId = text(action.issue_id || action.issueId || item.issueId || item.issue_id, 160);
  if (!actionId || !reportId || !issueId) {
    return receiptError("This repair action doesn't exist. Open the repair from your report and try again.", 400);
  }

  const approvalState = cleanApprovalState(action.approval_state || action.approvalState);
  if (approvalState !== "approved") {
    return receiptError("Approve the repair action before creating a proof receipt.", 409);
  }

  const executionState = cleanExecutionState(action.execution_state || action.executionState);
  if (executionState !== "applied") {
    return receiptError("Mark the approved repair action applied before creating a proof receipt.", 409);
  }

  const rerunState = cleanRerunState(action.rerun_state || action.rerunState);
  if (rerunState !== "fixed") {
    return receiptError(
      "A receipt is only available once a rerun shows this repair as fixed. Rerun the audit first.",
      409
    );
  }

  const itemRerunState = cleanRerunState(item.rerunStatus || item.rerun_status);
  if (itemRerunState !== "fixed") {
    return receiptError(
      "A rerun reopened this repair. Fix it, rerun the audit on the same site, then create the receipt.",
      409
    );
  }

  const rerunReportId = text(action.rerun_report_id || action.rerunReportId, 160);
  if (!rerunReportId) {
    return receiptError("Attach the fixed rerun report before creating a proof receipt.", 409);
  }

  if (!validRerunProofReport(rerunReport)) {
    return receiptError("The rerun report is missing or invalid. Run the audit again and attach the new report.", 409);
  }

  const resolvedRerunReportId = text(rerunReport.id || rerunReport.reportId || rerunReport.report_id, 160);
  if (resolvedRerunReportId && resolvedRerunReportId !== rerunReportId) {
    return receiptError("Rerun proof report does not match this repair action.", 409);
  }

  const sourceHost = comparableReportHost(report);
  const proofHost = comparableReportHost(rerunReport);
  if (!sourceHost || !proofHost || sourceHost !== proofHost) {
    return receiptError("The rerun report is for a different site. Rerun the audit on the same host.", 409);
  }

  const freshAfterMs = rerunProofFreshAfterMs(action, report);
  const rerunTimestampMs = reportTimestampMs(rerunReport);
  if (!rerunTimestampMs) {
    return receiptError("The rerun report has no capture time. Run the audit again to get one.", 409);
  }
  if (freshAfterMs > 0 && rerunTimestampMs <= freshAfterMs) {
    return receiptError("The rerun report is older than the repair. Rerun the audit after applying the fix.", 409);
  }

  const proofIssue = repairProofIssueForAction(report, action);
  const queueIssue = issueFromQueueItem(item, action);
  if (
    !rerunReportProvesIssue(rerunReport, proofIssue, "fixed") &&
    !rerunReportProvesIssue(rerunReport, queueIssue, "fixed")
  ) {
    return receiptError(
      "The rerun report does not prove this repair fixed. The problem may still be on the page.",
      409
    );
  }

  const actionMode = cleanActionMode(action.action_mode || action.actionMode || item.actionMode || item.action_mode);
  const actionType = cleanActionType(action.action_type || action.actionType);
  const title = text(item.title || proofIssue.title || action.issue_title || "Proof-backed repair", 220);
  const pageUrl = text(item.pageUrl || item.page_url || proofIssue.pageUrl || proofIssue.page_url || report.url, 600);
  const pageLabel = text(item.pageLabel || item.page_label || pageUrl || "target page", 160);
  const severity = text(item.severity || proofIssue.severity || action.severity || "notice", 80);
  const sourceProof = block(
    action.source_proof || action.sourceProof || item.proof || item.evidence || proofIssue.evidence,
    3000
  );
  const proposedChange = block(action.proposed_change || action.proposedChange, 7000);
  const acceptance = block(action.acceptance || item.acceptance, 2000);
  const reportUrl = text(report.reportUrl || report.report_url || "", 600);
  const rerunReportUrl = text(rerunReport.reportUrl || rerunReport.report_url || "", 600);
  const appliedAt = text(action.applied_at || action.appliedAt || "", 80);
  const fixedAt = text(action.updated_at || action.updatedAt || "", 80);
  const generatedAt = new Date().toISOString();
  const sourceCapturedAt = timestampLabel(reportTimestampMs(report));
  const rerunCapturedAt = timestampLabel(rerunTimestampMs);
  const filename = repairProofReceiptFilename(reportId, actionId);

  const markdown = [
    "# SEOFixKit Repair Proof Receipt",
    "",
    "This private receipt links one repair you approved to the same-host rerun proof that showed it fixed. SEOFixKit did not publish or merge the change, and makes no promise about indexing or rankings.",
    "",
    "## Repair Summary",
    "",
    bullet("Issue", title),
    bullet("Severity", severity),
    bullet("Target page", pageLabel),
    pageUrl ? bullet("Target URL", pageUrl) : "",
    bullet("Source report", reportId),
    reportUrl ? bullet("Source report URL", reportUrl) : "",
    sourceCapturedAt ? bullet("Source captured", sourceCapturedAt) : "",
    bullet("Queue item", queueItemId || "n/a"),
    bullet("Repair action", actionId),
    bullet("Action mode", actionModeLabel(actionMode)),
    bullet("Action type", actionTypeLabel(actionType)),
    bullet("Approval", approvalState),
    bullet("Execution status", executionState),
    appliedAt ? bullet("Applied", appliedAt) : "",
    bullet("Rerun status", rerunState),
    fixedAt ? bullet("Fixed proof recorded", fixedAt) : "",
    bullet("Generated", generatedAt),
    "",
    "## Before Proof",
    "",
    sourceProof ? fencedBlock(sourceProof, 3000) : "The original report holds the evidence for this repair.",
    "",
    "## Approved Change",
    "",
    proposedChange ? fencedBlock(proposedChange, 7000) : "The approved repair had no text change attached.",
    "",
    "## Acceptance Check",
    "",
    acceptance ? fencedBlock(acceptance, 2000) : "The rerun had to show the original problem gone on the same site.",
    "",
    "## Rerun Proof",
    "",
    bullet("Rerun report", rerunReportId),
    rerunReportUrl ? bullet("Rerun report URL", rerunReportUrl) : "",
    rerunCapturedAt ? bullet("Rerun proof captured", rerunCapturedAt) : "",
    bullet("Rerun host", proofHost),
    bullet("Proof result", "The rerun shows this problem fixed."),
    "",
    "## Observed Outcome",
    "",
    "These numbers come from the first report and the rerun on the same site. Other changes may have moved them too, so they do not attribute every change to this repair action.",
    "",
    ...observedOutcomeLines(report, rerunReport),
    "",
    "## Boundaries",
    "",
    "- Only the report owner, or their API token, can see this receipt.",
    "- SEOFixKit did not publish to a CMS, open or merge a GitHub pull request, or call provider admin APIs for this receipt.",
    "- No guarantee of rankings, traffic, indexing, AI citations or revenue.",
    rerunCapturedAt
      ? `- Rerun captured at ${rerunCapturedAt}. If the site has changed since, rerun the audit before relying on this receipt.`
      : "- If the site changes again, rerun the audit before relying on this receipt."
  ]
    .filter((part) => part !== "")
    .join("\n");

  return {
    ok: true,
    markdown,
    contentType: REPAIR_PROOF_RECEIPT_CONTENT_TYPE,
    filename,
    metadata: {
      reportId,
      queueItemId,
      issueId,
      actionId,
      actionMode,
      actionType,
      approvalState,
      executionState,
      rerunState,
      rerunReportId,
      sourceCapturedAt,
      rerunCapturedAt,
      generatedAt
    }
  };
}

function repairProofReceiptFilename(reportId = "", actionId = "") {
  const report = slug(reportId, "report");
  const action = slug(actionId, "repair-action");
  return `${report}-${action}-repair-proof.md`.slice(0, 180);
}

function observedOutcomeLines(report = {}, rerunReport = {}) {
  return [
    `- Score: ${scoreOutcome(report.score, rerunReport.score)}`,
    `- Issues (excluding confirmed false positives): ${issueCountOutcome(report, rerunReport)}`,
    `- Fixed issues recorded by the rerun report: ${fixedIssuesRecorded(rerunReport)}`
  ];
}

function scoreOutcome(sourceScore, rerunScore) {
  const before = finiteNumber(sourceScore);
  const after = finiteNumber(rerunScore);
  if (before === null || after === null) return "not recorded";
  return `${before} -> ${after} (${signed(after - before)})`;
}

function issueCountOutcome(report = {}, rerunReport = {}) {
  const before = issueCount(report);
  const after = issueCount(rerunReport);
  if (before === null || after === null) return "not recorded";
  return `${before} -> ${after} (${signed(after - before)})`;
}

function issueCount(report = {}) {
  if (!Array.isArray(report.findings)) return null;
  return report.findings.filter((finding) => finding?.severity && finding.severity !== "good").length;
}

function fixedIssuesRecorded(rerunReport = {}) {
  const delta = rerunReport.reportDelta || rerunReport.report_delta;
  if (!delta || typeof delta !== "object") return "not recorded";
  const camel = Array.isArray(delta.fixedIssues) ? delta.fixedIssues : [];
  const snake = Array.isArray(delta.fixed_issues) ? delta.fixed_issues : [];
  return String(camel.length + snake.length);
}

function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function signed(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number}`;
  return String(number);
}

function issueFromQueueItem(item = {}, action = {}) {
  return {
    ...item,
    id: item.id || item.issueId || item.issue_id || action.issue_id || action.issueId || "",
    issueId: item.issueId || item.issue_id || action.issue_id || action.issueId || "",
    issue_id: item.issue_id || item.issueId || action.issue_id || action.issueId || "",
    source_proof: action.source_proof || action.sourceProof || item.proof || item.evidence || ""
  };
}

function actionModeLabel(mode = "") {
  return (
    {
      self_serve: "Self-serve implementation",
      teammate: "Teammate handoff",
      fix_pack: "Fix Pack fulfillment",
      cms_draft: "CMS draft",
      github_pr: "GitHub PR draft"
    }[mode] || "Self-serve implementation"
  );
}

function actionTypeLabel(type = "") {
  return (
    {
      draft_fix: "Draft fix",
      metadata_copy: "Metadata copy",
      schema_snippet: "Schema snippet",
      fix_pack_handoff: "Fix Pack handoff",
      cms_draft: "CMS draft",
      github_pr_draft: "GitHub PR draft"
    }[type] || "Draft fix"
  );
}

function receiptError(error, status = 400) {
  return { ok: false, status, error };
}

function timestampLabel(timestampMs = 0) {
  return Number.isFinite(timestampMs) && timestampMs > 0 ? new Date(timestampMs).toISOString() : "";
}

function bullet(label, value) {
  return `- ${label}: ${text(value, 1000) || "n/a"}`;
}

function block(value = "", max = 4000) {
  return sanitizeMarkdown(value, max, { multiline: true });
}

function text(value = "", max = 500) {
  return sanitizeMarkdown(value, max, { multiline: false });
}

function fencedBlock(value = "", max = 4000) {
  const content = block(value, max);
  const longestFence = Math.max(2, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  return `${fence}\n${content}\n${fence}`;
}

function sanitizeMarkdown(value = "", max = 500, options = {}) {
  const source = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "");
  const cleaned = options.multiline
    ? source
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : source.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, max);
}

function slug(value = "", fallback = "item") {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || fallback
  );
}

export { REPAIR_PROOF_RECEIPT_CONTENT_TYPE, buildRepairProofReceipt, repairProofReceiptFilename };
