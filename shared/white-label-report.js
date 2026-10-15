import { escapeHtml } from "./html.js";
import { competitorBenchmarkSummaryCopy } from "./competitor-benchmark.js";
import { crawlIntelligenceSummaryCopy } from "./crawl-intelligence.js";
import { aiAnswerReadinessSummaryCopy } from "./ai-answer-readiness.js";
import { growthOpportunitiesSummaryCopy } from "./growth-opportunities.js";
import { formatWaterfallBytes, resourceWaterfallSummaryCopy } from "./resource-waterfall.js";
import { renderedCrawlScaleSummaryCopy } from "./rendered-crawl-scale.js";
import { keywordRankAuditSummaryCopy } from "./keyword-rank-audit.js";
import { platformSeoSummaryCopy } from "./platform-seo-audit.js";
import { publicUrlStatus } from "./url-safety.js";

const DEFAULT_BRAND_COLOR = "#163f5f";
const DEFAULT_ACCENT_COLOR = "#0f9f6e";

export function defaultBranding() {
  return normalizeBrandingInput({
    agencyName: "SEO Fix Kit",
    logoUrl: "/brand/mark.svg",
    brandColor: DEFAULT_BRAND_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    footerText: "Prepared for your team."
  });
}

export function normalizeBrandingInput(input = {}, fallback = {}) {
  return {
    agencyName:
      cleanText(input.agencyName ?? input.agency_name ?? fallback.agencyName ?? fallback.agency_name ?? "", 120) ||
      "SEO Fix Kit",
    logoUrl: cleanPublicAssetUrl(input.logoUrl ?? input.logo_url ?? fallback.logoUrl ?? fallback.logo_url ?? ""),
    brandColor:
      cleanColor(input.brandColor ?? input.brand_color ?? fallback.brandColor ?? fallback.brand_color ?? "") ||
      DEFAULT_BRAND_COLOR,
    accentColor:
      cleanColor(input.accentColor ?? input.accent_color ?? fallback.accentColor ?? fallback.accent_color ?? "") ||
      DEFAULT_ACCENT_COLOR,
    customDomain: cleanDomain(
      input.customDomain ?? input.custom_domain ?? fallback.customDomain ?? fallback.custom_domain ?? ""
    ),
    footerText:
      cleanText(input.footerText ?? input.footer_text ?? fallback.footerText ?? fallback.footer_text ?? "", 180) ||
      "Prepared for your team."
  };
}

export function whiteLabelReportFilename({ report = {}, branding = {}, share = {} } = {}) {
  const brand = normalizeBrandingInput(branding);
  const host = safeHost(report.url || report.origin || "") || "seo-report";
  const client = cleanText(share.clientName || share.client_name || "", 80);
  const pieces = [client || host, brand.agencyName, "seo-audit-report"].filter(Boolean).map(slugPart).filter(Boolean);
  return `${pieces.join("-") || "seo-audit-report"}.pdf`;
}

