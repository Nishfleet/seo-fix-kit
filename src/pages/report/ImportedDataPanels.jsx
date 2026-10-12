import { Metric } from "../../components/Metric.jsx";
import { formatCount, formatPercent, formatPosition, safeHostnameLabel } from "../../lib/format.js";

export function CompetitorBenchmarkPanel({ benchmark }) {
  const summary = benchmark.summary || {};
  const target = benchmark.target || {};
  const competitors = benchmark.competitors || [];
  const repairs = benchmark.repairOpportunities || [];

  return (
    <section className="competitor-benchmark-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Competitor benchmark</p>
        <h2>
          {summary.scoreGapToBest > 0
            ? `${summary.bestCompetitorHost} is ${summary.scoreGapToBest} points ahead.`
            : "You match or beat the strongest competitor snapshot."}
        </h2>
        <p>Homepage proof snapshot. This is not backlink, keyword-volume, or rank-tracking data.</p>
      </div>

      <div className="benchmark-metrics" aria-label="Competitor benchmark summary">
        <Metric
          label="Your rank"
          value={`${summary.targetRank || 1}/${summary.totalSitesRanked || competitors.length + 1}`}
        />
        <Metric label="Your score" value={target.score || 0} />
        <Metric label="Best rival" value={summary.bestCompetitorScore || 0} />
        <Metric label="Avg rival" value={summary.competitorAverageScore || 0} />
        <Metric label="Gap repairs" value={repairs.length} />
      </div>

      <div className="benchmark-grid">
        <article className="benchmark-site benchmark-target">
          <div>
            <span>Your site</span>
            <strong>{target.host || safeHostnameLabel(target.url)}</strong>
          </div>
          <b>{target.score || 0}/100</b>
        </article>
        {competitors.map((site) => (
          <article className="benchmark-site" key={site.url}>
            <div>
              <span>Competitor</span>
              <strong>{site.host || safeHostnameLabel(site.url)}</strong>
              <small>
                {site.strengths?.length
                  ? `Avoids: ${site.strengths.slice(0, 3).join(", ")}`
                  : `${site.issueCount || 0} issues in snapshot`}
              </small>
            </div>
            <b>{site.score || 0}/100</b>
          </article>
        ))}
      </div>

      <div className="benchmark-repairs">
        {repairs.slice(0, 5).map((repair) => (
          <article className="benchmark-repair" key={`${repair.priority}-${repair.title}`}>
            <span>{repair.severity}</span>
            <strong>{repair.title}</strong>
            <p>{repair.proof}</p>
            <small>
              {repair.estimatedEffort || "15-30 min"} - {repair.workType || "review"}
            </small>
          </article>
        ))}
        {!repairs.length && <p className="quiet-note">No competitor-backed repair gaps were found in this snapshot.</p>}
      </div>
    </section>
  );
}

