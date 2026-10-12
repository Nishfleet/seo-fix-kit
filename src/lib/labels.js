import { formatDate } from "./format.js";

export function growthTypeLabel(type = "") {
  const labels = {
    comparison_outline: "Comparison",
    faq_block: "FAQ brief",
    free_tool_idea: "Free tool",
    internal_link_hub: "Hub",
    page_refresh: "Page refresh"
  };
  return labels[type] || "Draft";
}

export function geoCheckLabel(key) {
  const labels = {
    crawlableContent: "Crawlable content",
    entityClarity: "Entity clarity",
    answerReadySections: "Answer-ready sections",
    usefulSchema: "Useful schema",
    internalContext: "Internal context"
  };
  return labels[key] || key;
}

export function repairStatusLabel(status) {
  const labels = {
    open: "Open",
    in_progress: "In progress",
    drafted: "Drafted",
    approved: "Approved",
    applied: "Applied",
    fixed: "Fixed",
    ignored: "Ignored",
    regressed: "Regressed"
  };
  return labels[status] || "Open";
}

export function repairApprovalLabel(state) {
  const labels = {
    drafted: "Drafted",
    approved: "Approved",
    ignored: "Ignored"
  };
  return labels[state] || "Drafted";
}

export function repairExecutionLabel(state) {
  const labels = {
    not_started: "Not started",
    recorded: "Recorded",
    applied: "Applied",
    blocked: "Blocked"
  };
  return labels[state] || "Not started";
}

export function repairActionModeLabel(mode) {
  const labels = {
    self_serve: "Self serve",
    teammate: "Teammate",
    fix_pack: "Fix Pack",
    cms_draft: "CMS draft",
    github_pr: "Future PR"
  };
  return labels[mode] || "Self serve";
}

export function proposalStatusLabel(status = "") {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    dismissed: "Dismissed",
    draft: "Draft",
    in_progress: "In progress",
    delivered: "Delivered"
  };
  return labels[status] || status || "Pending";
}

export function checkoutMessage(status, checkoutReturned) {
  if (status === "paid") return "Payment is confirmed. Your repair pass is queued.";
  if (status === "in_progress") return "The repair pass is in progress. Delivery notes will appear here.";
  if (status === "delivered") return "Delivery is ready. Use the delivery and rerun links below.";
  if (status === "payment_failed") return "Payment did not complete. You can reopen checkout from this report.";
  if (status === "refunded") return "This Fix Pack was refunded.";
  if (status === "disputed") return "This payment needs manual support review.";
  if (checkoutReturned)
    return "Checkout returned. Payment confirmation can take a moment after Dodo finishes processing.";
  return "Checkout has been opened for this report.";
}

export function statusLabel(status) {
  const labels = {
    new: "Request saved",
    checkout_created: "Checkout opened",
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    paid: "Payment confirmed",
    in_progress: "Repair in progress",
    delivered: "Delivered",
    payment_failed: "Payment failed",
    refunded: "Refunded",
    refund_failed: "Refund failed",
    disputed: "Disputed"
  };
  return labels[status] || labels.new;
}

export function auditJobDetail(job = {}) {
  if (job.status === "completed") {
    return `Report saved${job.completedAt ? ` ${formatDate(job.completedAt)}` : ""}.`;
  }
  if (job.status === "failed") {
    return job.error || "Audit failed. Try another URL.";
  }
  if (job.status === "running") {
    return "Rendering the site and collecting proof.";
  }
  return "Waiting for proof collection to start.";
}

export function auditScheduleDetail(schedule = {}) {
  const next = schedule.nextRunAt ? formatDate(schedule.nextRunAt) : "";
  const last = schedule.lastRunAt ? formatDate(schedule.lastRunAt) : "";
  if (schedule.lastReportPath && last) return `Last checked ${last}. Next check ${next || "soon"}.`;
  if (last) return `Last checked ${last}. Next check ${next || "soon"}.`;
  return `First check ${next || "queued"}.`;
}

export function teamRoleLabel(role) {
  const labels = {
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer"
  };
  return labels[role] || "Editor";
}
