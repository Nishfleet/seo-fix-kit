function repairAccountSummaryFromItems(contexts = [], schedules = []) {
  const monitoredReportIds = new Set((schedules || []).map((schedule) => schedule.lastReportId).filter(Boolean));
  const queueItems = [];
  const regressionItems = [];

  for (const context of latestContextPerUrl(contexts)) {
    const response = context.response || {};
    const report = context.report || {};
    for (const item of context.items || []) {
      if (!isActionableRepairItem(item)) continue;
      queueItems.push(accountRepairItemResponse(item, response));
    }
    const regression = monitorRegressionItem(report, response, monitoredReportIds);
    if (regression) regressionItems.push(regression);
  }

  const nextItems = [...regressionItems, ...queueItems]
    .sort((a, b) => a.rank - b.rank || severityRank(a.severity) - severityRank(b.severity) || a.priority - b.priority)
    .slice(0, 6);
  const counts = queueItems.reduce(
    (totals, item) => {
      totals.total += 1;
      totals[item.status] = (totals[item.status] || 0) + 1;
      if (!["fixed", "ignored"].includes(item.status)) totals.active += 1;
      if (item.latestAction?.approvalState === "drafted" || item.status === "drafted") totals.awaitingApproval += 1;
      if (accountRepairAwaitingApply(item)) totals.approvedActions += 1;
      if (accountRepairNeedsRerun(item)) totals.appliedAwaitingRerun += 1;
      return totals;
    },
    {
      total: 0,
      active: 0,
      open: 0,
      in_progress: 0,
      drafted: 0,
      approved: 0,
      applied: 0,
      fixed: 0,
      ignored: 0,
      regressed: 0,
      awaitingApproval: 0,
      approvedActions: 0,
      appliedAwaitingRerun: 0,
      monitorRegressions: regressionItems.length
    }
  );

  return {
    counts,
    nextItems,
    updatedAt: new Date().toISOString()
  };
}

function accountRepairAwaitingApply(item = {}) {
  if (item.rerunStatus !== "not_run") return false;
  if (["applied", "fixed", "ignored", "regressed"].includes(item.status)) return false;
  if (item.latestAction?.executionState === "applied") return false;
  return item.latestAction?.approvalState === "approved" || item.status === "approved";
}

function accountRepairNeedsRerun(item = {}) {
  if (["fixed", "regressed"].includes(item.status) || item.rerunStatus !== "not_run") return false;
  return item.status === "applied" || item.latestAction?.executionState === "applied";
}

function accountRepairItemResponse(item = {}, report = {}) {
  const nextAction = repairNextAction(item);
  return {
    id: `${report.id}:${item.issueId}`,
    kind: "repair_queue",
    reportId: report.id,
    reportPath: report.reportPath,
    targetHost: report.targetHost || safeHostname(report.url),
    issueId: item.issueId,
    title: item.title,
    severity: item.severity,
    status: item.status,
    actionMode: item.actionMode,
    rerunStatus: item.rerunStatus,
    proof: item.proof,
    acceptance: item.acceptance,
    priority: Number(item.priority || 999),
    latestAction: item.latestAction,
    ...nextAction
  };
}

function repairNextAction(item = {}) {
  if (item.status === "regressed" || item.rerunStatus === "regressed") {
    return {
      rank: 0,
      nextActionId: "review-regressed-repair",
      nextActionLabel: "Review reopened repair",
      nextActionDetail: `${item.title || "A repair"} came back on the last rerun.`
    };
  }
  if (["still_open", "new"].includes(item.rerunStatus)) {
    return {
      rank: 0,
      nextActionId: "review-rerun-repair",
      nextActionLabel: "Review rerun result",
      nextActionDetail: `${item.title || "A repair"} still shows on the last rerun.`
    };
  }
  if (item.latestAction?.approvalState === "drafted" || item.status === "drafted") {
    return {
      rank: 1,
      nextActionId: "approve-drafted-repair",
      nextActionLabel: "Approve drafted repair",
      nextActionDetail: `${item.title || "A repair"} has a draft fix to review.`
    };
  }
  if (item.latestAction?.executionState === "applied" || item.status === "applied") {
    return {
      rank: 3,
      nextActionId: "rerun-applied-repair",
      nextActionLabel: "Rerun audit",
      nextActionDetail: `${item.title || "A repair"} is marked applied. Rerun the audit to confirm it's fixed.`
    };
  }
  if (item.latestAction?.approvalState === "approved" || item.status === "approved") {
    return {
      rank: 2,
      nextActionId: "apply-approved-repair",
      nextActionLabel: "Apply approved repair",
      nextActionDetail: `${item.title || "A repair"} is approved. Make the change, then rerun the audit.`
    };
  }
  return {
    rank: item.status === "in_progress" ? 4 : 5,
    nextActionId: "start-proof-repair",
    nextActionLabel: "Start repair",
    nextActionDetail: `${item.title || "A repair"} is the next problem to fix.`
  };
}

function monitorRegressionItem(report = {}, response = {}, monitoredReportIds = new Set()) {
  const reportId = response.id || report.id || "";
  const delta = report.reportDelta || report.report_delta || null;
  if (!delta || !monitoredReportIds.has(reportId)) return null;
  const summary = delta.summary || {};
  const newIssues = Number(summary.newIssuesCount || 0);
  const criticalDelta = Number(summary.criticalDelta || 0);
  const warningDelta = Number(summary.warningDelta || 0);
  if (newIssues <= 0 && criticalDelta <= 0 && warningDelta <= 0) return null;
  const issue = (delta.newIssues || [])[0] || (delta.persistentIssues || [])[0] || {};
  const severity = issue.severity || (criticalDelta > 0 ? "critical" : "warning");
  const targetHost = response.targetHost || safeHostname(response.url);
  return {
    id: `monitor-regression:${reportId}`,
    kind: "monitor_regression",
    reportId,
    reportPath: response.reportPath,
    targetHost,
    issueId: "",
    title:
      issue.title ||
      `${newIssues || criticalDelta || warningDelta} problem${newIssues === 1 ? "" : "s"} new or worse since the last run`,
    severity,
    status: "regressed",
    actionMode: "self_serve",
    rerunStatus: "regressed",
    proof:
      issue.evidence ||
      delta.note ||
      "The latest scheduled rerun found problems that are new or worse than in the last report.",
    acceptance: issue.fix || "Open the latest report and check the new or worse problem.",
    priority: 0,
    latestAction: null,
    rank: 0,
    nextActionId: "review-monitor-regression",
    nextActionLabel: "Review new problems",
    nextActionDetail: `${targetHost} has new or worse problems since the last rerun.`
  };
}

function latestContextPerUrl(contexts = []) {
  const seen = new Set();
  return contexts.filter((context) => {
    const url = context.response?.url || context.report?.url || "";
    const key = url.toLowerCase().replace(/\/+$/, "") || context.response?.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isActionableRepairItem(item = {}) {
  return item?.title && !["fixed", "ignored"].includes(item.status);
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2 }[severity] ?? 3;
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export { repairAccountSummaryFromItems };