export function BacklinkAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const rows = audit.rows || [];
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="backlink-audit-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Backlink audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} link repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Imported backlinks are clean in this proof pass."}
        </h2>
        <p>
          Self-serve backlink import with live source-page proof and link-edge history. This is not proprietary backlink
          discovery.
        </p>
      </div>

      <div className="backlink-metrics" aria-label="Backlink audit summary">
        <Metric label="Imported" value={summary.imported || rows.length} />
        <Metric label="Live" value={summary.live || 0} />
        <Metric label="Lost" value={summary.lost || 0} />
        <Metric label="Risky" value={summary.toxicRisk || 0} />
        <Metric label="Broken" value={summary.brokenTargets || 0} />
      </div>

      {highestPriority && (
        <article className="backlink-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "review"}
          </small>
        </article>
      )}

      <div className="backlink-grid">
        {rows.slice(0, 6).map((row) => (
          <article
            className={`backlink-row ${row.live ? "is-live" : "is-lost"}`}
            key={row.id || `${row.sourceUrl}-${row.targetUrl}`}
          >
            <div>
              <span>{row.live ? "Live" : "Lost"}</span>
              <strong>{safeHostnameLabel(row.sourceUrl)}</strong>
              <small>{row.discoveredAnchorText || row.anchorText || "No anchor text captured"}</small>
            </div>
            <p>{row.proof}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LocalSeoAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const citations = audit.citationRows || [];
  const keywords = audit.keywordChecks || [];
  const highestPriority = repairs[0];

  return (
    <section className="local-seo-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Local SEO audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} local repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Local SEO proof passed for the supplied inputs."}
        </h2>
        <p>Self-serve NAP, citation, schema, profile-link, and local keyword checks.</p>
      </div>

      <div className="local-seo-metrics" aria-label="Local SEO audit summary">
        <Metric label="NAP found" value={`${summary.napFieldsFoundOnSite || 0}/${summary.napFieldsSupplied || 0}`} />
        <Metric label="Schema" value={summary.localSchemaFound ? "Yes" : "No"} />
        <Metric label="GBP link" value={summary.googleBusinessProfileLinked ? "Yes" : "No"} />
        <Metric label="Citations" value={`${summary.citationRowsPassed || 0}/${summary.citationRowsChecked || 0}`} />
        <Metric label="Keywords" value={`${summary.localKeywordsCovered || 0}/${summary.localKeywordsChecked || 0}`} />
      </div>

      {highestPriority && (
        <article className="local-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "review"}
          </small>
        </article>
      )}

      <div className="local-seo-grid">
        {citations.slice(0, 4).map((row) => (
          <article className={`local-seo-row ${row.ok ? "is-live" : "is-lost"}`} key={row.id || row.sourceUrl}>
            <div>
              <span>{row.ok ? "Consistent" : "Mismatch"}</span>
              <strong>{safeHostnameLabel(row.sourceUrl)}</strong>
              <small>{row.mismatches?.length ? `Missing ${row.mismatches.join(", ")}` : "NAP matched"}</small>
            </div>
            <p>{row.proof}</p>
          </article>
        ))}
        {keywords.slice(0, 4).map((item) => (
          <article className={`local-seo-row ${item.found ? "is-live" : "is-lost"}`} key={item.keyword}>
            <div>
              <span>{item.found ? "Covered" : "Missing"}</span>
              <strong>{item.keyword}</strong>
              <small>
                {item.pages?.length ? item.pages.map((page) => page.label).join(", ") : "No rendered page match"}
              </small>
            </div>
            <p>
              {item.found
                ? "Keyword appears naturally in rendered page content."
                : "Keyword was not found in the rendered pages crawled."}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function KeywordRankAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="keyword-rank-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Keyword audit</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} keyword repair ${summary.repairOpportunityCount === 1 ? "action" : "actions"} found.`
            : "Imported keyword rows are clean in this proof pass."}
        </h2>
        <p>
          Self-serve Search Console or rank-tracker import with rendered landing-page proof and trend history. This is
          not live volume or continuous rank tracking.
        </p>
      </div>

      <div className="keyword-rank-metrics" aria-label="Keyword audit summary">
        <Metric label="Rows" value={summary.imported || 0} />
        <Metric label="Queries" value={summary.queries || 0} />
        <Metric label="Clicks" value={formatCount(summary.totalClicks || 0)} />
        <Metric label="Impressions" value={formatCount(summary.totalImpressions || 0)} />
        <Metric label="CTR" value={formatPercent(summary.averageCtr || 0)} />
        <Metric label="Avg pos" value={formatPosition(summary.averagePosition || 0)} />
      </div>

      {highestPriority && (
        <article className="keyword-rank-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "content"}
          </small>
        </article>
      )}

      <div className="keyword-rank-grid">
        {(checks.lowCtrRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`ctr-${row.id}`}
            label="Low CTR"
            title={row.query}
            detail={`${row.pageLabel} - ${formatPercent(row.ctr)} CTR at position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions and ${formatCount(row.clicks)} clicks.`}
          />
        ))}
        {(checks.pageTwoRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`page-two-${row.id}`}
            label="Page two"
            title={row.query}
            detail={`${row.pageLabel} - position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions from a query close to traffic.`}
          />
        ))}
        {(checks.decliningRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`decline-${row.id}`}
            label="Declining"
            title={row.query}
            detail={`${formatCount(row.previousClicks)} to ${formatCount(row.clicks)} clicks`}
            proof={`${row.pageLabel} changed from position ${formatPosition(row.previousPosition)} to ${formatPosition(row.position)}.`}
          />
        ))}
        {(checks.cannibalizationGroups || []).slice(0, 3).map((group) => (
          <KeywordRankRow
            key={`cannibal-${group.normalizedKeyword || group.keyword}`}
            label="Cannibalization"
            title={group.keyword}
            detail={`${group.pages.length} landing pages`}
            proof={group.pages.map((page) => page.pageLabel || page.pageUrl).join(", ")}
          />
        ))}
        {(checks.landingMismatchRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`mismatch-${row.id}`}
            label="Intent mismatch"
            title={row.query}
            detail={row.pageLabel}
            proof="Rendered title, H1, and description do not clearly cover the imported query."
          />
        ))}
        {(checks.missingLandingPageRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`missing-${row.id}`}
            label="Not crawled"
            title={row.query}
            detail={row.pageLabel}
            proof="Imported landing page was not present in the rendered crawl proof."
          />
        ))}
      </div>
    </section>
  );
}

