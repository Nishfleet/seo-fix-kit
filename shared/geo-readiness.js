function buildGeoReadinessAudit(report = {}) {
  const home = report.pages?.[0]?.rendered || {};
  if (!report.pages?.[0]?.finalUrl || !report.pages?.[0]?.rendered) {
    return {
      status: "skipped",
      source: "seo-geo-readiness",
      checks: {},
      summary: { passed: 0, total: 0, repairOpportunityCount: 0 },
      repairOpportunities: [],
      guidance: geoGuidance()
    };
  }
  const checks = {
    crawlableContent: Number(home.wordCount || 0) >= 250,
    entityClarity: Boolean(home.title && home.description && home.h1s?.length),
    answerReadySections: hasAnswerReadySections(home.headings || []),
    usefulSchema: hasUsefulSchema(home.schemaTypes || []),
    internalContext: Number(home.internalLinks?.length || 0) > 0
  };
  const repairOpportunities = [];

  if (!checks.entityClarity) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "warning",
      title: "SEO/GEO entity clarity needs cleanup",
      proof: `Title: ${home.title || "missing"}; description: ${home.description || "missing"}; H1s: ${home.h1s?.join(" | ") || "missing"}.`,
      fix: "Make the title, meta description and H1 each say who you are, what you offer and who it's for.",
      acceptance: "A rerun shows a title, description and H1 that agree with each other and with the page.",
      estimatedEffort: "15-45 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  if (!checks.answerReadySections) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "notice",
      title: "Add answer-ready sections for buyer questions",
      proof: "No headings for a FAQ, how it works, pricing, comparisons or direct questions.",
      fix: "Add short sections, in the page HTML, that answer what buyers ask. Keep each claim specific and back it up.",
      acceptance:
        "A rerun shows headings and text that answer the main buyer questions, present in the HTML and not loaded later by scripts.",
      estimatedEffort: "30-90 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  if (!checks.usefulSchema) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "notice",
      title: "Add truthful entity schema where useful",
      proof: `Rendered schema types: ${home.schemaTypes?.join(", ") || "none"}.`,
      fix: "Add Organization, WebSite, Product, Service, LocalBusiness or FAQ schema, but only for what the page shows.",
      acceptance: "The JSON-LD is valid and its types match what visitors see on the page.",
      estimatedEffort: "15-45 min",
      workType: "code",
      source: "geo-readiness"
    });
  }

  if (!checks.crawlableContent) {
    repairOpportunities.push({
      priority: repairOpportunities.length + 1,
      severity: "warning",
      title: "Make core answer content crawlable",
      proof: `${Number(home.wordCount || 0)} rendered words found on the primary page.`,
      fix: "Add visible text that explains the offer, who uses it and how, what it doesn't do, and what to do next.",
      acceptance: "A rerun shows enough text on the page and this no longer flags as thin content.",
      estimatedEffort: "30-90 min",
      workType: "content",
      source: "geo-readiness"
    });
  }

  return {
    status: "ready",
    source: "seo-geo-readiness",
    checks,
    summary: {
      passed: Object.values(checks).filter(Boolean).length,
      total: Object.keys(checks).length,
      repairOpportunityCount: repairOpportunities.length
    },
    repairOpportunities,
    guidance: geoGuidance()
  };
}

function geoGuidance() {
  return {
    llmsTxt: "Some non-Google AI tools read llms.txt. It is not required for Google Search or Google's AI features.",
    priority:
      "Focus on text in the HTML, plain statements of who you are and what you sell, accurate schema, internal links, and answers you can back up."
  };
}

function geoReadinessBriefLines(audit = null) {
  if (!audit || audit.status !== "ready") return [];
  const lines = [
    "## SEO/GEO readiness",
    "",
    `- Checks passed: ${audit.summary.passed}/${audit.summary.total}`,
    `- Repair opportunities: ${audit.summary.repairOpportunityCount}`,
    `- Boundary: ${audit.guidance.llmsTxt}`,
    `- Priority: ${audit.guidance.priority}`
  ];
  if (audit.repairOpportunities.length) {
    lines.push(`- Top repair: ${audit.repairOpportunities[0].title}`);
  }
  lines.push("");
  return lines;
}

function hasAnswerReadySections(headings = []) {
  const joined = headings
    .map((heading) => heading.text || "")
    .join(" ")
    .toLowerCase();
  return [
    "faq",
    "frequently asked",
    "how it works",
    "pricing",
    "compare",
    "comparison",
    "why",
    "what is",
    "who is"
  ].some((needle) => joined.includes(needle));
}

function hasUsefulSchema(schemaTypes = []) {
  const useful = new Set([
    "Organization",
    "WebSite",
    "Product",
    "Service",
    "LocalBusiness",
    "FAQPage",
    "SoftwareApplication"
  ]);
  return schemaTypes.some((type) => useful.has(type));
}

export { buildGeoReadinessAudit, geoReadinessBriefLines };
