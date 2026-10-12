import { useMemo } from "react";
import { DEFAULT_CRAWL_PAGES } from "../../../shared/crawl-depth.js";
import { CopyButton } from "../../components/CopyButton.jsx";
import { Metric } from "../../components/Metric.jsx";
import { formatCount } from "../../lib/format.js";
import { summarizePages } from "../../lib/page-scoring.js";
import { fetchBrief } from "../../lib/requests.js";
import {
  AiAnswerReadinessPanel,
  GrowthOpportunitiesPanel,
  GeoReadinessPanel
} from "./AiReadinessPanels.jsx";
import { ClientReportPanel } from "./ClientReportPanel.jsx";
import {
  CrawlInventoryPanel,
  RenderedCrawlScalePanel,
  CrawlIntelligencePanel
} from "./CrawlPanels.jsx";
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
import { TeamRepairBoard } from "./TeamRepairBoard.jsx";

export function ReportView({ report }) {
  const issues = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity !== "good"),
    [report]
  );
  const guarded = useMemo(
    () => (report.findings || []).filter((finding) => finding.severity === "good"),
    [report]
  );
  const topFixes = report.repairPlan || [];
  const competitorBenchmark = report.competitorBenchmark || null;
  const crawlInventory = report.crawlInventory || report.crawl_inventory || null;
  const renderedCrawlScale = report.renderedCrawlScale || report.rendered_crawl_scale || null;
  const crawlIntelligence = report.crawlIntelligence || report.crawl_intelligence || null;
  const reportDelta = report.reportDelta || report.report_delta || null;
  const resourceWaterfall =
    report.resourceWaterfall ||
    report.resource_waterfall ||
    report.pages?.[0]?.resourceWaterfall ||
    null;
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
  const topThree = topFixes.slice(0, 3);
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
  const checkoutParam = new URLSearchParams(window.location.search).get("checkout");
  const checkoutReturned = checkoutParam === "return" || checkoutParam === "repair-sprint-return";

  return (
    <div className="report-layout">
      <section className="score-panel">
        <div>
          <p className="beta-eyebrow">Saved report</p>
          <h2>{new URL(report.url).hostname}</h2>
          <p>{report.url}</p>
          <div className="score-meta">
            <span>{scannedAt}</span>
            <span>Rendered browser scan</span>
            <span>{report.summary?.crawlLimitHit ? "Crawl limit reached" : "Crawl completed"}</span>
            {report.owner?.email && <span>Owner: {report.owner.email}</span>}
            {expiresAt && <span>Expires: {expiresAt}</span>}
            {report.storageNote && <span>{report.storageNote}</span>}
          </div>
        </div>
        <div
          className="score-ring"
          style={{ "--score": report.score }}
          aria-label={`SEO score ${report.score} out of 100`}
        >
          <strong>{report.score}</strong>
          <span>/100</span>
        </div>
      </section>

      {(checkoutReturned || report.fixRequest) && (
        <FixRequestStatusPanel fixRequest={report.fixRequest} checkoutReturned={checkoutReturned} />
      )}

      {(report.repairProposals || []).length > 0 && (
        <RepairProposalPanel
          initialProposals={report.repairProposals || []}
          repairSprint={report.repairSprint || null}
          reportId={report.id}
        />
      )}

      <section className="metric-strip" aria-label="Audit summary">
        <Metric label="Pages" value={`${formatCount(report.summary?.pagesScanned || 0)}/${formatCount(report.summary?.maxPages || DEFAULT_CRAWL_PAGES)}`} />
        <Metric label="Critical" value={report.summary?.critical || 0} />
        <Metric label="Warnings" value={report.summary?.warnings || 0} />
        <Metric label="Notices" value={report.summary?.notices || 0} />
        <Metric label="Proof guards" value={report.summary?.guardedFalsePositives || 0} />
      </section>

      {competitorBenchmark?.status === "ready" && <CompetitorBenchmarkPanel benchmark={competitorBenchmark} />}

      {["ready", "empty"].includes(crawlInventory?.status) && <CrawlInventoryPanel inventory={crawlInventory} />}

      {renderedCrawlScale?.status === "ready" && <RenderedCrawlScalePanel plan={renderedCrawlScale} />}

      {crawlIntelligence?.status === "ready" && <CrawlIntelligencePanel audit={crawlIntelligence} />}

      {["ready", "first_run"].includes(reportDelta?.status) && <ReportDeltaPanel delta={reportDelta} />}

      {remediationBrief && <RemediationBriefPanel brief={remediationBrief} reportId={report.id} />}

      {backlinkAudit?.status === "ready" && <BacklinkAuditPanel audit={backlinkAudit} />}

      {localSeoAudit?.status === "ready" && <LocalSeoAuditPanel audit={localSeoAudit} />}

      {keywordRankAudit?.status === "ready" && <KeywordRankAuditPanel audit={keywordRankAudit} />}

      {platformSeoAudit?.status === "ready" && <PlatformSeoAuditPanel audit={platformSeoAudit} />}

      {aiAnswerReadiness?.status === "ready" && <AiAnswerReadinessPanel audit={aiAnswerReadiness} />}

      {growthOpportunities?.status === "ready" && <GrowthOpportunitiesPanel growth={growthOpportunities} />}

      {geoReadiness?.status === "ready" && <GeoReadinessPanel audit={geoReadiness} />}

      {report.performance && <PerformancePanel performance={report.performance} />}

      {["ready", "empty"].includes(resourceWaterfall?.status) && (
        <ResourceWaterfallPanel waterfall={resourceWaterfall} />
      )}

      <section className="verdict-panel">
        <div>
          <p className="beta-eyebrow">Verified repair brief</p>
          <h2>{topFixes.length ? "Fix the proven issues first." : "No priority repairs found."}</h2>
          <p>
            SEO Fix Kit compares raw HTML with the rendered page, then only queues fixes with visible proof.
            This is the anti-noise layer: no duplicate H1s, no busywork, no static-crawler panic.
          </p>
        </div>
        <ol>
          {(topThree.length ? topThree : [{ title: "Keep monitoring", fix: "Re-run after content or template changes.", estimatedEffort: "5 min" }]).map((fix) => (
            <li key={`${fix.priority || "ok"}-${fix.title}`}>
              <strong>{fix.title}</strong>
              <span>{fix.estimatedEffort || "15-30 min"} · {fix.workType || "review"}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-actions">
        <CopyButton label="Copy report URL" value={shareUrl} />
        <CopyButton label="Copy developer brief" value={report.repairBrief || ""} />
        {hasPriorityFixes && (
          <a className="action-link paid-action" href="#fix-pack">
            View Fix Pack checkout
          </a>
        )}
        <a
          className="action-link"
          href={`/api/reports/${report.id}/brief.md`}
          onClick={(event) => {
            event.preventDefault();
            fetchBrief(report.id);
          }}
        >
          Download brief
        </a>
        <a className="action-link" href={`/api/reports/${report.id}/client.pdf`}>
          Download branded PDF
        </a>
      </section>

      <ClientReportPanel report={report} />

      <TeamRepairBoard report={report} />

      <section className="guard-section">
        <div className="section-heading">
          <p className="beta-eyebrow">Proof guards</p>
          <h2>False positives we refused to create</h2>
        </div>
        {guarded.length ? (
          <div className="guard-list">
            {guarded.slice(0, 6).map((finding) => (
              <FindingItem key={finding.id} finding={finding} compact />
            ))}
          </div>
        ) : (
          <p className="quiet-note">No static-vs-rendered false positives were detected in this crawl.</p>
        )}
      </section>

      <section className="page-table-section">
        <div className="section-heading">
          <p className="beta-eyebrow">Site-wide crawl</p>
          <h2>Every page we checked</h2>
        </div>
        <PageSummaryTable pages={pageSummaries} />
      </section>

      <section className="findings-section">
        <div className="section-heading">
          <p className="beta-eyebrow">What is wrong</p>
          <h2>{issues.length ? "Fix these first" : "No priority repairs found"}</h2>
        </div>
        <div className="finding-list">
          {issues.slice(0, 10).map((finding) => (
            <FindingItem
              key={finding.id}
              finding={finding}
              plan={topFixes.find((fix) => fix.title === finding.title)}
            />
          ))}
          {!issues.length && <p className="quiet-note">No critical or warning issues found in this crawl.</p>}
        </div>
      </section>

      <section className="fix-section" id="fix-pack">
        <div className="section-heading">
          <p className="beta-eyebrow">Repair queue</p>
          <h2>Copy the fix, ship it, rerun</h2>
        </div>
        <div className="fix-list">
          {topFixes.slice(0, 8).map((fix) => (
            <FixItem key={`${fix.priority}-${fix.title}`} fix={fix} />
          ))}
          {!topFixes.length && <p className="quiet-note">Nothing needs a repair snippet right now.</p>}
        </div>
        <FixQuotePanel report={report} hasPriorityFixes={hasPriorityFixes} />
      </section>

      <section className="proof-grid">
        {(report.pages || []).map((page) => (
          <PageProof key={page.url} page={page} />
        ))}
      </section>
    </div>
  );
}
