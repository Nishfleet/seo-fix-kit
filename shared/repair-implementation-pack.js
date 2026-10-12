import { cleanActionMode, cleanActionType, cleanApprovalState, cleanExecutionState } from "./repair-queue.js";

const IMPLEMENTATION_PACK_CONTENT_TYPE = "text/markdown; charset=utf-8";

function buildRepairImplementationPack({ report = {}, item = {}, action = {} } = {}) {
  const actionId = text(action.id || action.actionId, 160);
  const reportId = text(action.report_id || action.reportId || report.id || item.reportId || item.report_id, 160);
  const queueItemId = text(action.queue_item_id || action.queueItemId || item.id, 160);
  const issueId = text(action.issue_id || action.issueId || item.issueId || item.issue_id, 160);
  if (!actionId || !reportId || !issueId) {
    return packError("This repair action doesn't exist. Open the repair from your report and try again.", 400);
  }

  if (rawUnsupported(action.action_mode || action.actionMode) || rawUnsupported(item.actionMode || item.action_mode)) {
    return packError("Unsupported repair actions have no implementation pack. Handle this one by hand.", 409);
  }

  const approvalState = cleanApprovalState(action.approval_state || action.approvalState);
  if (approvalState === "drafted")
    return packError("Approve the repair action first, then create the implementation pack.", 409);
  if (approvalState === "ignored")
    return packError("Ignored repair actions have no implementation pack. Reopen the action to create one.", 409);

  const itemStatus = text(item.status || item.queue_status, 80).toLowerCase();
  if (itemStatus === "ignored")
    return packError("Ignored repair items have no implementation pack. Reopen the item to create one.", 409);

  const actionMode = cleanActionMode(action.action_mode || action.actionMode || item.actionMode || item.action_mode);
  const actionType = cleanActionType(action.action_type || action.actionType);
  const executionState = cleanExecutionState(action.execution_state || action.executionState);
  const proposedChange = block(action.proposed_change || action.proposedChange, 7000);
  if (!proposedChange)
    return packError("This action has no approved change text. Draft and approve a change first.", 409);

  const title = text(item.title || action.issue_title || "Proof-backed repair", 220);
  const pageUrl = text(item.pageUrl || item.page_url || report.url, 600);
  const pageLabel = text(item.pageLabel || item.page_label || pageUrl || "target page", 160);
  const severity = text(item.severity || action.severity || "notice", 80);
  const sourceProof = block(action.source_proof || action.sourceProof || item.proof || item.evidence, 3000);
  const acceptance = block(action.acceptance || item.acceptance, 2000);
  const sourceFix = block(item.fix, 2500);
  const snippet = block(item.snippet, 5000);
  const reportUrl = text(report.reportUrl || report.report_url || "", 600);
  const generatedAt = new Date().toISOString();
  const filename = implementationPackFilename(reportId, actionId);

  const markdown = [
    "# SEOFixKit Implementation Pack",
    "",
    "Step-by-step instructions for one repair you approved. SEOFixKit has not published, merged or applied this change.",
    "",
    "## Repair Summary",
    "",
    bullet("Issue", title),
    bullet("Severity", severity),
    bullet("Target page", pageLabel),
    pageUrl ? bullet("Target URL", pageUrl) : "",
    reportId ? bullet("Report", reportId) : "",
    reportUrl ? bullet("Report URL", reportUrl) : "",
    bullet("Queue item", queueItemId || "n/a"),
    bullet("Repair action", actionId),
    bullet("Action mode", actionModeLabel(actionMode)),
    bullet("Action type", actionTypeLabel(actionType)),
    bullet("Approval", approvalState),
    bullet("Execution status", executionState),
    bullet("Generated", generatedAt),
    "",
    "## Source Proof",
    "",
    sourceProof
      ? fencedBlock(sourceProof, 3000)
      : "The original report holds the evidence for this repair. Open it before making the change.",
    sourceFix ? ["", "## Original Fix Guidance", "", fencedBlock(sourceFix, 2500)].join("\n") : "",
    snippet ? ["", "## Source Snippet", "", fencedBlock(snippet, 5000)].join("\n") : "",
    "",
    "## Approved Change",
    "",
    fencedBlock(proposedChange, 7000),
    "",
    "## Implementation Steps",
    "",
    modeSteps(actionMode).join("\n"),
    "",
    "## Acceptance Check",
    "",
    acceptance
      ? fencedBlock(acceptance, 2000)
      : "Rerun the audit. The original problem is gone, or you have marked it as accepted.",
    "",
    "## Rollback Note",
    "",
    rollbackNote(actionMode),
    "",
    "## Rerun Proof",
    "",
    "Once the change is live, rerun the audit on the same site and attach the new report to this repair action. Mark it fixed only when the rerun shows the problem gone.",
    "",
    "## Boundaries",
    "",
    "- Only the report owner, or their API token, can see this pack.",
    "- SEOFixKit did not publish to a CMS, open or merge a GitHub pull request, or call provider admin APIs for this pack.",
    "- No guarantee of rankings, traffic, indexing, AI citations or revenue.",
    "- If the approved change no longer fits the current site, stop and draft a new repair action first."
  ]
    .filter((part) => part !== "")
    .join("\n");

  return {
    ok: true,
    markdown,
    contentType: IMPLEMENTATION_PACK_CONTENT_TYPE,
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
      generatedAt
    }
  };
}