export function KeywordRankRow({ label, title, detail, proof }) {
  return (
    <article className="keyword-rank-row is-lost">
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <p>{proof}</p>
    </article>
  );
}

export function PlatformSeoAuditPanel({ audit }) {
  const summary = audit.summary || {};
  const repairs = audit.repairOpportunities || [];
  const checks = audit.checks || {};
  const highestPriority = repairs[0];
  const platformNames = summary.detectedPlatformNames?.length ? summary.detectedPlatformNames.join(", ") : "Platform";

  return (
    <section className="platform-seo-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Platform SEO audit</p>
        <h2>{platformNames} proof with platform-specific repairs.</h2>
        <p>
          Rendered WordPress and ecommerce checks for product schema, faceted links, archives, and plugin resource
          impact.
        </p>
      </div>

      <div className="platform-seo-metrics" aria-label="Platform SEO audit summary">
        <Metric label="Platforms" value={summary.detectedPlatforms || 0} />
        <Metric label="Products" value={summary.productLikePages || 0} />
        <Metric label="Product schema" value={`${summary.productSchemaCoveragePercent || 0}%`} />
        <Metric label="Faceted links" value={summary.facetedLinks || 0} />
        <Metric label="WP plugins" value={summary.wordpressPlugins || 0} />
        <Metric label="Repairs" value={summary.repairOpportunityCount || repairs.length} />
      </div>

      {highestPriority && (
        <article className="platform-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} - {highestPriority.workType || "technical"}
          </small>
        </article>
      )}

      <div className="platform-seo-grid">
        {(audit.detectedPlatforms || []).slice(0, 4).map((platform) => (
          <article className="platform-seo-row is-live" key={platform.id}>
            <div>
              <span>{platform.category}</span>
              <strong>{platform.name}</strong>
              <small>{platform.confidence || "medium"} confidence</small>
            </div>
            <p>{platform.signals?.[0] || "Rendered platform signal detected."}</p>
          </article>
        ))}
        {(checks.productSchema?.missingPages || []).slice(0, 3).map((page) => (
          <article className="platform-seo-row is-lost" key={`product-${page.url}`}>
            <div>
              <span>Product schema</span>
              <strong>{page.label || page.url}</strong>
              <small>{page.wordCount || 0} rendered words</small>
            </div>
            <p>Product-like page lacks rendered Product schema.</p>
          </article>
        ))}
        {(checks.facetedNavigation?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`facet-${link.href}`}>
            <div>
              <span>Faceted URL</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Rendered link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
        {(checks.wordpressArchives?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`archive-${link.href}`}>
            <div>
              <span>WP archive</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Archive link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