export function buildWhiteLabelReportHtml({
  report = {},
  branding = {},
  share = {},
  origin = "",
  locked = false,
  error = "",
  includeDraftBriefs = false
} = {}) {
  const cleanBrand = normalizeBrandingInput(branding);
  const host = safeHost(report.url || report.origin || "");
  const renderedCrawlScale = report.renderedCrawlScale || report.rendered_crawl_scale || null;
  const title = locked
    ? `${cleanBrand.agencyName} client report`
    : `${cleanBrand.agencyName} SEO audit for ${host || "client site"}`;
  const clientName = cleanText(share.clientName || share.client_name || "", 120);
  const shareId = cleanText(share.id || "", 160);
  const reportUrl = shareId ? `${origin || ""}/r/${encodeURIComponent(shareId)}` : "";
  const pdfUrl = shareId ? `${origin || ""}/r/${encodeURIComponent(shareId)}.pdf` : "";

  if (locked) {
    return fullHtml({
      title,
      branding: cleanBrand,
      body: `
        <main class="shell locked-shell">
          ${brandHeader(cleanBrand)}
          <section class="cover locked-cover">
            <p class="eyebrow">Password-protected report</p>
            <h1>${escapeHtml(clientName || "This report")} is password protected.</h1>
            <p>Enter the password to see the audit results and fix list.</p>
            <form class="password-form" action="/r/${escapeHtml(encodeURIComponent(shareId))}/unlock" method="post">
              <label for="report-password">Password</label>
              <div>
                <input id="report-password" name="password" type="password" autocomplete="current-password" required />
                <button type="submit">Open report</button>
              </div>
              ${share.passwordHint ? `<p class="hint">Hint: ${escapeHtml(share.passwordHint)}</p>` : ""}
              ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
            </form>
          </section>
        </main>
      `
    });
  }

  const findings = (report.findings || []).filter((finding) => finding?.severity !== "good");
  const criticalCount = Number(report.summary?.critical || 0);
  const warningCount = Number(report.summary?.warnings || 0);
  const noticeCount = Number(report.summary?.notices || 0);
  const pagesScanned = Number(report.summary?.pagesScanned || report.pages?.length || 0);
  const maxPages = Number(report.summary?.maxPages || pagesScanned || 0);
  const topFindings = findings.slice(0, 12);
  const repairPlan = (report.repairPlan || []).slice(0, 10);
  const scannedAt = formatDate(report.scannedAt || report.createdAt || "");
  const performance = report.performance || null;
  const resourceWaterfall = report.resourceWaterfall || report.pages?.[0]?.resourceWaterfall || null;
  const crawlIntelligence = report.crawlIntelligence || report.crawl_intelligence || null;
  const keywordRankAudit = report.keywordRankAudit || report.keyword_rank_audit || null;
  const platformSeoAudit = report.platformSeoAudit || report.platform_seo_audit || null;
  const aiAnswerReadiness = report.aiAnswerReadiness || report.ai_answer_readiness || null;
  const growthOpportunities = includeDraftBriefs
    ? report.growthOpportunities || report.growth_opportunities || null
    : null;

  return fullHtml({
    title,
    branding: cleanBrand,
    body: `
      <main class="shell">
        ${brandHeader(cleanBrand)}
        <section class="cover">
          <div>
            <p class="eyebrow">Client SEO audit report</p>
            <h1>${escapeHtml(host || report.url || "Website audit")}</h1>
            ${clientName ? `<p class="client-line">Prepared for ${escapeHtml(clientName)}</p>` : ""}
            <p>Each problem below comes with what we found on the page, how to fix it, and how to confirm the fix on the next audit.</p>
          </div>
          <aside class="score-card">
            <span>SEO score</span>
            <strong>${escapeHtml(String(Number(report.score || 0)))}</strong>
            <small>/100</small>
          </aside>
        </section>

        <section class="meta-grid" aria-label="Audit summary">
          ${metric("Pages", `${pagesScanned}${maxPages ? `/${maxPages}` : ""}`)}
          ${metric("Critical", criticalCount)}
          ${metric("Warnings", warningCount)}
          ${metric("Notices", noticeCount)}
          ${metric("False alarms filtered", Number(report.summary?.guardedFalsePositives || 0))}
        </section>

        <section class="section">
          <div class="section-title">
            <p class="eyebrow">Executive summary</p>
            <h2>${topFindings.length ? "Problems to fix" : "No priority problems found"}</h2>
          </div>
          <p>${escapeHtml(summaryCopy({ report, findings, pagesScanned }))}</p>
          <div class="actions print-hidden">
            <button type="button" onclick="window.print()">Print or save PDF</button>
            ${reportUrl ? `<a href="${escapeHtml(reportUrl)}">Client link</a>` : ""}
            ${pdfUrl ? `<a href="${escapeHtml(pdfUrl)}">Download PDF</a>` : ""}
          </div>
        </section>

        ${performance ? performanceSection(performance) : ""}

        ${resourceWaterfallSection(resourceWaterfall)}

        ${crawlInventorySection(report.crawlInventory)}

        ${renderedCrawlScaleSection(renderedCrawlScale)}

        ${crawlIntelligenceSection(crawlIntelligence)}

        ${reportDeltaSection(report.reportDelta)}

        ${competitorBenchmarkSection(report.competitorBenchmark)}

        ${backlinkAuditSection(report.backlinkAudit)}

        ${localSeoAuditSection(report.localSeoAudit)}

        ${keywordRankAuditSection(keywordRankAudit)}

        ${platformSeoAuditSection(platformSeoAudit)}

        ${aiAnswerReadinessSection(aiAnswerReadiness)}

        ${growthOpportunitiesSection(growthOpportunities)}

        <section class="section">
          <div class="section-title">
            <p class="eyebrow">Action plan</p>
            <h2>Fix these in order</h2>
          </div>
          ${repairPlan.length ? `<ol class="repair-list">${repairPlan.map(repairItem).join("")}</ol>` : `<p class="muted">Nothing to fix from this audit.</p>`}
        </section>

        <section class="section page-break">
          <div class="section-title">
            <p class="eyebrow">Technical findings</p>
            <h2>What we found and how to confirm each fix</h2>
          </div>
          ${topFindings.length ? `<div class="finding-list">${topFindings.map(findingItem).join("")}</div>` : `<p class="muted">No critical problems or warnings found.</p>`}
        </section>

        <section class="section">
          <div class="section-title">
            <p class="eyebrow">Coverage</p>
            <h2>Pages checked</h2>
          </div>
          ${pagesTable(report.pageSummaries?.length ? report.pageSummaries : report.pages || [])}
        </section>

        <footer>
          <span>${escapeHtml(cleanBrand.footerText)}</span>
          ${scannedAt ? `<span>Scanned ${escapeHtml(scannedAt)}</span>` : ""}
        </footer>
      </main>
    `
  });
}

