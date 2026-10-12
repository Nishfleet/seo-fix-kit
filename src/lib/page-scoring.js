import { pathLabel } from "./format.js";

export function summarizePages(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter((finding) => finding.pageUrl === page.url && finding.severity !== "good");
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      score: scorePageFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0
    };
  });
}

export function scorePageFindings(findings = []) {
  const groups = new Map();
  for (const finding of findings) {
    const key = String(finding.title || "unknown issue")
      .replace(/\son\s(home|\/[^\s]+)/i, "")
      .replace(/\sneeds cleanup.*/i, " needs cleanup")
      .trim();
    const current = groups.get(key) || { critical: 0, warning: 0, notice: 0 };
    if (finding.severity === "critical") current.critical += 1;
    if (finding.severity === "warning") current.warning += 1;
    if (finding.severity === "notice") current.notice += 1;
    groups.set(key, current);
  }

  let penalty = 0;
  for (const group of groups.values()) {
    penalty += scorePenalty(group.critical, "critical");
    penalty += scorePenalty(group.warning, "warning");
    penalty += scorePenalty(group.notice, "notice");
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

export function scorePenalty(count, severity) {
  if (!count) return 0;
  const first = { critical: 12, warning: 5, notice: 1 }[severity] || 0;
  const repeat = { critical: 4, warning: 1.5, notice: 0.25 }[severity] || 0;
  const cap = { critical: 28, warning: 10, notice: 3 }[severity] || first;
  return Math.min(cap, first + Math.max(0, count - 1) * repeat);
}
