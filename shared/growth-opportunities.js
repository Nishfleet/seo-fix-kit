const MAX_GROWTH_OPPORTUNITIES = 8;

export function buildGrowthOpportunities(report = {}) {
  const opportunities = [];
  const add = (item) => {
    if (!item?.title || !item?.proof) return;
    const id = item.id || `growth-${slug(item.title)}`;
    if (opportunities.some((opportunity) => opportunity.id === id)) return;
    opportunities.push({
      id,
      priority: opportunities.length + 1,
      status: "draft_only",
      draftOnly: true,
      confidence: item.confidence || "needs-review",
      estimatedEffort: item.estimatedEffort || "30-90 min",
      workType: item.workType || "content",
      acceptance: item.acceptance || "Review the draft, publish it once approved, then rerun the audit.",
      source: "proof-derived-growth",
      ...item
    });
  };

  addKeywordRefresh(report.keywordRankAudit || report.keyword_rank_audit, add);
  addCompetitorGapBrief(report.competitorBenchmark || report.competitor_benchmark, add);
  addAiReadinessBrief(report.aiAnswerReadiness || report.ai_answer_readiness, add);
  addCrawlProofBrief(report.crawlIntelligence || report.crawl_intelligence, add);

  const trimmed = opportunities.slice(0, MAX_GROWTH_OPPORTUNITIES).map((item, index) => ({
    ...item,
    priority: index + 1
  }));

  return {
    status: trimmed.length ? "ready" : "skipped",
    source: "proof-derived-growth",
    note: "Growth briefs are drafts based on gaps the audit found. They do not publish content, create CMS drafts or open pull requests, and they do not promise rankings, traffic, citations or revenue.",
    summary: {
      opportunityCount: trimmed.length,
      draftOnly: true,
      keywordBacked: trimmed.filter((item) => item.sourceKind === "keyword").length,
      competitorBacked: trimmed.filter((item) => item.sourceKind === "competitor").length,
      aiReadinessBacked: trimmed.filter((item) => item.sourceKind === "ai_answer_readiness").length,
      crawlBacked: trimmed.filter((item) => item.sourceKind === "crawl").length
    },
    opportunities: trimmed
  };
}

export function growthOpportunitiesBriefLines(growth = {}) {
  if (growth.status !== "ready" || !growth.opportunities?.length) return [];
  const lines = [
    "## Draft-only growth opportunities",
    "",
    "These briefs come from gaps the audit found. They do not publish content or promise rankings, traffic, citations or revenue.",
    ""
  ];

  for (const item of growth.opportunities.slice(0, MAX_GROWTH_OPPORTUNITIES)) {
    lines.push(`${item.priority}. ${item.title}`);
    lines.push(`   Proof: ${item.proof}`);
    lines.push(
      `   Draft: ${item.draftBrief?.summary || item.suggestedAction || item.fix || "Write a draft from this data and review it."}`
    );
    if (item.draftBrief?.sections?.length) {
      lines.push(`   Sections: ${item.draftBrief.sections.join(" | ")}`);
    }
    lines.push(`   Guardrail: ${item.guardrail || "Keep it a draft until someone reviews and approves it."}`);
    lines.push(`   Acceptance check: ${item.acceptance}`);
  }
  lines.push("");
  return lines;
}

export function growthOpportunitiesSummaryCopy(growth = {}) {
  if (growth.status !== "ready" || !growth.opportunities?.length) {
    return "No growth briefs from this report.";
  }
  const summary = growth.summary || {};
  return `${summary.opportunityCount || growth.opportunities.length} draft-only growth ${summary.opportunityCount === 1 ? "brief" : "briefs"} were created from verified keyword, competitor, AI-readiness, or crawl gaps.`;
}

function addKeywordRefresh(audit = {}, add) {
  if (audit.status !== "ready") return;
  const lowCtr = audit.checks?.lowCtrRows?.[0];
  if (lowCtr) {
    add({
      id: "growth-keyword-page-refresh",
      sourceKind: "keyword",
      type: "page_refresh",
      title: "Draft a page refresh for a proven low-CTR query",
      pageUrl: lowCtr.pageUrl || "",
      pageLabel: lowCtr.pageLabel || "",
      proof: `"${lowCtr.query}" has ${formatCount(lowCtr.impressions)} impressions, position ${formatPosition(lowCtr.position)}, and ${formatPercent(lowCtr.ctr)} CTR on ${lowCtr.pageLabel || "the supplied landing page"}.`,
      suggestedAction:
        "Draft a sharper title and meta description, an opening that answers the search, and two supporting sections.",
      draftBrief: {
        summary: `Refresh ${lowCtr.pageLabel || "the landing page"} around the proven query "${lowCtr.query}".`,
        sections: [
          `Direct answer for "${lowCtr.query}"`,
          "Examples or screenshots that back up the answer",
          "Next step and internal links to related pages"
        ],
        audience: "People who see the page in search but rarely click"
      },
      guardrail: "Treat the query data as a pointer only. Have a person review the draft before publishing.",
      acceptance:
        "Fresh Search Console data shows the click rate compared with before, or a note explains why this query was dropped."
    });
  }

  const pageTwo = audit.checks?.pageTwoRows?.[0] || audit.checks?.zeroClickRows?.[0];
  if (pageTwo) {
    add({
      id: "growth-keyword-free-tool-idea",
      sourceKind: "keyword",
      type: "free_tool_idea",
      title: "Draft a free-tool or checklist idea from near-traffic queries",
      pageUrl: pageTwo.pageUrl || "",
      pageLabel: pageTwo.pageLabel || "",
      proof: `"${pageTwo.query}" has ${formatCount(pageTwo.impressions)} impressions at position ${formatPosition(pageTwo.position)} with ${formatCount(pageTwo.clicks)} clicks.`,
      suggestedAction: "Draft a simple checklist, calculator, template or comparison that answers the search directly.",
      draftBrief: {
        summary: `Create a small useful asset for "${pageTwo.query}" and link it from the matched page.`,
        sections: [
          "Problem the searcher is trying to solve",
          "One interactive or downloadable asset",
          "How to use the result and where to go next"
        ],
        audience: "People who search for this and almost find your site"
      },
      guardrail: "Keep this as a brief for review. Don't auto-generate or mass-publish pages.",
      acceptance: "A reviewed brief exists, links to the data behind it, and the tool is tested before launch.",
      estimatedEffort: "1-3 hours"
    });
  }
}