function implementationPackFilename(reportId = "", actionId = "") {
  const report = slug(reportId, "report");
  const action = slug(actionId, "repair-action");
  return `${report}-${action}-implementation-pack.md`.slice(0, 180);
}

function repairImplementationItemForAction(items = [], action = {}) {
  const queueItemId = action.queue_item_id || action.queueItemId || "";
  if (queueItemId) return items.find((candidate) => candidate.id === queueItemId);
  const issueId = action.issue_id || action.issueId || "";
  return items.find((candidate) => candidate.issueId === issueId || candidate.issue_id === issueId);
}

function modeSteps(mode = "self_serve") {
  const steps = {
    self_serve: [
      "1. Open the target page in your site editor, CMS, or codebase.",
      "2. Apply only the approved change above.",
      "3. Save a copy of the old version, or note what you changed, before publishing.",
      "4. Publish or deploy through your normal workflow.",
      "5. Rerun the audit and attach the new report."
    ],
    teammate: [
      "1. Assign this pack to the teammate responsible for the page.",
      "2. Ask them to apply only the approved change above.",
      "3. Have them record what changed and where it shipped.",
      "4. Rerun the audit once the teammate confirms the change is live.",
      "5. Attach the rerun report before marking the repair fixed."
    ],
    fix_pack: [
      "1. Use this pack as the Fix Pack fulfillment checklist.",
      "2. Confirm the repair still matches the paid report and approved action.",
      "3. Deliver the change note and delivery link to the customer.",
      "4. Rerun the audit on the same site once the change is live.",
      "5. Mark delivery complete only after the rerun report is attached."
    ],
    cms_draft: [
      "1. Create a draft edit in the CMS using the approved change above.",
      "2. Keep the CMS draft unpublished until the owner reviews it in the CMS.",
      "3. Record the CMS draft URL or internal reference outside public reports.",
      "4. Publish only after owner approval in the CMS workflow.",
      "5. Rerun the audit and attach the new report."
    ],
    github_pr: [
      "1. Create a branch in the customer's repository.",
      "2. Apply only the approved change above.",
      "3. Open a pull request with the source proof, acceptance check, and rollback note.",
      "4. Wait for normal code review and CI before merge.",
      "5. Rerun the audit after deploying and attach the new report."
    ]
  };
  return steps[mode] || steps.self_serve;
}

function rollbackNote(mode = "self_serve") {
  const notes = {
    self_serve:
      "Keep a copy of the old text, meta tags or snippet so you can put it back if the change is wrong or the rerun gets worse.",
    teammate: "Ask the teammate to note the old value and how to restore it before changing the page.",
    fix_pack:
      "Keep the delivery note, the old value and a summary of what changed, so support can undo or adjust the repair if the rerun gets worse.",
    cms_draft:
      "Keep the CMS draft history or the old published version. If the rerun gets worse, revert the draft or restore the old version.",
    github_pr:
      "Keep the pull request small. If the rerun gets worse after merge, revert the PR or open a follow-up that restores the old behavior."
  };
  return notes[mode] || notes.self_serve;
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

function packError(error, status = 400) {
  return { ok: false, status, error };
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

function rawUnsupported(value = "") {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "unsupported"
  );
}

export {
  IMPLEMENTATION_PACK_CONTENT_TYPE,
  buildRepairImplementationPack,
  implementationPackFilename,
  repairImplementationItemForAction
};
