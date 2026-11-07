export const CRAWL_DEPTH_TIERS = [
  {
    id: "lite",
    label: "Lite check",
    pages: 1,
    description: "Your homepage only. No site verification needed."
  },
  {
    id: "quick",
    label: "Quick check",
    pages: 10,
    description: "Your homepage and up to 9 more pages."
  },
  {
    id: "site",
    label: "Site crawl",
    pages: 100,
    description: "Up to 100 pages. Fits most small sites."
  },
  {
    id: "deep",
    label: "Deep crawl",
    pages: 1000,
    description: "Up to 1,000 pages for larger sites. Takes longer to run."
  }
];

export const DEFAULT_CRAWL_PAGES = 10;
export const SELF_SERVE_MAX_CRAWL_PAGES = 1000;
export const CRAWLRAVEN_PUBLIC_CRAWL_PAGES = 50000;
export const CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES = 100000;

/** @typedef {{ id: string, label: string, pages: number, description: string }} CrawlDepthTier */

/** @param {unknown} value
 * @param {{ defaultPages?: number, maxPages?: number }} [options]
 * @returns {number}
 */
export function normalizeCrawlLimit(value, options = {}) {
  const defaultPages = Number(
    /** @type {{ defaultPages?: number, maxPages?: number }} */ (options).defaultPages || DEFAULT_CRAWL_PAGES
  );
  const maxPages = Number(
    /** @type {{ defaultPages?: number, maxPages?: number }} */ (options).maxPages || SELF_SERVE_MAX_CRAWL_PAGES
  );
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultPages;
  return Math.min(Math.max(Math.round(parsed), 1), maxPages);
}

/** @param {unknown} value
 * @returns {CrawlDepthTier}
 */
export function crawlDepthTierFor(value) {
  const pages = normalizeCrawlLimit(value);
  return (
    CRAWL_DEPTH_TIERS.find((tier) => tier.pages === pages) || {
      id: "custom",
      label: `${pages} pages`,
      pages,
      description: "Custom crawl depth."
    }
  );
}

/** @param {unknown} value
 * @returns {{ pages: number, tierId: string, tierLabel: string, selfServeMaxPages: number, crawlRavenPublicPages: number, crawlRavenEnterprisePages: number, parityGapPages: number }}
 */
export function crawlDepthSummary(value) {
  const pages = normalizeCrawlLimit(value);
  const tier = crawlDepthTierFor(pages);
  return {
    pages,
    tierId: tier.id,
    tierLabel: tier.label,
    selfServeMaxPages: SELF_SERVE_MAX_CRAWL_PAGES,
    crawlRavenPublicPages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
    crawlRavenEnterprisePages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
    parityGapPages: Math.max(CRAWLRAVEN_PUBLIC_CRAWL_PAGES - pages, 0)
  };
}
