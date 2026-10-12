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
            ? `${summary.bestCompetitorHost} scores ${summary.scoreGapToBest} points higher`
            : "You match or beat every competitor checked"}
        </h2>
        <p>Compares homepages, checked once. This is not backlink, search volume or rank-tracking data.</p>
      </div>

      <div className="benchmark-metrics" aria-label="Competitor benchmark summary">
        <Metric
          label="Your rank"
          value={`${summary.targetRank || 1}/${summary.totalSitesRanked || competitors.length + 1}`}
        />
        <Metric label="Your score" value={target.score || 0} />
        <Metric label="Best competitor" value={summary.bestCompetitorScore || 0} />
        <Metric label="Competitor average" value={summary.competitorAverageScore || 0} />
        <Metric label="Gaps to fix" value={repairs.length} />
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
                  : `${site.issueCount || 0} problems found`}
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
              {repair.estimatedEffort || "15-30 min"} · {repair.workType || "review"}
            </small>
          </article>
        ))}
        {!repairs.length && <p className="quiet-note">No gaps found against these competitors.</p>}
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
        <p className="beta-eyebrow">Backlinks you imported</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} backlink ${summary.repairOpportunityCount === 1 ? "problem" : "problems"} to fix`
            : "No problems with your imported backlinks"}
        </h2>
        <p>
          We load each linking page you imported and check the link is still there. We don’t find new backlinks for you.
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
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "review"}
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
              <small>{row.discoveredAnchorText || row.anchorText || "No anchor text"}</small>
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
        <p className="beta-eyebrow">Local SEO</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} local SEO ${summary.repairOpportunityCount === 1 ? "problem" : "problems"} to fix`
            : "Local SEO checks passed for the details you entered"}
        </h2>
        <p>
          Checks your business name, address and phone (NAP) on your site and listings, plus local schema, your Google
          Business Profile link and local keywords.
        </p>
      </div>

      <div className="local-seo-metrics" aria-label="Local SEO audit summary">
        <Metric label="NAP found" value={`${summary.napFieldsFoundOnSite || 0}/${summary.napFieldsSupplied || 0}`} />
        <Metric label="Local schema" value={summary.localSchemaFound ? "Yes" : "No"} />
        <Metric label="Google profile link" value={summary.googleBusinessProfileLinked ? "Yes" : "No"} />
        <Metric label="Listings" value={`${summary.citationRowsPassed || 0}/${summary.citationRowsChecked || 0}`} />
        <Metric label="Keywords" value={`${summary.localKeywordsCovered || 0}/${summary.localKeywordsChecked || 0}`} />
      </div>

      {highestPriority && (
        <article className="local-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "review"}
          </small>
        </article>
      )}

      <div className="local-seo-grid">
        {citations.slice(0, 4).map((row) => (
          <article className={`local-seo-row ${row.ok ? "is-live" : "is-lost"}`} key={row.id || row.sourceUrl}>
            <div>
              <span>{row.ok ? "Consistent" : "Mismatch"}</span>
              <strong>{safeHostnameLabel(row.sourceUrl)}</strong>
              <small>
                {row.mismatches?.length ? `Missing ${row.mismatches.join(", ")}` : "Name, address and phone match"}
              </small>
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
                {item.pages?.length ? item.pages.map((page) => page.label).join(", ") : "Not on any page checked"}
              </small>
            </div>
            <p>{item.found ? "Found in the page text." : "Not found on the pages checked."}</p>
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
        <p className="beta-eyebrow">Keywords you imported</p>
        <h2>
          {summary.repairOpportunityCount
            ? `${summary.repairOpportunityCount} keyword ${summary.repairOpportunityCount === 1 ? "problem" : "problems"} to fix`
            : "No problems with your imported keywords"}
        </h2>
        <p>
          Uses the Search Console or rank-tracker rows you pasted, checked against each landing page. This is not live
          search volume or ongoing rank tracking.
        </p>
      </div>

      <div className="keyword-rank-metrics" aria-label="Keyword audit summary">
        <Metric label="Rows" value={summary.imported || 0} />
        <Metric label="Queries" value={summary.queries || 0} />
        <Metric label="Clicks" value={formatCount(summary.totalClicks || 0)} />
        <Metric label="Impressions" value={formatCount(summary.totalImpressions || 0)} />
        <Metric label="CTR" value={formatPercent(summary.averageCtr || 0)} />
        <Metric label="Avg position" value={formatPosition(summary.averagePosition || 0)} />
      </div>

      {highestPriority && (
        <article className="keyword-rank-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "content"}
          </small>
        </article>
      )}

      <div className="keyword-rank-grid">
        {(checks.lowCtrRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`ctr-${row.id}`}
            label="Low click rate"
            title={row.query}
            detail={`${row.pageLabel} · ${formatPercent(row.ctr)} click rate at position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions and ${formatCount(row.clicks)} clicks.`}
          />
        ))}
        {(checks.pageTwoRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`page-two-${row.id}`}
            label="Page 2"
            title={row.query}
            detail={`${row.pageLabel} · position ${formatPosition(row.position)}`}
            proof={`${formatCount(row.impressions)} impressions on a query just off page 1.`}
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
            label="Page doesn’t match query"
            title={row.query}
            detail={row.pageLabel}
            proof="The page title, H1 and description don’t clearly cover this query."
          />
        ))}
        {(checks.missingLandingPageRows || []).slice(0, 3).map((row) => (
          <KeywordRankRow
            key={`missing-${row.id}`}
            label="Page not checked"
            title={row.query}
            detail={row.pageLabel}
            proof="This landing page wasn’t one of the pages this audit checked."
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
        <p className="beta-eyebrow">Platform checks</p>
        <h2>{platformNames} checks</h2>
        <p>WordPress and online store checks: product schema, filter links, archive pages and plugin load.</p>
      </div>

      <div className="platform-seo-metrics" aria-label="Platform SEO audit summary">
        <Metric label="Platforms" value={summary.detectedPlatforms || 0} />
        <Metric label="Product pages" value={summary.productLikePages || 0} />
        <Metric label="Product schema" value={`${summary.productSchemaCoveragePercent || 0}%`} />
        <Metric label="Filter links" value={summary.facetedLinks || 0} />
        <Metric label="WordPress plugins" value={summary.wordpressPlugins || 0} />
        <Metric label="Fixes" value={summary.repairOpportunityCount || repairs.length} />
      </div>

      {highestPriority && (
        <article className="platform-seo-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "technical"}
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
            <p>{platform.signals?.[0] || "Detected on the loaded page."}</p>
          </article>
        ))}
        {(checks.productSchema?.missingPages || []).slice(0, 3).map((page) => (
          <article className="platform-seo-row is-lost" key={`product-${page.url}`}>
            <div>
              <span>Product schema</span>
              <strong>{page.label || page.url}</strong>
              <small>{page.wordCount || 0} words</small>
            </div>
            <p>Looks like a product page but has no Product schema.</p>
          </article>
        ))}
        {(checks.facetedNavigation?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`facet-${link.href}`}>
            <div>
              <span>Filter URL</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
        {(checks.wordpressArchives?.links || []).slice(0, 3).map((link) => (
          <article className="platform-seo-row is-lost" key={`archive-${link.href}`}>
            <div>
              <span>WordPress archive</span>
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
