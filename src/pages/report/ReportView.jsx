import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { reportFixPrompt } from "../../../shared/ai-fix-prompt.js";
import { DEFAULT_CRAWL_PAGES } from "../../../shared/crawl-depth.js";
import { CopyButton } from "../../components/CopyButton.jsx";
import { Metric } from "../../components/Metric.jsx";
import { findingAnchor, formatCount } from "../../lib/format.js";
import { summarizePages } from "../../lib/page-scoring.js";
import { fetchBrief } from "../../lib/requests.js";
import { AiAnswerReadinessPanel, GrowthOpportunitiesPanel, GeoReadinessPanel } from "./AiReadinessPanels.jsx";
import { ClientReportPanel } from "./ClientReportPanel.jsx";
import { CrawlInventoryPanel, RenderedCrawlScalePanel, CrawlIntelligencePanel } from "./CrawlPanels.jsx";
import { FindingItem, FixItem, PageProof, PageSummaryTable } from "./FindingItems.jsx";
import { ReportDeltaPanel, RemediationBriefPanel } from "./HistoryPanels.jsx";
import {
  CompetitorBenchmarkPanel,
  BacklinkAuditPanel,
  LocalSeoAuditPanel,
  KeywordRankAuditPanel,
  PlatformSeoAuditPanel
} from "./ImportedDataPanels.jsx";
import { PerformancePanel, ResourceWaterfallPanel } from "./PerformancePanels.jsx";
import { FixRequestStatusPanel, RepairProposalPanel, FixQuotePanel } from "./RepairOfferPanels.jsx";
import { ScoreBadgePanel } from "./ScoreBadgePanel.jsx";
import { ScoreGain } from "./ScoreGain.jsx";
import { TeamRepairBoard } from "./TeamRepairBoard.jsx";