function addCompetitorGapBrief(benchmark = {}, add) {
  if (benchmark.status !== "ready") return;
  const repair = benchmark.repairOpportunities?.[0];
  if (!repair) return;
  add({
    id: "growth-competitor-gap-outline",
    sourceKind: "competitor",
    type: "comparison_outline",
    title: "Draft a comparison outline from a competitor-backed gap",
    pageUrl: repair.pageUrl || "",
    pageLabel: repair.pageLabel || "",
    proof: repair.proof || "The homepage comparison found a gap against a competitor.",
    suggestedAction: "Draft a comparison section that shows how the fixed page now covers this topic.",
    draftBrief: {
      summary: `Turn the ${cleanLabel(repair.title)} gap into a reviewed comparison outline.`,
      sections: [
        "What the buyer is comparing",
        "What the page shows after the fix",
        "Where competitors do better on their homepage",
        "What the page should show next"
      ],
      audience: "Buyers comparing alternatives"
    },
    guardrail:
      "Use only what is public on the competitor's site, based on public observed proof. Make no claims about their private data.",
    acceptance: "The outline cites the comparison data and stays a draft until checked for accuracy."
  });
}

function addAiReadinessBrief(audit = {}, add) {
  if (audit.status !== "ready") return;
  const needsFaq =
    audit.repairOpportunities?.find((item) => /question-led|structured data|faq/i.test(`${item.title} ${item.fix}`)) ||
    audit.repairOpportunities?.[0];
  if (!needsFaq) return;
  add({
    id: "growth-ai-readiness-faq-brief",
    sourceKind: "ai_answer_readiness",
    type: "faq_block",
    title: "Draft a visible FAQ block from answer-readiness proof",
    pageUrl: needsFaq.pageUrl || "",
    pageLabel: needsFaq.pageLabel || "",
    proof: needsFaq.proof || "AI Answer Readiness found no question-and-answer sections.",
    suggestedAction:
      "Draft visible question-and-answer sections first. Add FAQ schema only after they are on the page.",
    draftBrief: {
      summary: "Add short, visible answers to the questions and doubts buyers raise most.",
      sections: [
        "What problem does this solve?",
        "Who is it for?",
        "What can you show to back it up?",
        "What is not included?"
      ],
      audience: "Buyers, search engines and AI tools looking for direct answers"
    },
    guardrail:
      "Schema may only repeat FAQ text that is on the page and approved. This does not mean AI tools will cite you.",
    acceptance: "Rerun the audit. The question-and-answer sections show on the page before you add schema.",
    estimatedEffort: "30-90 min"
  });
}

function addCrawlProofBrief(audit = {}, add) {
  if (audit.status !== "ready") return;
  const orphanRepair = audit.repairOpportunities?.find((item) =>
    /orphan|internal link|hub|sitemap/i.test(`${item.title} ${item.fix}`)
  );
  if (!orphanRepair) return;
  add({
    id: "growth-crawl-hub-brief",
    sourceKind: "crawl",
    type: "internal_link_hub",
    title: "Draft a hub section from crawl proof",
    pageUrl: orphanRepair.pageUrl || "",
    pageLabel: orphanRepair.pageLabel || "",
    proof: orphanRepair.proof,
    suggestedAction: "Draft a hub or resources section that links to important sitemap pages from related pages.",
    draftBrief: {
      summary:
        "Create a hub section, reviewed before publishing, that helps visitors and search engines find important pages.",
      sections: [
        "Important pages that are hard to find",
        "Why each page matters",
        "Suggested anchor text and source page"
      ],
      audience: "Visitors looking for related pages"
    },
    guardrail: "Only link to public URLs that load. Don't invent pages or link text.",
    acceptance: "Rerun the audit. The important pages now have internal links pointing to them.",
    estimatedEffort: "30-90 min"
  });
}

function cleanLabel(value = "") {
  return (
    String(value || "growth")
      .replace(/^Competitor gap:\s*/i, "")
      .trim() || "growth"
  );
}

function formatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-US") : "0";
}

function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${(number * 100).toFixed(number > 0 && number < 0.01 ? 1 : 0)}%`;
}

function formatPosition(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "unknown";
  return number.toFixed(number < 10 ? 1 : 0);
}

function slug(value = "") {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "opportunity"
  );
}