function fullHtml({ title, branding, body }) {
  const brand = normalizeBrandingInput(branding);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --brand: ${brand.brandColor};
        --accent: ${brand.accentColor};
        --ink: #18212b;
        --muted: #657282;
        --line: #dfe6ec;
        --paper: #ffffff;
        --soft: #f4f7f9;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: #eef3f7;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; }
      a { color: var(--brand); font-weight: 750; text-decoration: none; }
      button, input { font: inherit; }
      button {
        align-items: center;
        background: var(--brand);
        border: 0;
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font-weight: 800;
        justify-content: center;
        min-height: 44px;
        padding: 0 16px;
      }
      .shell {
        background: var(--paper);
        margin: 28px auto;
        max-width: 1040px;
        min-height: calc(100vh - 56px);
        padding: 38px;
      }
      .brand-header {
        align-items: center;
        border-bottom: 1px solid var(--line);
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding-bottom: 22px;
      }
      .brand-lockup { align-items: center; display: flex; gap: 12px; min-width: 0; }
      .brand-logo {
        align-items: center;
        background: var(--brand);
        border-radius: 8px;
        color: #fff;
        display: inline-flex;
        flex: 0 0 42px;
        font-weight: 900;
        height: 42px;
        justify-content: center;
        overflow: hidden;
        width: 42px;
      }
      .brand-logo img { height: 100%; object-fit: contain; width: 100%; }
      .brand-lockup strong { display: block; font-size: 20px; overflow-wrap: anywhere; }
      .brand-lockup span { color: var(--muted); display: block; font-size: 13px; margin-top: 2px; }
      .cover {
        align-items: stretch;
        display: grid;
        gap: 26px;
        grid-template-columns: minmax(0, 1fr) minmax(190px, 240px);
        padding: 52px 0 28px;
      }
      .cover h1 {
        font-size: clamp(38px, 6vw, 72px);
        letter-spacing: 0;
        line-height: .96;
        margin: 0 0 18px;
        overflow-wrap: anywhere;
      }
      .cover p { color: var(--muted); font-size: 18px; line-height: 1.6; margin: 0; max-width: 760px; }
      .client-line { color: var(--brand) !important; font-weight: 800; margin-bottom: 12px !important; }
      .eyebrow {
        color: var(--accent) !important;
        font-size: 12px !important;
        font-weight: 900;
        letter-spacing: .08em;
        margin: 0 0 12px !important;
        text-transform: uppercase;
      }
      .score-card {
        background: var(--brand);
        border-radius: 8px;
        color: #fff;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 190px;
        padding: 24px;
      }
      .score-card span, .score-card small { color: rgba(255,255,255,.78); font-weight: 800; }
      .score-card strong { font-size: 72px; line-height: .9; margin: 10px 0 2px; }
      .meta-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        margin: 18px 0 34px;
      }
      .metric {
        background: var(--soft);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
      }
      .metric strong { display: block; font-size: 26px; }
      .metric span { color: var(--muted); display: block; font-size: 13px; font-weight: 750; margin-top: 4px; }
      .section {
        border-top: 1px solid var(--line);
        padding: 34px 0;
      }
      .section-title { margin-bottom: 18px; }
      .section h2 { font-size: 28px; margin: 0; }
      .section p, .finding p, .repair-list p { color: var(--muted); font-size: 16px; line-height: 1.62; }
      .actions { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
      .actions a {
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 6px;
        display: inline-flex;
        min-height: 44px;
        padding: 0 14px;
      }
      .repair-list { display: grid; gap: 12px; margin: 0; padding-left: 22px; }
      .repair-list li, .finding {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 18px;
      }
      .repair-list strong, .finding strong { display: block; font-size: 17px; margin-bottom: 8px; }
      .repair-list span, .finding-meta { color: var(--muted); display: block; font-size: 13px; font-weight: 750; margin-bottom: 8px; }
      .finding-list { display: grid; gap: 12px; }
      .url-list { color: var(--muted); display: grid; gap: 8px; margin: 18px 0 0; overflow-wrap: anywhere; padding-left: 22px; }
      .finding h3 { font-size: 20px; margin: 0 0 8px; }
      .badge {
        background: color-mix(in srgb, var(--accent) 14%, white);
        border-radius: 999px;
        color: var(--brand);
        display: inline-flex;
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 10px;
        padding: 5px 9px;
        text-transform: uppercase;
      }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid var(--line); font-size: 14px; padding: 12px 10px; text-align: left; vertical-align: top; }
      th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
      td { overflow-wrap: anywhere; }
      .muted, .hint { color: var(--muted); }
      footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        font-size: 13px;
        gap: 12px;
        justify-content: space-between;
        padding-top: 20px;
      }
      .locked-shell { max-width: 760px; }
      .locked-cover { display: block; padding-bottom: 16px; }
      .password-form {
        background: var(--soft);
        border: 1px solid var(--line);
        border-radius: 8px;
        margin-top: 24px;
        padding: 18px;
      }
      .password-form label { display: block; font-weight: 850; margin-bottom: 8px; }
      .password-form div { display: flex; gap: 10px; }
      .password-form input {
        border: 1px solid var(--line);
        border-radius: 6px;
        flex: 1;
        min-height: 44px;
        min-width: 0;
        padding: 0 12px;
      }
      .error { color: #b3261e !important; font-weight: 800; }
      @media (max-width: 780px) {
        .shell { margin: 0; min-height: 100vh; padding: 24px 18px; }
        .brand-header, footer { align-items: flex-start; flex-direction: column; }
        .cover { grid-template-columns: 1fr; padding-top: 34px; }
        .score-card { min-height: 150px; }
        .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .password-form div { flex-direction: column; }
      }
      @media print {
        :root { background: #fff; }
        .shell { margin: 0; max-width: none; min-height: 0; padding: 0; }
        .print-hidden { display: none !important; }
        .page-break { break-before: page; }
        .section { break-inside: avoid; }
        a { color: inherit; }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function brandHeader(branding) {
  const logo = branding.logoUrl
    ? `<span class="brand-logo"><img src="${escapeHtml(branding.logoUrl)}" alt="" /></span>`
    : `<span class="brand-logo">${escapeHtml(initials(branding.agencyName))}</span>`;
  return `
    <header class="brand-header">
      <div class="brand-lockup">
        ${logo}
        <div>
          <strong>${escapeHtml(branding.agencyName)}</strong>
          ${branding.customDomain ? `<span>${escapeHtml(branding.customDomain)}</span>` : "<span>SEO audit report</span>"}
        </div>
      </div>
    </header>
  `;
}

function metric(label, value) {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function signed(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function summaryCopy({ report, findings, pagesScanned }) {
  const critical = Number(report.summary?.critical || 0);
  const warnings = Number(report.summary?.warnings || 0);
  if (!findings.length) {
    return `The audit reviewed ${pagesScanned || 1} page${pagesScanned === 1 ? "" : "s"} and found no priority technical SEO problems. Run it again after big changes to content, templates or platform.`;
  }
  return `The audit reviewed ${pagesScanned || 1} page${pagesScanned === 1 ? "" : "s"} and found ${critical} critical issue${critical === 1 ? "" : "s"} plus ${warnings} warning${warnings === 1 ? "" : "s"}. The fix list below puts the biggest problems first.`;
}

function crawlInventorySection(inventory = {}) {
  if (!["ready", "empty"].includes(inventory?.status)) return "";
  const summary = inventory.summary || {};
  const sampleUrls = (inventory.sampleUrls || []).slice(0, 8);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Crawl inventory</p>
        <h2>${summary.urlsDiscovered ? `${escapeHtml(String(summary.urlsDiscovered))} sitemap URLs discovered` : "No URLs found in the sitemap"}</h2>
      </div>
      <p>URLs listed in the sitemap, compared with the pages this audit loaded. Fixes cover only the pages loaded.</p>
      <div class="meta-grid">
        ${metric("Inventory URLs", summary.urlsDiscovered || 0)}
        ${metric("Pages loaded", `${summary.renderedPagesCovered || 0}/${summary.renderedPagesScanned || 0}`)}
        ${metric("Coverage", `${summary.coveragePercent || 0}%`)}
        ${metric("Sitemaps", summary.sitemapsFetched || 0)}
        ${metric("Inventory cap", summary.inventoryLimit || 50000)}
      </div>
      ${sampleUrls.length ? `<ul class="url-list">${sampleUrls.map((item) => `<li>${escapeHtml(item.url || "")}</li>`).join("")}</ul>` : `<p class="muted">Add a sitemap to compare its URLs with the pages this audit loaded.</p>`}
    </section>
  `;
}

function renderedCrawlScaleSection(plan = {}) {
  if (plan?.status !== "ready") return "";
  const summary = plan.summary || {};
  const repairs = plan.repairOpportunities || [];
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Rendered crawl scale</p>
        <h2>${escapeHtml(String(summary.plannedBatches || 0))} staged rendered ${summary.plannedBatches === 1 ? "batch" : "batches"}</h2>
      </div>
      <p>${escapeHtml(renderedCrawlScaleSummaryCopy(plan))}</p>
      <div class="mini-grid">
        <div><strong>${escapeHtml(String(summary.renderedPages || 0))}</strong><span>Rendered now</span></div>
        <div><strong>${escapeHtml(String(summary.requestedTargetPages || 0))}</strong><span>Target</span></div>
        <div><strong>${escapeHtml(String(summary.inventoryUrlsAvailable || 0))}</strong><span>Inventory</span></div>
        <div><strong>${escapeHtml(String(summary.renderedCoveragePercent || 0))}%</strong><span>Coverage</span></div>
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(renderedCrawlScaleRepairItem).join("")}</ol>` : `<p class="muted">No large-crawl actions needed.</p>`}
    </section>
  `;
}

function renderedCrawlScaleRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Rendered crawl scale action")}</strong>
      <p>${escapeHtml(item.proof || item.fix || "Finish the queued batches, then rerun.")}</p>
      <small>${escapeHtml(item.acceptance || "Every batch has results for each page before you report the full crawl as done.")}</small>
    </li>
  `;
}

function crawlIntelligenceSection(audit = {}) {
  if (audit?.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairs = (audit.repairOpportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Crawl intelligence</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} crawl repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found` : "No link structure problems found"}</h2>
      </div>
      <p>${escapeHtml(crawlIntelligenceSummaryCopy(audit))}</p>
      <div class="meta-grid">
        ${metric("Edges", summary.linkedEdges || 0)}
        ${metric("Max depth", summary.maxDepth || 0)}
        ${metric("Orphans", summary.orphanInventoryCandidates || 0)}
        ${metric("Duplicate pairs", summary.duplicateContentPairs || 0)}
        ${metric("Cannibalization", summary.cannibalizationGroups || 0)}
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(crawlIntelligenceRepairItem).join("")}</ol>` : `<p class="muted">No link structure problems found on the pages checked.</p>`}
    </section>
  `;
}

function crawlIntelligenceRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Crawl repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "technical")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this, then rerun the audit.")}</p>
    </li>
  `;
}

function reportDeltaSection(delta = {}) {
  if (!["ready", "first_run"].includes(delta?.status)) return "";
  const summary = delta.summary || {};
  if (delta.status === "first_run") {
    return `
      <section class="section">
        <div class="section-title">
          <p class="eyebrow">Audit history</p>
          <h2>First audit saved for this site</h2>
        </div>
        <p>Rerun the audit to see what got fixed, what's still open and what's new.</p>
      </section>
    `;
  }
  const fixedIssues = (delta.fixedIssues || []).slice(0, 5);
  const newIssues = (delta.newIssues || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Audit history</p>
        <h2>${summary.scoreDelta > 0 ? `Score improved by ${escapeHtml(String(summary.scoreDelta))} points` : summary.scoreDelta < 0 ? `Score dropped by ${escapeHtml(String(Math.abs(summary.scoreDelta)))} points` : "Score unchanged since the last audit"}</h2>
      </div>
      <p>Compared with the last saved audit of this site.</p>
      <div class="meta-grid">
        ${metric("Score change", signed(summary.scoreDelta || 0))}
        ${metric("Issue change", signed(summary.issuesDelta || 0))}
        ${metric("Fixed", summary.fixedIssuesCount || 0)}
        ${metric("New", summary.newIssuesCount || 0)}
        ${metric("Still open", summary.persistentIssuesCount || 0)}
      </div>
      ${fixedIssues.length ? `<h3>Fixed since last audit</h3><ul class="url-list">${fixedIssues.map((issue) => `<li>${escapeHtml(issue.title || "Issue")}${issue.pageLabel ? ` - ${escapeHtml(issue.pageLabel)}` : ""}</li>`).join("")}</ul>` : ""}
      ${newIssues.length ? `<h3>New since last audit</h3><ul class="url-list">${newIssues.map((issue) => `<li>${escapeHtml(issue.title || "Issue")}${issue.pageLabel ? ` - ${escapeHtml(issue.pageLabel)}` : ""}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}

function performanceSection(performance) {
  const metrics = performance.labMetrics || {};
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Performance</p>
        <h2>${performance.status === "success" ? "Core Web Vitals" : "Page load"}</h2>
      </div>
      <div class="meta-grid">
        ${metric("Mobile score", performance.performanceScore ? `${performance.performanceScore}/100` : "Local")}
        ${metric("LCP", metricValue(metrics.largestContentfulPaint))}
        ${metric("TBT", metricValue(metrics.totalBlockingTime))}
        ${metric("CLS", metricValue(metrics.cumulativeLayoutShift))}
        ${metric("Speed Index", metricValue(metrics.speedIndex))}
      </div>
    </section>
  `;
}

function resourceWaterfallSection(waterfall = {}) {
  if (!["ready", "empty"].includes(waterfall?.status)) return "";
  const summary = waterfall.summary || {};
  const repairs = (waterfall.repairOpportunities || []).slice(0, 4);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Resource waterfall</p>
        <h2>${waterfall.status === "ready" ? "Files the page loads" : "No file timing for this page"}</h2>
      </div>
      <p>${escapeHtml(resourceWaterfallSummaryCopy(waterfall))}</p>
      ${
        waterfall.status === "ready"
          ? `
        <div class="meta-grid">
          ${metric("Requests", summary.totalRequests || 0)}
          ${metric("Transfer", formatWaterfallBytes(summary.totalTransferBytes || 0))}
          ${metric("JavaScript", formatWaterfallBytes(summary.scriptBytes || 0))}
          ${metric("Images", formatWaterfallBytes(summary.imageBytes || 0))}
          ${metric("Blocking", summary.renderBlockingCandidates || 0)}
        </div>
        ${repairs.length ? `<ol class="repair-list">${repairs.map(waterfallRepairItem).join("")}</ol>` : `<p class="muted">No slow or heavy files to fix.</p>`}
      `
          : ""
      }
    </section>
  `;
}

function waterfallRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Resource repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "performance")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this file, then rerun the audit.")}</p>
    </li>
  `;
}

function competitorBenchmarkSection(benchmark = {}) {
  if (benchmark?.status !== "ready" || !benchmark.competitors?.length) return "";
  const repairs = (benchmark.repairOpportunities || []).slice(0, 5);
  const summary = benchmark.summary || {};
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Competitor benchmark</p>
        <h2>${summary.scoreGapToBest > 0 ? `${escapeHtml(summary.bestCompetitorHost)} is ${escapeHtml(String(summary.scoreGapToBest))} points ahead` : "Your score matches or beats every competitor checked"}</h2>
      </div>
      <p>${escapeHtml(competitorBenchmarkSummaryCopy(benchmark))}</p>
      <div class="meta-grid">
        ${metric("Your rank", `${summary.targetRank || 1}/${summary.totalSitesRanked || benchmark.competitors.length + 1}`)}
        ${metric("Your score", benchmark.target?.score || 0)}
        ${metric("Best rival", summary.bestCompetitorScore || 0)}
        ${metric("Avg rival", summary.competitorAverageScore || 0)}
        ${metric("Gap repairs", repairs.length)}
      </div>
      ${repairs.length ? `<ol class="repair-list benchmark-list">${repairs.map(benchmarkRepairItem).join("")}</ol>` : `<p class="muted">No gaps found against the competitors checked.</p>`}
      <p class="muted">Based on each competitor's public homepage only. Not backlink, keyword volume, traffic or rank data.</p>
    </section>
  `;
}

function benchmarkRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Competitor gap")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "15-30 min")} | ${escapeHtml(item.workType || "review")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Close this gap, then rerun the audit.")}</p>
    </li>
  `;
}

function backlinkAuditSection(audit = {}) {
  if (audit?.status !== "ready" || !audit.rows?.length) return "";
  const summary = audit.summary || {};
  const repairs = (audit.repairOpportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Backlink audit</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} link repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found` : "No problems in your imported backlinks"}</h2>
      </div>
      <p>Checks the backlinks you imported by loading each linking page. This is not a backlink database.</p>
      <div class="meta-grid">
        ${metric("Imported", summary.imported || audit.rows.length)}
        ${metric("Live", summary.live || 0)}
        ${metric("Lost", summary.lost || 0)}
        ${metric("Risky", summary.toxicRisk || 0)}
        ${metric("Broken", summary.brokenTargets || 0)}
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(backlinkRepairItem).join("")}</ol>` : `<p class="muted">No problems found in the imported backlinks.</p>`}
    </section>
  `;
}

function backlinkRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Backlink repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "review")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this link, then rerun the audit.")}</p>
    </li>
  `;
}

function localSeoAuditSection(audit = {}) {
  if (audit?.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairs = (audit.repairOpportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Local SEO audit</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} local repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found` : "No local SEO problems found"}</h2>
      </div>
      <p>Checks your business name, address and phone, listings, schema, profile links and local keywords.</p>
      <div class="meta-grid">
        ${metric("NAP found", `${summary.napFieldsFoundOnSite || 0}/${summary.napFieldsSupplied || 0}`)}
        ${metric("Schema", summary.localSchemaFound ? "Yes" : "No")}
        ${metric("GBP link", summary.googleBusinessProfileLinked ? "Yes" : "No")}
        ${metric("Citations", `${summary.citationRowsPassed || 0}/${summary.citationRowsChecked || 0}`)}
        ${metric("Keywords", `${summary.localKeywordsCovered || 0}/${summary.localKeywordsChecked || 0}`)}
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(localSeoRepairItem).join("")}</ol>` : `<p class="muted">No local SEO problems found in the details you entered.</p>`}
    </section>
  `;
}

function keywordRankAuditSection(audit = {}) {
  if (audit?.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Keyword audit</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} keyword repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found` : "No problems in your imported keywords"}</h2>
      </div>
      <p>${escapeHtml(keywordRankAuditSummaryCopy(audit))}</p>
      <div class="mini-grid">
        <div><strong>${escapeHtml(String(summary.imported || 0))}</strong><span>Rows</span></div>
        <div><strong>${escapeHtml(String(summary.queries || 0))}</strong><span>Queries</span></div>
        <div><strong>${escapeHtml(String(summary.pageTwoOpportunities || 0))}</strong><span>Page-two</span></div>
        <div><strong>${escapeHtml(String(summary.lowCtrOpportunities || 0))}</strong><span>Low CTR</span></div>
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(keywordRankRepairItem).join("")}</ol>` : `<p class="muted">No problems found in the imported keywords.</p>`}
    </section>
  `;
}

function keywordRankRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Keyword repair")}</strong>
      <p>${escapeHtml(item.proof || item.fix || "Fix this page, then import fresh Search Console data and rerun.")}</p>
      <small>${escapeHtml(item.acceptance || "Fresh Search Console data shows the problem improved.")}</small>
    </li>
  `;
}

