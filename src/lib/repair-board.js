export function mergeRepairQueueWithCollaboration(queueItems = [], collaborationIssues = []) {
  const collaborationByIssue = new Map(collaborationIssues.map((issue) => [issue.issueId, issue]));
  return queueItems.map((item) => {
    const collaboration = collaborationByIssue.get(item.issueId) || {};
    return {
      ...item,
      assigneeEmail: collaboration.assigneeEmail || "",
      note: collaboration.note || "",
      collaborationStatus: collaboration.status || "",
      collaborationUpdatedAt: collaboration.updatedAt || "",
      collaborationUpdatedByEmail: collaboration.updatedByEmail || "",
      proposedChange: item.latestAction?.proposedChange || ""
    };
  });
}

export function repairBoardCounts(issues = []) {
  return issues.reduce((counts, issue) => {
    counts.total += 1;
    if (issue.status === "drafted") counts.drafted += 1;
    if (issue.status === "approved") counts.approved += 1;
    if (issue.status === "fixed") counts.fixed += 1;
    return counts;
  }, { total: 0, drafted: 0, approved: 0, fixed: 0 });
}

export function collaborationStatusForQueueStatus(status) {
  if (status === "fixed") return "fixed";
  if (status === "ignored") return "ignored";
  if (["drafted", "approved", "applied", "in_progress"].includes(status)) return "in_progress";
  return "open";
}

export function manualRepairQueueStatus(status) {
  return ["open", "in_progress", "ignored"].includes(status) ? status : "";
}

export function actionTypeForMode(mode) {
  const types = {
    cms_draft: "cms_draft",
    fix_pack: "fix_pack_handoff",
    github_pr: "github_pr_draft"
  };
  return types[mode] || "draft_fix";
}
