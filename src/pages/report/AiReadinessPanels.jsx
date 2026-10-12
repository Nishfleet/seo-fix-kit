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
        <p className="beta-eyebrow">AI search readiness</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} ${summary.repairOpportunityCount === 1 ? "fix" : "fixes"} for AI search readiness`
            : "No AI search readiness problems found"}
        </h2>
        <p>
          Checks whether your pages have enough readable text, schema that matches the page, a clear canonical URL,
          question-and-answer structure and an optional llms.txt file. If you import Search Console rows, problems are
          ranked by their traffic. This does not track AI citations or sample AI answers.
        </p>
      </div>

      <div className="ai-readiness-metrics" aria-label="AI search readiness summary">
        <Metric label="Readiness" value={`${summary.readinessScore || 0}/100`} />
        <Metric label="Enough text" value={`${summary.pagesWithEnoughText || 0}/${summary.pagesChecked || 0}`} />
        <Metric label="Pages with schema" value={summary.pagesWithHelpfulSchema || 0} />
        <Metric label="Q&A structure" value={summary.pagesWithQuestionStructure || 0} />
        <Metric label="llms.txt" value={summary.llmsTxtStatus === "reachable" ? "Yes" : "No"} />
        <Metric label="Ranked by" value={summary.trafficRanked ? "Search traffic" : "Report order"} />
      </div>

      {highestPriority && (
        <article className="ai-readiness-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "content"}
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
            label="Readable text"
            title={page.label || page.url}
            detail={`${page.wordCount || 0} words on the page`}
            proof="Add more visible text, such as examples, FAQs, comparisons and next steps."
          />
        ))}
        {schemaMissingPages.slice(0, 3).map((page) => (
          <AiReadinessRow
            key={`schema-${page.url}`}
            state="lost"
            label="Schema"
            title={page.label || page.url}
            detail={page.title || "No useful schema found"}
            proof="Add schema only for content the page actually shows."
          />
        ))}
        {sourcePages.slice(0, 3).map((page, index) => (
          <AiReadinessRow
            key={`source-${page.url}-${page.label}-${index}`}
            state="lost"
            label="Canonical and links"
            title={page.label || page.url}
            detail={page.title || "Canonical or internal links need review"}
            proof="Set one canonical URL and link to related pages."
          />
        ))}
        {summary.llmsTxtStatus === "reachable" ? (
          <AiReadinessRow
            state="live"
            label="llms.txt"
            title="llms.txt found"
            detail="Optional file"
            proof="Gives AI tools context about your site. It does not mean they cite you."
          />
        ) : (
          <AiReadinessRow
            state="lost"
            label="llms.txt"
            title="No llms.txt found"
            detail="Optional file"
            proof="This file is optional. Not having one is not a ranking or citation problem."
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
        <p className="beta-eyebrow">Content ideas (drafts)</p>
        <h2>
          {summary.opportunityCount
            ? `${summary.opportunityCount} content ${summary.opportunityCount === 1 ? "brief" : "briefs"} drafted`
            : "No content briefs for this report"}
        </h2>
        <p>
          Drafted from gaps in your keywords, competitors, AI search readiness or crawl. Nothing is published or changed
          on your site, and none of this guarantees rankings, traffic, citations or revenue.
        </p>
      </div>

      <div className="growth-opportunities-metrics" aria-label="Content ideas summary">
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
            {topOpportunity.estimatedEffort || "30-90 min"} · {topOpportunity.workType || "content"}
          </small>
        </article>
      )}

      <div className="growth-opportunities-grid">
        {opportunities.slice(0, 6).map((item) => (
          <article className="growth-opportunities-row is-live" key={item.id || item.title}>
            <div>
              <span>{growthTypeLabel(item.type)}</span>
              <strong>{item.draftBrief?.summary || item.suggestedAction || item.title}</strong>
              <small>{item.sourceKind || "report"} · draft only</small>
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
        <p className="beta-eyebrow">AI search basics</p>
        <h2>Homepage basics for AI search</h2>
        <p>
          {audit.guidance?.llmsTxt ||
            "Start with enough readable text, a clear title, description and H1, and schema that matches the page."}
        </p>
      </div>
      <div className="geo-readiness-metrics" aria-label="AI search basics summary">
        <Metric label="Checks" value={`${summary.passed || 0}/${summary.total || 0}`} />
        <Metric label="Fixes" value={summary.repairOpportunityCount || repairs.length} />
        <Metric label="Crawlable" value={checks.crawlableContent ? "Yes" : "Needs work"} />
        <Metric label="Schema" value={checks.usefulSchema ? "Useful" : "Missing"} />
      </div>
      {topRepair && (
        <article className="geo-readiness-priority">
          <span>{topRepair.severity}</span>
          <strong>{topRepair.title}</strong>
          <p>{topRepair.proof}</p>
          <small>
            {topRepair.estimatedEffort || "30-90 min"} · {topRepair.workType || "content"}
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