function platformSeoAuditSection(audit = {}) {
  if (audit?.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairs = (audit.repairOpportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Platform SEO audit</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} platform repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found` : "No platform-specific problems found"}</h2>
      </div>
      <p>${escapeHtml(platformSeoSummaryCopy(audit))}</p>
      <div class="meta-grid">
        ${metric("Platforms", summary.detectedPlatforms || 0)}
        ${metric("Products", summary.productLikePages || 0)}
        ${metric("Product schema", `${summary.productSchemaCoveragePercent || 0}%`)}
        ${metric("Faceted links", summary.facetedLinks || 0)}
        ${metric("WP plugins", summary.wordpressPlugins || 0)}
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(platformSeoRepairItem).join("")}</ol>` : `<p class="muted">No platform-specific problems found.</p>`}
    </section>
  `;
}

function platformSeoRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Platform SEO repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "technical")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this, then rerun the audit.")}</p>
    </li>
  `;
}

function aiAnswerReadinessSection(audit = {}) {
  if (audit?.status !== "ready") return "";
  const summary = audit.summary || {};
  const repairs = (audit.repairOpportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">AI Answer Readiness</p>
        <h2>${summary.repairOpportunityCount ? `${escapeHtml(String(summary.repairOpportunityCount))} readiness ${summary.repairOpportunityCount === 1 ? "repair" : "repairs"} found` : "No readiness problems found"}</h2>
      </div>
      <p>${escapeHtml(aiAnswerReadinessSummaryCopy(audit))}</p>
      <div class="meta-grid">
        ${metric("Readiness", `${summary.readinessScore || 0}/100`)}
        ${metric("Enough text", `${summary.pagesWithEnoughText || 0}/${summary.pagesChecked || 0}`)}
        ${metric("Schema pages", summary.pagesWithHelpfulSchema || 0)}
        ${metric("Question structure", summary.pagesWithQuestionStructure || 0)}
        ${metric("llms.txt", summary.llmsTxtStatus === "reachable" ? "Yes" : "No")}
        ${metric("Order", summary.trafficRanked ? "By traffic" : "As found")}
      </div>
      ${repairs.length ? `<ol class="repair-list">${repairs.map(aiAnswerReadinessRepairItem).join("")}</ol>` : `<p class="muted">No AI Answer Readiness problems found.</p>`}
      <p class="muted">This section checks your own pages only. It does not sample answer engines or monitor AI citations.</p>
    </section>
  `;
}

function aiAnswerReadinessRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "AI Answer Readiness repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "content")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this, then rerun the audit.")}</p>
    </li>
  `;
}

function growthOpportunitiesSection(growth = {}) {
  if (growth?.status !== "ready" || !growth.opportunities?.length) return "";
  const summary = growth.summary || {};
  const opportunities = (growth.opportunities || []).slice(0, 5);
  return `
    <section class="section">
      <div class="section-title">
        <p class="eyebrow">Draft-only growth</p>
        <h2>${escapeHtml(String(summary.opportunityCount || opportunities.length))} proof-backed ${summary.opportunityCount === 1 ? "brief" : "briefs"}</h2>
      </div>
      <p>${escapeHtml(growthOpportunitiesSummaryCopy(growth))}</p>
      <div class="meta-grid">
        ${metric("Keyword", summary.keywordBacked || 0)}
        ${metric("Competitor", summary.competitorBacked || 0)}
        ${metric("AI-ready", summary.aiReadinessBacked || 0)}
        ${metric("Crawl", summary.crawlBacked || 0)}
        ${metric("Mode", "Draft")}
      </div>
      <ol class="repair-list">${opportunities.map(growthOpportunityItem).join("")}</ol>
      <p class="muted">These are content briefs for you to review. They do not publish content or open pull requests, and they do not guarantee rankings, traffic, citations or revenue.</p>
    </section>
  `;
}

function growthOpportunityItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Growth brief")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.type || "draft")}</span>
      <p>${escapeHtml(item.proof || "The data behind this brief is attached.")}</p>
      <p>${escapeHtml(item.draftBrief?.summary || item.suggestedAction || "Write a content brief from this data and review it before publishing.")}</p>
    </li>
  `;
}

function localSeoRepairItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.title || "Local SEO repair")}</strong>
      <span>${escapeHtml(item.estimatedEffort || "30-90 min")} | ${escapeHtml(item.workType || "review")}</span>
      <p>${escapeHtml(item.proof || item.fix || "Fix this, then rerun the audit.")}</p>
    </li>
  `;
}

