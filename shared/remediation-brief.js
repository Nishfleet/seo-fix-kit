const SEVERITY_RANK = {
  critical: 0,
  warning: 1,
  notice: 2,
  good: 3
};

export function buildRemediationBrief(report = {}) {
  const issues = issueQueue(report);
  const repairPlan = Array.isArray(report.repairPlan) ? report.repairPlan : [];
  const usedIssues = new Set();
  const plannedQueue = repairPlan.map((plan, index) => {
    const issue = issues.find((item) => !usedIssues.has(item) && sameIssue(plan, item)) || {};
    if (hasIssue(issue)) usedIssues.add(issue);
    return repairQueueItem({ issue, plan, index, report });
  });
  const findingQueue = issues
    .filter((issue) => !usedIssues.has(issue))
    .map((issue, index) => repairQueueItem({ issue, plan: {}, index: plannedQueue.length + index, report }));
  const priorityQueue = [...plannedQueue, ...findingQueue].slice(0, 8);
  const delta = report.reportDelta || report.report_delta || {};

  return {
    generatedAt: new Date().toISOString(),
    reportId: report.id || "",
    url: report.url || "",
    host: safeHost(report.url),
    mode: priorityQueue.length ? "owner_review_required" : "monitoring",
    summary: {
      score: Number(report.score || 0),
      pagesScanned: Number(report.summary?.pagesScanned || report.pages?.length || 0),
      maxPages: Number(report.summary?.maxPages || 0),
      critical: Number(report.summary?.critical || 0),
      warnings: Number(report.summary?.warnings || 0),
      notices: Number(report.summary?.notices || 0),
      guardedFalsePositives: Number(report.summary?.guardedFalsePositives || 0),
      priorityRepairs: priorityQueue.length
    },
    priorityQueue,
    proofHistory: {
      status: delta.status || "unknown",
      fixedIssues: Number(delta.summary?.fixedIssuesCount || 0),
      newIssues: Number(delta.summary?.newIssuesCount || 0),
      persistentIssues: Number(delta.summary?.persistentIssuesCount || 0),
      previousReportPath: delta.previous?.reportPath || delta.previousReport?.reportPath || ""
    },
    nextActions: nextActions(priorityQueue, delta),
    support: {
      fixPackEligible: priorityQueue.length > 0,
      safeHandoff:
        "When you hand this off, include the report link, the problem, what we found, the fix and how to confirm it. Do not claim rankings, traffic or revenue results.",
      handoffRules: [
        "Work only from what the audit found on the loaded pages.",
        "Every repair needs a person to approve the change and a rerun to confirm it.",
        "Don't publish changes or edit the live site automatically from this brief.",
        "Pass billing, access, legal or customer-data questions to a person. Don't guess."
      ]
    }
  };
}

function repairQueueItem({ issue = {}, plan = {}, index = 0, report = {} }) {
  return {
    id: issue.id || plan.id || `repair-${index + 1}`,
    priority: index + 1,
    title: plan.title || issue.title || "SEO repair",
    severity: issue.severity || plan.severity || "notice",
    pageUrl: issue.pageUrl || plan.pageUrl || "",
    pageLabel: issue.pageLabel || plan.pageLabel || "",
    proof: issue.evidence || plan.proof || plan.why || "",
    fix: plan.fix || issue.fix || "",
    workType: plan.workType || "repair",
    estimatedEffort: plan.estimatedEffort || "15-30 min",
    source: issue.source || plan.source || "",
    acceptanceChecks: acceptanceChecksFor(issue, plan, report)
  };
}

function issueQueue(report = {}) {
  return (report.findings || [])
    .filter((finding) => finding?.severity && finding.severity !== "good")
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}

function sameIssue(plan = {}, issue = {}) {
  const planIssueId = clean(plan.findingId || plan.issueId);
  const issueId = clean(issue.id);
  if (planIssueId && issueId && planIssueId === issueId) return true;

  if (!clean(plan.title) || clean(plan.title) !== clean(issue.title)) return false;

  const planPageUrl = clean(plan.pageUrl);
  const issuePageUrl = clean(issue.pageUrl);
  if (planPageUrl && issuePageUrl) return planPageUrl === issuePageUrl;

  const planPageLabel = clean(plan.pageLabel);
  const issuePageLabel = clean(issue.pageLabel);
  if (planPageLabel && issuePageLabel) return planPageLabel === issuePageLabel;

  return true;
}

function hasIssue(issue = {}) {
  return Boolean(issue.id || issue.title || issue.pageUrl || issue.evidence);
}

function clean(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function acceptanceChecksFor(issue = {}, plan = {}, report = {}) {
  const checks = [
    "Rerun the saved audit and check this problem is fixed, less severe, or marked as not applicable.",
    "Keep the evidence attached to the problem until you close the repair."
  ];
  if (issue.pageUrl) checks.unshift(`Open ${issue.pageUrl} and check the fix shows on the live page.`);
  if (/schema|structured data/i.test(issue.title || plan.title || "")) {
    checks.push("Run the page's schema through a validator after the change.");
  }
  if (/title|description|h1|canonical|robots/i.test(issue.title || plan.title || "")) {
    checks.push("Check the page's actual HTML head, not just the CMS field.");
  }
  if (report.reportDelta?.status === "ready") {
    checks.push("Compare with the previous report so fixed problems don't come back.");
  }
  return [...new Set(checks)].slice(0, 5);
}

function nextActions(priorityQueue = [], delta = {}) {
  if (!priorityQueue.length) {
    return [
      "Rerun the audit, or turn on weekly monitoring, after big site changes.",
      "Keep the filtered false alarms on record so nobody fixes them later by mistake."
    ];
  }
  const actions = [
    "Assign the first repair to someone.",
    "Make the fix on a staging site first, or with a careful live change.",
    "Rerun the audit and check each fix before closing it."
  ];
  if (delta.status === "ready")
    actions.push("Review what got fixed, what's new and what's still open before starting more work.");
  return actions;
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
