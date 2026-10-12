import { Metric } from "../../components/Metric.jsx";
import { formatCount, safeHostnameLabel } from "../../lib/format.js";

export function CrawlInventoryPanel({ inventory }) {
  const summary = inventory.summary || {};
  const sampleUrls = inventory.sampleUrls || [];
  const warnings = inventory.warnings || [];

  return (
    <section className="crawl-inventory-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Sitemap URLs</p>
        <h2>
          {summary.urlsDiscovered
            ? `${formatCount(summary.urlsDiscovered)} ${summary.urlsDiscovered === 1 ? "URL" : "URLs"} in your sitemaps`
            : "No sitemap URLs found"}
        </h2>
        <p>
          Every URL your sitemaps list, up to 50,000. Problems come only from the pages this audit loaded in a browser.
        </p>
      </div>

      <div className="crawl-inventory-metrics" aria-label="Sitemap URL summary">
        <Metric label="Sitemap URLs" value={formatCount(summary.urlsDiscovered || 0)} />
        <Metric
          label="Loaded in browser"
          value={`${formatCount(summary.renderedPagesCovered || 0)}/${formatCount(summary.renderedPagesScanned || 0)}`}
        />
        <Metric label="Coverage" value={`${summary.coveragePercent || 0}%`} />
        <Metric label="Sitemaps" value={formatCount(summary.sitemapsFetched || 0)} />
        <Metric label="Limit" value={formatCount(summary.inventoryLimit || 50000)} />
      </div>

      {sampleUrls.length > 0 && (
        <div className="crawl-inventory-grid">
          {sampleUrls.slice(0, 8).map((item) => (
            <article className="crawl-inventory-row" key={item.url}>
              <span>In sitemap</span>
              <strong>{safeHostnameLabel(item.url)}</strong>
              <small>{item.url}</small>
              {item.lastmod && <p>Last updated {item.lastmod}</p>}
            </article>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="crawl-inventory-warnings">
          {warnings.slice(0, 4).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function RenderedCrawlScalePanel({ plan }) {
  const summary = plan.summary || {};
  const batches = plan.batches || [];
  const repairs = plan.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="rendered-crawl-scale-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Large-site crawl plan</p>
        <h2>
          {formatCount(summary.plannedUrlCount || summary.requestedTargetPages || 0)} URLs queued for browser checks
        </h2>
        <p>How a full-site check is split into batches. This is a plan. Not every page here has been checked yet.</p>
      </div>

      <div className="rendered-crawl-scale-metrics" aria-label="Large-site crawl plan summary">
        <Metric label="Checked so far" value={formatCount(summary.renderedPages || 0)} />
        <Metric label="Target" value={formatCount(summary.requestedTargetPages || 0)} />
        <Metric label="Sitemap URLs" value={formatCount(summary.inventoryUrlsAvailable || 0)} />
        <Metric label="Batches" value={formatCount(summary.plannedBatches || 0)} />
        <Metric label="Coverage" value={`${summary.renderedCoveragePercent || 0}%`} />
        <Metric label="Batch size" value={formatCount(summary.batchSize || 1000)} />
      </div>

      {highestPriority && (
        <article className="rendered-crawl-scale-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "technical"}
          </small>
        </article>
      )}

      <div className="rendered-crawl-scale-grid">
        {batches.slice(0, 5).map((batch) => (
          <article
            className={`rendered-crawl-scale-row ${batch.status === "rendered" ? "is-live" : "is-lost"}`}
            key={batch.batch}
          >
            <div>
              <span>{batch.status}</span>
              <strong>Batch {batch.batch}</strong>
              <small>
                {formatCount(batch.startIndex)}-{formatCount(batch.endIndex)} of queued URLs
              </small>
            </div>
            <p>
              {batch.sampleUrls?.length
                ? batch.sampleUrls.slice(0, 3).join(", ")
                : `${formatCount(batch.plannedUrlCount)} URLs planned.`}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CrawlIntelligencePanel({ audit }) {
  const summary = audit.summary || {};
  const checks = audit.checks || {};
  const repairs = audit.repairOpportunities || [];
  const highestPriority = repairs[0];

  return (
    <section className="crawl-intelligence-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Site structure</p>
        <h2>Internal links, duplicates and orphan pages</h2>
        <p>
          Built from the links on each loaded page. An orphan is a sitemap page nothing links to. Cannibalization means
          two pages compete for the same keyword.
        </p>
      </div>

      <div className="crawl-intelligence-metrics" aria-label="Site structure summary">
        <Metric label="Internal links" value={summary.linkedEdges || 0} />
        <Metric label="Deepest click depth" value={summary.maxDepth || 0} />
        <Metric label="Orphans" value={summary.orphanInventoryCandidates || 0} />
        <Metric label="Duplicate pairs" value={summary.duplicateContentPairs || 0} />
        <Metric label="Cannibalization" value={summary.cannibalizationGroups || 0} />
        <Metric label="Links with parameters" value={summary.parameterizedLinks || 0} />
      </div>

      {highestPriority && (
        <article className="crawl-intelligence-priority">
          <span>{highestPriority.severity}</span>
          <strong>{highestPriority.title}</strong>
          <p>{highestPriority.proof}</p>
          <small>
            {highestPriority.estimatedEffort || "30-90 min"} · {highestPriority.workType || "technical"}
          </small>
        </article>
      )}

      <div className="crawl-intelligence-grid">
        {(checks.orphanInventoryCandidates || []).slice(0, 3).map((item) => (
          <article className="crawl-intelligence-row is-lost" key={`orphan-${item.url}`}>
            <div>
              <span>Possible orphan</span>
              <strong>{item.label || item.url}</strong>
              <small>{item.lastmod || "Sitemap URL"}</small>
            </div>
            <p>{item.url}</p>
          </article>
        ))}
        {(checks.duplicateTitles || []).slice(0, 3).map((group) => (
          <article className="crawl-intelligence-row is-lost" key={`title-${group.value}`}>
            <div>
              <span>Duplicate title</span>
              <strong>{group.value}</strong>
              <small>{group.pages.length} pages</small>
            </div>
            <p>{group.pages.map((page) => page.label).join(", ")}</p>
          </article>
        ))}
        {(checks.duplicateContentPairs || []).slice(0, 3).map((pair) => (
          <article className="crawl-intelligence-row is-lost" key={`content-${pair.left.url}-${pair.right.url}`}>
            <div>
              <span>Duplicate content</span>
              <strong>{pair.similarityPercent}% similar</strong>
              <small>
                {pair.left.label} and {pair.right.label}
              </small>
            </div>
            <p>{pair.left.title || pair.right.title || "Similar text"}</p>
          </article>
        ))}
        {(checks.cannibalizationGroups || []).slice(0, 3).map((group) => (
          <article className="crawl-intelligence-row is-lost" key={`cannibal-${group.keyword}`}>
            <div>
              <span>Cannibalization</span>
              <strong>{group.keyword}</strong>
              <small>{group.pages.length} pages</small>
            </div>
            <p>{group.pages.map((page) => page.label).join(", ")}</p>
          </article>
        ))}
        {(checks.parameterizedLinks || []).slice(0, 3).map((link) => (
          <article className="crawl-intelligence-row is-lost" key={`param-${link.href}`}>
            <div>
              <span>URL parameter</span>
              <strong>{link.pageLabel || "page"}</strong>
              <small>{link.text || "Internal link"}</small>
            </div>
            <p>{link.href}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