function repairItem(fix) {
  return `
    <li>
      <strong>${escapeHtml(fix.title || "Repair")}</strong>
      <span>${escapeHtml(fix.estimatedEffort || "15-30 min")} | ${escapeHtml(fix.workType || "review")}</span>
      <p>${escapeHtml(fix.fix || fix.detail || "Make the smallest template or content change that fixes this.")}</p>
    </li>
  `;
}

function findingItem(finding) {
  const proof = finding.proof || finding.evidence || finding.snippet || "";
  const page = finding.page || finding.url || finding.pageUrl || finding.pageLabel || "";
  const acceptanceCheck = finding.acceptanceCheck || finding.acceptance || defaultFindingAcceptanceCheck(finding);
  return `
    <article class="finding">
      <span class="badge">${escapeHtml(finding.severity || "issue")}</span>
      <h3>${escapeHtml(finding.title || "SEO issue")}</h3>
      <span class="finding-meta">${escapeHtml(page)}</span>
      ${proof ? `<p><strong>Proof</strong>${escapeHtml(proof)}</p>` : ""}
      ${finding.fix ? `<p><strong>Fix</strong>${escapeHtml(finding.fix)}</p>` : ""}
      ${acceptanceCheck ? `<p><strong>How to confirm</strong>${escapeHtml(acceptanceCheck)}</p>` : ""}
    </article>
  `;
}

