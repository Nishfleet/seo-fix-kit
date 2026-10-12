const MAX_REPAIR_PROPOSALS = 25;

const REPAIR_EXECUTION_MODES = new Set([
  "generated_proposal",
  "cms_candidate",
  "github_pr_candidate",
  "manual_task",
  "unsupported"
]);

function buildRepairProposalsFromReport(report = {}, context = {}) {
  const targetUrl = context.targetUrl || report.url || "";
  const targetHost = context.targetHost || safeHost(targetUrl);
  const items = [
    ...(Array.isArray(report.findings)
      ? report.findings.map((item, index) => normalizeRepairItem(item, index, report, context, "finding"))
      : []),
    ...(Array.isArray(report.repairPlan)
      ? report.repairPlan.map((item, index) => normalizeRepairItem(item, index, report, context, "repair-plan"))
      : [])
  ]
    .filter((item) => item.title && item.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.priority - b.priority);

  const proposals = [];
  const seen = new Set();
  for (const item of items) {
    const dedupeKey = `${slugify(item.title)}:${item.pageUrl || targetUrl}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const classification = classifyRepairItem(item);
    proposals.push({
      issueId: item.issueId || `repair-${item.priority}-${slugify(item.title)}`,
      issueTitle: item.title,
      targetUrl: item.pageUrl || targetUrl,
      targetHost,
      severity: item.severity || "notice",
      source: item.source || item.kind,
      priority: proposals.length + 1,
      executionMode: classification.mode,
      approvalStatus: "pending",
      deliveryStatus: "draft",
      generatedTitle: generatedProposalTitle(item, classification),
      generatedSummary: generatedProposalSummary(item, classification),
      proof: {
        evidence: item.proof,
        confidence: item.confidence || "verified",
        source: item.source || "",
        pageUrl: item.pageUrl || targetUrl
      },
      proposal: {
        fix: item.fix,
        snippet: item.snippet || "",
        workType: item.workType || classification.workType,
        estimatedEffort: item.estimatedEffort || "",
        modeReason: classification.reason,
        requiresOwnerApproval: true
      },
      acceptance: [item.acceptance || acceptanceForMode(item, classification)].filter(Boolean)
    });
    if (proposals.length >= Number(context.limit || MAX_REPAIR_PROPOSALS)) break;
  }
  return proposals;
}

function normalizeRepairItem(raw = {}, index, report = {}, context = {}, kind = "finding") {
  return {
    kind,
    priority: Number(raw.priority || index + 1),
    issueId: compactText(raw.id || raw.issueId || raw.issue_id || "", 160),
    title: compactText(raw.title || raw.name || "", 180),
    severity: compactText(raw.severity || "notice", 40),
    source: compactText(raw.source || "", 240),
    pageUrl: compactText(raw.pageUrl || raw.page_url || raw.url || "", 500),
    pageLabel: compactText(raw.pageLabel || raw.page_label || "", 120),
    proof: compactText(raw.evidence || raw.proof || raw.why || "", 1000),
    fix: compactText(raw.fix || raw.recommendation || raw.body || "", 1000),
    confidence: compactText(raw.confidence || "verified", 80),
    snippet: compactText(raw.snippet || "", 4000),
    estimatedEffort: compactText(raw.estimatedEffort || raw.estimated_effort || "", 80),
    workType: compactText(raw.workType || raw.work_type || "", 80),
    acceptance: compactText(raw.acceptance || raw.acceptanceCheck || raw.acceptance_check || "", 500),
    reportUrl: context.targetUrl || report.url || ""
  };
}

function classifyRepairItem(item = {}) {
  const haystack = `${item.title} ${item.fix} ${item.source} ${item.workType}`.toLowerCase();
  if (!item.fix && !item.snippet) {
    return {
      mode: "unsupported",
      workType: "review",
      reason: "The report found the problem but has no fix detailed enough to carry out safely."
    };
  }
  if (hasAny(haystack, ["wordpress", "woocommerce", "shopify", "webflow", "cms", "platform-seo-audit"])) {
    return {
      mode: "cms_candidate",
      workType: item.workType || "content",
      reason:
        "The site runs on a known platform, so this can become a CMS edit once you approve it and the connection is checked."
    };
  }
  if (
    item.snippet &&
    hasAny(haystack, [
      "schema",
      "canonical",
      "viewport",
      "doctype",
      "charset",
      "social share",
      "og:image",
      "twitter:image"
    ])
  ) {
    return {
      mode: "github_pr_candidate",
      workType: item.workType || "code",
      reason: "The audit wrote an exact code snippet you can review as a code change."
    };
  }
  if (item.snippet && hasAny(haystack, ["title", "description", "h1", "alt"])) {
    return {
      mode: "generated_proposal",
      workType: item.workType || "content",
      reason: "The audit wrote a snippet or suggested text. It needs your approval first."
    };
  }
  if (
    hasAny(haystack, [
      "pagespeed",
      "core web vitals",
      "largest contentful paint",
      "total blocking time",
      "layout shift",
      "slow",
      "large image",
      "large html",
      "broken link",
      "broken image",
      "external link",
      "thin",
      "heading",
      "hreflang",
      "redirect",
      "https",
      "security",
      "robots",
      "sitemap",
      "backlink",
      "keyword"
    ])
  ) {
    return {
      mode: "manual_task",
      workType: item.workType || "technical",
      reason: "You or your developer need to make this change. It can't be generated safely."
    };
  }
  return {
    mode: "manual_task",
    workType: item.workType || "review",
    reason: "Review this by hand before making the change."
  };
}

function generatedProposalTitle(item, classification) {
  const prefix =
    {
      generated_proposal: "Approve suggested fix",
      cms_candidate: "Review CMS edit",
      github_pr_candidate: "Review code change",
      manual_task: "Assign manual repair",
      unsupported: "Needs manual review"
    }[classification.mode] || "Review repair";
  return `${prefix}: ${item.title}`;
}

function generatedProposalSummary(item, classification) {
  const fix = item.fix || "Look at what the audit found and decide whether to fix it.";
  return compactText(`${classification.reason} ${fix}`, 700);
}

function acceptanceForMode(item, classification) {
  if (classification.mode === "unsupported")
    return "Don't sell this as a done-for-you fix until there is a safe way to make it.";
  if (item.snippet) return "You approve the change, then a rerun shows the problem is gone.";
  return "You approve the task, the change is written down, and a rerun shows the problem gone or marked as accepted.";
}

function normalizeRepairExecutionMode(value, fallback = "manual_task") {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  return REPAIR_EXECUTION_MODES.has(mode) ? mode : fallback;
}

function severityRank(severity = "") {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function hasAny(value = "", needles = []) {
  return needles.some((needle) => value.includes(needle));
}

function safeHost(value = "") {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function compactText(value = "", max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function slugify(value = "") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || "repair";
}

export {
  MAX_REPAIR_PROPOSALS,
  REPAIR_EXECUTION_MODES,
  buildRepairProposalsFromReport,
  classifyRepairItem,
  normalizeRepairExecutionMode
};
