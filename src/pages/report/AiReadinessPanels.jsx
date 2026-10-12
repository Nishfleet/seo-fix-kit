import { Metric } from "../../components/Metric.jsx";
import { formatCount } from "../../lib/format.js";
import { growthTypeLabel, geoCheckLabel } from "../../lib/labels.js";

export function AiAnswerReadinessPanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];
  const lowContentPages = checks.contentDepth?.lowContentPages || [];
  const schemaMissingPages = checks.structuredData?.missingPages || [];
  const sourcePages = [
    ...(checks.sourceClarity?.missingCanonicalPages || []),
    ...(checks.sourceClarity?.isolatedPages || [])
  ];

  return (
    <section className="ai-readiness-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">AI Answer Readiness</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} proof-derived readiness ${summary.repairOpportunityCount === 1 ? "repair" : "repairs"} found.`
            : "Rendered proof is ready for machine-readable answers."}
        </h2>
        <p>
          Site-proof checks for extractable content, helpful schema, canonical/source clarity, answer structure, and
          optional llms.txt. When Search Console rows are imported, faults are ranked by the traffic behind them. This
          is not AI visibility tracking or citation monitoring.
        </p>
      </div>

      <div className="ai-readiness-metrics" aria-label="AI Answer Readiness summary">
        <Metric label="Readiness" value={`${summary.readinessScore || 0}/100`} />
        <Metric label="Enough text" value={`${summary.pagesWithEnoughText || 0}/${summary.pagesChecked || 0}`} />
        <Metric label="Schema pages" value={summary.pagesWithHelpfulSchema || 0} />
        <Metric label="Question structure" value={summary.pagesWithQuestionStructure || 0} />
        <Metric label="llms.txt" value={summary.llmsTxtStatus === "reachable" ? "Yes" : "No"} />
        <Metric label="Prioritization" value={summary.trafficRanked ? "Imported traffic" : "Proof order"} />
      </div>

      {highestPriority && (
        <article className="ai-readiness-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "content"}
          </small>
          {highestPriority.trafficRanked ? (
            <small>
              {formatCount(highestPriority.trafficClicks)} clicks / {formatCount(highestPriority.trafficImpressions)}{" "}
              impressions on affected pages
            </small>
          ) : null}
        </article>
      )}

      <div className="ai-readiness-grid">
        {lowContentPages.slice(0, 3).map((page) => (
          <AiReadinessRow
            key={`content-${page.url}`}
            state="lost"
            label="Extractable text"
            title={page.label || page.url}
            detail={`${page.wordCount || 0} rendered words`}
            proof="Add visible proof, examples, FAQs, comparisons, and next steps."
          />
        ))}
        {schemaMissingPages.slice(0, 3).map((page) => (
          <AiReadinessRow
            key={`schema-${page.url}`}
            state="lost"
            label="Helpful schema"
            title={page.label || page.url}
            detail={page.title || "No helpful schema proven"}
            proof="Add truthful schema only when it matches visible content."
          />
        ))}
        {sourcePages.slice(0, 3).map((page, index) => (
          <AiReadinessRow
            key={`source-${page.url}-${page.label}-${index}`}
            state="lost"
            label="Source clarity"
            title={page.label || page.url}
            detail={page.title || "Canonical or internal links need review"}
            proof="Keep one preferred URL and rendered links to related context."
          />
        ))}
        {summary.llmsTxtStatus === "reachable" ? (
          <AiReadinessRow
            state="live"
            label="llms.txt"
            title="Optional context file reachable"
            detail="Public agent context"
            proof="This supports public context discovery but does not prove AI visibility."
          />
        ) : (
          <AiReadinessRow
            state="lost"
            label="llms.txt"
            title="Optional context file not reachable"
            detail="Advisory"
            proof="This is not a ranking, visibility, or citation failure."
          />
        )}
      </div>
    </section>
  );
}

export function AiReadinessRow({ state = "lost", label, title, detail, proof }) {
  return (
    <article className={`ai-readiness-row is-${state}`}>
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <p>{proof}</p>
    </article>
  );
}

export function GrowthOpportunitiesPanel({ growth }) {
  const summary = growth.summary || {};
  const opportunities = growth.opportunities || [];
  const topOpportunity = opportunities[0];

  return (
    <section className="growth-opportunities-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Draft-only growth</p>
        <h2>
          {summary.opportunityCount
            ? `${summary.opportunityCount} proof-backed growth ${summary.opportunityCount === 1 ? "brief" : "briefs"} ready.`
            : "No growth briefs were created from this report."}
        </h2>
        <p>
          Drafts from verified keyword, competitor, AI-readiness, or crawl gaps. These do not publish content, open pull
          requests, or promise rankings, traffic, citations, or revenue.
        </p>
      </div>

      <div className="growth-opportunities-metrics" aria-label="Growth opportunity summary">
        <Metric label="Keyword" value={summary.keywordBacked || 0} />
        <Metric label="Competitor" value={summary.competitorBacked || 0} />
        <Metric label="AI-ready" value={summary.aiReadinessBacked || 0} />
        <Metric label="Crawl" value={summary.crawlBacked || 0} />
        <Metric label="Mode" value="Draft" />
      </div>

      {topOpportunity && (
        <article className="growth-opportunities-priority">
          <span>{growthTypeLabel(topOpportunity.type)}</span>
          <strong>{topOpportunity.title}</strong>
          <p>{topOpportunity.proof}</p>
          <small>
            {topOpportunity.estimatedEffort || "30-90 min"} - {topOpportunity.workType || "content"}
          </small>
        </article>
      )}

      <div className="growth-opportunities-grid">
        {opportunities.slice(0, 6).map((item) => (
          <article className="growth-opportunities-row is-live" key={item.id || item.title}>
            <div>
              <span>{growthTypeLabel(item.type)}</span>
              <strong>{item.draftBrief?.summary || item.suggestedAction || item.title}</strong>
              <small>{item.sourceKind || "proof"} - draft only</small>
            </div>
            <p>
              {item.draftBrief?.sections?.length ? item.draftBrief.sections.join(" | ") : item.guardrail || item.proof}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function GeoReadinessPanel({ audit }) {
  const checks = audit.checks || {};
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const topRepair = repairs[0];

  return (
    <section className="geo-readiness-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">SEO/GEO readiness</p>
        <h2>Repair signals for answer-ready search surfaces.</h2>
        <p>
          {audit.guidance?.llmsTxt ||
            "AI-search readiness starts with crawlable content, entity clarity, and truthful schema."}
        </p>
      </div>
      <div className="geo-readiness-metrics" aria-label="SEO and GEO readiness summary">
        <Metric label="Checks" value={`${summary.passed || 0}/${summary.total || 0}`} />
        <Metric label="Repairs" value={summary.repairOpportunityCount || repairs.length} />
        <Metric label="Crawlable" value={checks.crawlableContent ? "Yes" : "Needs work"} />
        <Metric label="Schema" value={checks.usefulSchema ? "Useful" : "Missing"} />
      </div>
      {topRepair && (
        <article className="geo-readiness-priority">
          <span>{topRepair.severity}</span>
          <strong>{topRepair.title}</strong>
          <p>{topRepair.proof}</p>
          <small>
            {topRepair.estimatedEffort || "30-90 min"} - {topRepair.workType || "content"}
          </small>
        </article>
      )}
      <div className="geo-check-grid">
        {Object.entries(checks).map(([key, passed]) => (
          <article className={`geo-check ${passed ? "passed" : "needs-work"}`} key={key}>
            <span>{passed ? "Ready" : "Needs work"}</span>
            <strong>{geoCheckLabel(key)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