export function ReportView({ report, onRerun, rerunStatus = "idle", rerunMessage = "" }) {
  const issues = useMemo(() => (report.findings || []).filter((finding) => finding.severity !== "good"), [report]);
  const guarded = useMemo(() => (report.findings || []).filter((finding) => finding.severity === "good"), [report]);
  const topFixes = report.repairPlan || [];
  const [severityFilter, setSeverityFilter] = useState("all");
  const severityFilters = SEVERITY_FILTERS.map((filter) => ({
    ...filter,
    count: filter.key === "all" ? issues.length : issues.filter((issue) => issue.severity === filter.key).length
  }));
  const showSeverityFilter = severityFilters.filter((filter) => filter.key !== "all" && filter.count).length > 1;
  const visibleIssues = severityFilter === "all" ? issues : issues.filter((issue) => issue.severity === severityFilter);
  const competitorBenchmark = report.competitorBenchmark || null;
  const crawlInventory = report.crawlInventory || report.crawl_inventory || null;
  const renderedCrawlScale = report.renderedCrawlScale || report.rendered_crawl_scale || null;
  const crawlIntelligence = report.crawlIntelligence || report.crawl_intelligence || null;
  const reportDelta = report.reportDelta || report.report_delta || null;
  const resourceWaterfall =
    report.resourceWaterfall || report.resource_waterfall || report.pages?.[0]?.resourceWaterfall || null;
  const backlinkAudit = report.backlinkAudit || null;
  const localSeoAudit = report.localSeoAudit || null;
  const keywordRankAudit = report.keywordRankAudit || report.keyword_rank_audit || null;
  const platformSeoAudit = report.platformSeoAudit || report.platform_seo_audit || null;
  const aiAnswerReadiness = report.aiAnswerReadiness || report.ai_answer_readiness || null;
  const growthOpportunities = report.growthOpportunities || report.growth_opportunities || null;
  const geoReadiness = report.geoReadiness || report.geo_readiness || null;
  const remediationBrief = report.remediationBrief || report.remediation_brief || null;
  const pageSummaries = report.pageSummaries || summarizePages(report.pages || [], report.findings || [], report.url);
  const shareUrl = report.reportUrl || `${window.location.origin}${report.reportPath || window.location.pathname}`;
  const SEVERITY_ORDER = { critical: 0, warning: 1, notice: 2 };
  const topThree = topFixes.length
    ? topFixes.slice(0, 3)
    : [...issues]
        .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
        .slice(0, 3)
        .map((finding) => ({ title: finding.title, workType: finding.severity, estimatedEffort: finding.pageLabel }));
  const scannedAt = report.scannedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(report.scannedAt))
    : "just now";
  const expiresAt = report.retention?.expiresAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(report.retention.expiresAt))
    : "";
  const hasPriorityFixes = topFixes.length > 0;
  const tabsRef = useRef(null);
  const insightPanels = [
    ["ready", "first_run"].includes(reportDelta?.status) && <ReportDeltaPanel key="delta" delta={reportDelta} />,
    competitorBenchmark?.status === "ready" && (
      <CompetitorBenchmarkPanel key="benchmark" benchmark={competitorBenchmark} />
    ),
    aiAnswerReadiness?.status === "ready" && <AiAnswerReadinessPanel key="ai" audit={aiAnswerReadiness} />,
    growthOpportunities?.status === "ready" && <GrowthOpportunitiesPanel key="growth" growth={growthOpportunities} />,
    geoReadiness?.status === "ready" && <GeoReadinessPanel key="geo" audit={geoReadiness} />,
    backlinkAudit?.status === "ready" && <BacklinkAuditPanel key="backlinks" audit={backlinkAudit} />,
    localSeoAudit?.status === "ready" && <LocalSeoAuditPanel key="local" audit={localSeoAudit} />,
    keywordRankAudit?.status === "ready" && <KeywordRankAuditPanel key="keywords" audit={keywordRankAudit} />,
    platformSeoAudit?.status === "ready" && <PlatformSeoAuditPanel key="platform" audit={platformSeoAudit} />
  ].filter(Boolean);
  const tabs = [
    { key: "problems", label: "Problems", count: issues.length },
    { key: "repair", label: "Repair board" },
    { key: "pages", label: "Pages", count: pageSummaries.length },
    ...(insightPanels.length ? [{ key: "insights", label: "Insights" }] : []),
    { key: "share", label: "Share" }
  ];
  const checkoutParam = new URLSearchParams(window.location.search).get("checkout");
  const checkoutReturned = checkoutParam === "return" || checkoutParam === "repair-sprint-return";

  const pagesScanned = report.summary?.pagesScanned || 0;
  const maxPages = report.summary?.maxPages || DEFAULT_CRAWL_PAGES;
  const score = Number(report.score);
  const scoreTone = score >= 90 ? "good" : score >= 70 ? "ok" : "bad";

  return (
    <div className="report-layout">
      <header className="report-header">
        <div className="report-header-main">
          <h1>{new URL(report.url).hostname}</h1>
          <a className="report-header-url" href={report.url} target="_blank" rel="noreferrer">
            {report.url}
          </a>
          <p className="report-header-meta">
            <span>Audited {scannedAt}</span>
            <span>
              {formatCount(pagesScanned)} of {formatCount(maxPages)} pages
              {report.summary?.crawlLimitHit ? " (page limit reached)" : ""}
            </span>
            {expiresAt && <span>Kept until {expiresAt}</span>}
            {report.storageNote && <span>{report.storageNote}</span>}
          </p>
          <div className="report-header-actions">
            {onRerun && (
              <button className="app-button" disabled={rerunStatus === "loading"} onClick={onRerun} type="button">
                {rerunStatus === "loading" ? "Checking…" : "Check again"}
              </button>
            )}
            <CopyButton className="app-button-secondary" label="Copy link" value={shareUrl} />
            <a className="app-button-secondary" href={`/api/reports/${report.id}/client.pdf`}>
              Download PDF
            </a>
            <a
              className="app-button-secondary"
              href={`/api/reports/${report.id}/brief.md`}
              onClick={(event) => {
                event.preventDefault();
                fetchBrief(report.id);
              }}
            >
              Download brief
            </a>
          </div>
          {onRerun && rerunMessage && (
            <p className={`report-rerun-status ${rerunStatus}`} role="status">
              {rerunMessage}
            </p>
          )}
        </div>
        <div
          className={`score-ring ${scoreTone}`}
          style={{ "--score": report.score }}
          role="img"
          aria-label={`SEO score ${report.score} out of 100`}
        >
          <strong>{report.score}</strong>
          <span>/100</span>
        </div>
      </header>

      {reportDelta?.status === "ready" && (
        <ChangeSinceLastCheck
          delta={reportDelta}
          score={Number(report.score)}
          onDetails={() => tabsRef.current?.("insights")}
          onShare={() => tabsRef.current?.("share")}
        />
      )}

      {(checkoutReturned || report.fixRequest) && (
        <FixRequestStatusPanel fixRequest={report.fixRequest} checkoutReturned={checkoutReturned} />
      )}

      <section className="app-stats report-stats" aria-label="Audit summary">
        <Metric label="Critical" tone="critical" value={report.summary?.critical || 0} />
        <Metric label="Warnings" tone="warning" value={report.summary?.warnings || 0} />
        <Metric label="Notices" tone="notice" value={report.summary?.notices || 0} />
        <Metric label="False alarms filtered" tone="good" value={report.summary?.guardedFalsePositives || 0} />
      </section>

      <ReportTabs selectRef={tabsRef} tabs={tabs}>
        {(active) => (
          <>
            <div className="report-tab-panel" hidden={active !== "problems"} {...tabPanelProps("problems")}>
              <section className="app-card verdict-card" aria-labelledby="verdict-title">
                <div className="app-card-head">
                  <h2 id="verdict-title">{topThree.length ? "Fix these first" : "No problems found"}</h2>
                </div>
                {topThree.length ? (
                  <ol className="verdict-list">
                    {topThree.map((fix) => {
                      const finding = issues.find((issue) => issue.title === fix.title);
                      const anchor = finding ? findingAnchor(finding) : "";
                      return (
                        <li key={`${fix.priority || "ok"}-${fix.title}`}>
                          {anchor ? (
                            <a
                              href={`#${anchor}`}
                              onClick={() => {
                                flushSync(() => setSeverityFilter("all"));
                                openFinding(anchor);
                              }}
                            >
                              {fix.title}
                            </a>
                          ) : (
                            <strong>{fix.title}</strong>
                          )}
                          <span>
                            {[fix.estimatedEffort, fix.workType].filter(Boolean).join(" · ")}
                            {fix.scoreGain > 0 && <ScoreGain fix={fix} />}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="app-card-text">Nothing to fix. Rerun after you change content or templates.</p>
                )}
                {report.projectedScore?.to > report.projectedScore?.from && (
                  <p className="verdict-projection">
                    Fix these and your score could rise by about{" "}
                    <strong>{report.projectedScore.to - report.projectedScore.from} points</strong>.
                  </p>
                )}
                {topThree.length > 0 && (
                  <div className="verdict-actions">
                    <CopyButton
                      className="app-button"
                      label="Copy AI prompt for the top fixes"
                      value={reportFixPrompt(report)}
                    />
                    <small>One prompt with the top 5 fixes, ready for ChatGPT, Claude, Cursor or Lovable.</small>
                  </div>
                )}
                <p className="app-footnote">
                  We load each page in Chromium and compare it with the raw HTML. Problems that go away once the page
                  loads are filtered out as false alarms.
                </p>
              </section>

              <section className="findings-section" aria-labelledby="findings-title">
                <div className="section-heading">
                  <h2 id="findings-title">{issues.length ? `All problems (${issues.length})` : "No problems found"}</h2>
                  {showSeverityFilter && (
                    <div className="severity-filter" role="group" aria-label="Filter problems by severity">
                      {severityFilters
                        .filter((filter) => filter.key === "all" || filter.count)
                        .map((filter) => (
                          <button
                            aria-pressed={severityFilter === filter.key}
                            data-tone={filter.key}
                            key={filter.key}
                            onClick={() => setSeverityFilter(filter.key)}
                            type="button"
                          >
                            {filter.label}
                            <span className="severity-filter-count">{filter.count}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div className="finding-list">
                  {visibleIssues.map((finding, index) => (
                    <FindingItem
                      collapsible
                      defaultOpen={index === 0}
                      key={finding.id}
                      finding={finding}
                      plan={topFixes.find((fix) => fix.title === finding.title)}
                      report={report}
                    />
                  ))}
                  {!issues.length && (
                    <p className="quiet-note">No critical problems or warnings on the pages checked.</p>
                  )}
                </div>
              </section>

              <section className="fix-section" id="fix-pack" aria-label="Fix Pack">
                <FixQuotePanel report={report} hasPriorityFixes={hasPriorityFixes} />
              </section>
            </div>

            <div className="report-tab-panel" hidden={active !== "repair"} {...tabPanelProps("repair")}>
              {(report.repairProposals || []).length > 0 && (
                <RepairProposalPanel
                  initialProposals={report.repairProposals || []}
                  repairSprint={report.repairSprint || null}
                  reportId={report.id}
                />
              )}
              <TeamRepairBoard report={report} />
              {remediationBrief && <RemediationBriefPanel brief={remediationBrief} reportId={report.id} />}
              <section className="fix-section" aria-labelledby="fix-snippets-title">
                <div className="section-heading report-section-head">
                  <h2 id="fix-snippets-title">Fixes to copy</h2>
                  {report.repairBrief && (
                    <CopyButton
                      className="app-button-secondary"
                      label="Copy developer brief"
                      value={report.repairBrief}
                    />
                  )}
                </div>
                <div className="fix-list">
                  {topFixes.slice(0, 8).map((fix) => (
                    <FixItem key={`${fix.priority}-${fix.title}`} fix={fix} />
                  ))}
                  {!topFixes.length && <p className="quiet-note">No snippets to copy for this report.</p>}
                </div>
              </section>
            </div>

            <div className="report-tab-panel" hidden={active !== "pages"} {...tabPanelProps("pages")}>
              <section className="page-table-section" aria-labelledby="pages-title">
                <div className="section-heading">
                  <h2 id="pages-title">Every page we checked</h2>
                </div>
                <PageSummaryTable pages={pageSummaries} />
              </section>
              {["ready", "empty"].includes(crawlInventory?.status) && (
                <CrawlInventoryPanel inventory={crawlInventory} />
              )}
              {renderedCrawlScale?.status === "ready" && <RenderedCrawlScalePanel plan={renderedCrawlScale} />}
              {crawlIntelligence?.status === "ready" && <CrawlIntelligencePanel audit={crawlIntelligence} />}
              {report.performance && <PerformancePanel performance={report.performance} />}
              {["ready", "empty"].includes(resourceWaterfall?.status) && (
                <ResourceWaterfallPanel waterfall={resourceWaterfall} />
              )}
              <section className="guard-section" aria-labelledby="guards-title">
                <div className="section-heading">
                  <h2 id="guards-title">False alarms filtered out</h2>
                  <p>These show up in the raw HTML but are fine once the page loads in a browser.</p>
                </div>
                {guarded.length ? (
                  <div className="guard-list">
                    {guarded.slice(0, 6).map((finding) => (
                      <FindingItem key={finding.id} finding={finding} compact />
                    ))}
                  </div>
                ) : (
                  <p className="quiet-note">None on the pages checked.</p>
                )}
              </section>
              {(report.pages || []).length > 0 && (
                <section className="proof-grid" aria-label="Page evidence">
                  {(report.pages || []).map((page) => (
                    <PageProof key={page.url} page={page} />
                  ))}
                </section>
              )}
            </div>

            {insightPanels.length > 0 && (
              <div className="report-tab-panel" hidden={active !== "insights"} {...tabPanelProps("insights")}>
                {insightPanels}
              </div>
            )}

            <div className="report-tab-panel" hidden={active !== "share"} {...tabPanelProps("share")}>
              <ScoreBadgePanel report={report} />
              <ClientReportPanel report={report} />
            </div>
          </>
        )}
      </ReportTabs>
    </div>
  );
}

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warnings" },
  { key: "notice", label: "Notices" }
];

function openFinding(anchor) {
  const row = document.getElementById(anchor);
  if (row && "open" in row) row.open = true;
}

function tabPanelProps(key) {
  return { id: `report-panel-${key}`, role: "tabpanel", "aria-labelledby": `report-tab-${key}` };
}

function ChangeSinceLastCheck({ delta, score, onDetails, onShare }) {
  const summary = delta.summary || {};
  const scoreDelta = Number(summary.scoreDelta || 0);
  const fixed = Number(summary.fixedIssuesCount || 0);
  const added = Number(summary.newIssuesCount || 0);
  const milestone = scoreDelta > 0 ? [100, 90].find((mark) => score >= mark && score - scoreDelta < mark) : undefined;
  const tone = milestone
    ? "win"
    : scoreDelta > 0 || (fixed > 0 && added === 0)
      ? "up"
      : scoreDelta < 0 || added > fixed
        ? "down"
        : "flat";
  const headline =
    milestone === 100
      ? `A perfect 100. Up ${scoreDelta} since your last check`
      : milestone
        ? `You crossed 90. Up ${scoreDelta} since your last check`
        : scoreDelta > 0
          ? `Score up ${scoreDelta} since your last check`
          : scoreDelta < 0
            ? `Score down ${Math.abs(scoreDelta)} since your last check`
            : "Score unchanged since your last check";
  return (
    <section className={`report-change ${tone}`} aria-label="Change since your last check">
      <strong>
        {milestone && (
          <span aria-hidden="true" className="report-change-mark">
            ★
          </span>
        )}
        {headline}
      </strong>
      <span>
        {fixed} fixed · {added} new
      </span>
      <button className="report-change-link" onClick={onDetails} type="button">
        See what changed
      </button>
      {(tone === "win" || tone === "up") && scoreDelta > 0 && (
        <button className="report-change-link" onClick={onShare} type="button">
          Share this win
        </button>
      )}
    </section>
  );
}

function ReportTabs({ tabs, children, selectRef }) {
  const keys = tabs.map((tab) => tab.key);
  const [active, setActive] = useState(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash === "fix-pack") return "problems";
    return keys.includes(fromHash) ? fromHash : keys[0];
  });
  const listRef = useRef(null);

  function select(key, focus = false) {
    setActive(key);
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}${key === keys[0] ? "" : `#${key}`}`);
    if (focus) listRef.current?.querySelector(`#report-tab-${key}`)?.focus();
  }

  useEffect(() => {
    if (!selectRef) return;
    selectRef.current = (key) => {
      if (!keys.includes(key)) return;
      select(key);
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  function onKeyDown(event) {
    const index = keys.indexOf(active);
    const next =
      event.key === "ArrowRight"
        ? keys[(index + 1) % keys.length]
        : event.key === "ArrowLeft"
          ? keys[(index - 1 + keys.length) % keys.length]
          : event.key === "Home"
            ? keys[0]
            : event.key === "End"
              ? keys[keys.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <>
      <div className="report-tabs" role="tablist" aria-label="Report sections" ref={listRef}>
        {tabs.map((tab) => (
          <button
            aria-controls={`report-panel-${tab.key}`}
            aria-selected={active === tab.key}
            id={`report-tab-${tab.key}`}
            key={tab.key}
            onClick={() => select(tab.key)}
            onKeyDown={onKeyDown}
            role="tab"
            tabIndex={active === tab.key ? 0 : -1}
            type="button"
          >
            {tab.label}
            {Number.isFinite(tab.count) && tab.count > 0 && <span className="report-tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {children(active)}
    </>
  );
}
