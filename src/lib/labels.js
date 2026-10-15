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
    crawlableContent: "250+ words of text",
    entityClarity: "Title, description and H1",
    answerReadySections: "Question-style headings",
    usefulSchema: "Useful schema",
    internalContext: "Internal links"
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
    self_serve: "Do it yourself",
    teammate: "Teammate",
    fix_pack: "Fix Pack",
    cms_draft: "CMS draft",
    github_pr: "GitHub PR (planned)"
  };
  return labels[mode] || "Do it yourself";
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
  if (status === "paid") return "Payment confirmed. Your repair pass is in the queue.";
  if (status === "in_progress") return "The repair pass is in progress. Delivery notes will appear here.";
  if (status === "delivered") return "Your repair pass is done. Open the delivery and rerun links below.";
  if (status === "payment_failed") return "Payment didn’t go through. You can open checkout again from this report.";
  if (status === "refunded") return "This Fix Pack was refunded.";
  if (status === "refund_failed")
    return "Your refund didn’t go through yet. Email support@seofixkit.com and we’ll make sure it reaches you.";
  if (status === "disputed") return "This payment is disputed and under review by support.";
  if (checkoutReturned) return "Back from checkout. Payment confirmation from Dodo Payments can take a minute.";
  return "Checkout is open for this report.";
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
    return job.error || "The audit didn’t finish. Check the URL and run it again.";
  }
  if (job.status === "running") {
    return "Loading pages in a browser…";
  }
  return "Waiting to start…";
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

export function uptimeDetail(schedule = {}, included = true) {
  if (!included)
    return "Downtime alerts come with a Fix Pack: we check the site every 15 minutes and email you if it goes down.";
  const uptime = schedule.uptime || {};
  if (uptime.status === "down") {
    const since = uptime.downSince ? ` since ${formatDate(uptime.downSince)}` : "";
    return `Not answering${since}. ${uptime.lastError || ""} We email you when it is back.`.trim();
  }
  if (uptime.status === "up") return "Up. We check it answers every 15 minutes and email you if it goes down.";
  return "We’ll check it answers every 15 minutes and email you if it goes down.";
}