function defaultFindingAcceptanceCheck(finding = {}) {
  const title = String(finding.title || "").toLowerCase();
  if (title.includes("title"))
    return "The page has its own title that names its topic and isn't cut off in search results.";
  if (title.includes("description")) return "The page has one meta description of about 70 to 165 characters.";
  if (title.includes("h1")) return "The page shows one H1 that names its main topic.";
  if (title.includes("internal links")) return "The loaded page has normal <a href> links to your important pages.";
  if (title.includes("broken") && title.includes("link"))
    return "Every link listed here now loads, or you removed it on purpose.";
  if (title.includes("canonical")) return "The page has one canonical tag with its preferred URL.";
  if (title.includes("sitemap")) return "/sitemap.xml loads and lists the pages you want in search.";
  if (title.includes("robots") || title.includes("noindex"))
    return "The robots tag lets search engines index the pages you want in search, and only those.";
  return "Rerun the audit. This problem no longer appears.";
}

function pagesTable(pages) {
  if (!pages.length) return `<p class="muted">This report has no per-page results.</p>`;
  return `
    <table>
      <thead>
        <tr><th>Page</th><th>Score</th><th>Problems</th><th>Title</th><th>H1</th></tr>
      </thead>
      <tbody>
        ${pages
          .slice(0, 30)
          .map(
            (page) => `
          <tr>
            <td>${escapeHtml(page.url || "")}</td>
            <td>${escapeHtml(String(page.score ?? ""))}</td>
            <td>${escapeHtml(String(pageProblemCount(page)))}</td>
            <td>${escapeHtml(page.rendered?.title || page.title || "")}</td>
            <td>${escapeHtml(pageH1Text(page))}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function pageProblemCount(page = {}) {
  if (page.critical === undefined && page.warnings === undefined) return "";
  return Number(page.critical || 0) + Number(page.warnings || 0) + Number(page.notices || 0);
}

function pageH1Text(page = {}) {
  const value = page.rendered?.h1s || page.rendered?.h1 || page.h1s || page.h1 || "";
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function metricValue(metric) {
  if (!metric) return "n/a";
  return metric.displayValue || metric.category || String(metric.value ?? "n/a");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function initials(name) {
  const words = String(name || "SEO")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "S"
  );
}

function slugPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : "";
}

function cleanDomain(value) {
  const text = cleanText(value, 120)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!text) return "";
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(text) ? text.toLowerCase() : "";
}

function cleanPublicAssetUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    const status = publicUrlStatus(url.toString());
    return status.ok ? status.url : "";
  } catch {
    return "";
  }
}

function safeHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanText(input, maxLength = 500) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
