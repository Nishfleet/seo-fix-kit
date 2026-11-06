import { CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES, CRAWLRAVEN_PUBLIC_CRAWL_PAGES } from "./crawl-depth.js";
import { fetchPublicUrl } from "./url-safety.js";

const DEFAULT_MAX_SITEMAPS = 500;
const FETCH_TIMEOUT_MS = 7000;
const MAX_SITEMAP_BYTES = 5_000_000;

/** @typedef {{ fetcher?: Fetcher, maxUrls?: number, maxSitemaps?: number, robots?: { url?: string, body?: unknown }, sitemap?: { url?: string, ok?: boolean }, pages?: { url?: string }[], includeUrls?: boolean, allowPrivate?: boolean, privateAddressResolver?: ((hostname: string) => boolean | Promise<boolean>) | undefined }} CrawlInventoryOptions */

/** @param {unknown} [startUrl]
 * @param {CrawlInventoryOptions} [options]
 * @returns {Promise<any>}
 */
export async function buildCrawlInventory(startUrl = "", options = {}) {
  const start = safeUrl(String(startUrl || ""));
  if (!start) return skippedInventory("Invalid start URL.");

  const maxUrls = clampPositive(options.maxUrls || CRAWLRAVEN_PUBLIC_CRAWL_PAGES, CRAWLRAVEN_PUBLIC_CRAWL_PAGES);
  const maxSitemaps = clampPositive(options.maxSitemaps || DEFAULT_MAX_SITEMAPS, 5000);
  const targetHost = normalizedHost(start.href);
  const fetcher = options.fetcher;
  const seeds = sitemapSeeds(start, options.robots, options.sitemap);
  const queue = [...seeds];
  const seenSitemaps = new Set();
  const seenUrls = new Set();
  /** @type {{ url: string, lastmod: string }[]} */
  const urls = [];
  /** @type {{ url: string, ok: boolean, status: number, type: string, urlCount: number, childSitemapCount: number, error?: string }[]} */
  const sitemaps = [];
  /** @type {string[]} */
  const warnings = [];
  let truncated = false;
  let offHostUrlsIgnored = 0;

  while (queue.length && seenSitemaps.size < maxSitemaps && urls.length < maxUrls) {
    const sitemapUrl = queue.shift();
    const normalizedSitemap = normalizeHttpUrl(sitemapUrl);
    if (!normalizedSitemap || seenSitemaps.has(normalizedSitemap)) continue;
    if (!sameHost(normalizedSitemap, start.href)) {
      warnings.push(`Skipped off-host sitemap ${normalizedSitemap}.`);
      continue;
    }
    seenSitemaps.add(normalizedSitemap);

    const fetched = await fetchSitemap(normalizedSitemap, fetcher, {
      allowPrivate: options.allowPrivate,
      privateAddressResolver: options.privateAddressResolver
    });
    const parsed = parseSitemap(fetched.body || "", normalizedSitemap);
    sitemaps.push({
      url: normalizedSitemap,
      ok: fetched.ok,
      status: fetched.status,
      type: parsed.type,
      urlCount: parsed.urls.length,
      childSitemapCount: parsed.sitemaps.length,
      error: fetched.error || parsed.error || ""
    });
    if (!fetched.ok) {
      warnings.push(`${normalizedSitemap} returned ${fetched.status || fetched.error || "no response"}.`);
      continue;
    }

    for (const child of parsed.sitemaps) {
      if (seenSitemaps.size + queue.length >= maxSitemaps) {
        truncated = true;
        break;
      }
      if (sameHost(child.loc, start.href)) queue.push(child.loc);
      else {
        offHostUrlsIgnored += 1;
        warnings.push(`Skipped off-host child sitemap ${child.loc}.`);
      }
    }

    for (const item of parsed.urls) {
      if (urls.length >= maxUrls) {
        truncated = true;
        break;
      }
      const normalizedUrl = normalizeHttpUrl(item.loc);
      if (!normalizedUrl || normalizedHost(normalizedUrl) !== targetHost) {
        offHostUrlsIgnored += 1;
        if (item.loc) warnings.push(`Skipped off-host URL ${item.loc}.`);
        continue;
      }
      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);
      urls.push({
        url: normalizedUrl,
        lastmod: cleanText(item.lastmod || "", 80)
      });
    }
  }

  if (queue.length || seenSitemaps.size >= maxSitemaps) truncated = true;
  const renderedUrls = new Set((options.pages || []).map((page) => stripHash(page.url || "")));
  const renderedInventoryUrls = urls.filter((item) => renderedUrls.has(stripHash(item.url))).length;
  const summary = {
    urlsDiscovered: urls.length,
    inventoryLimit: maxUrls,
    sitemapsFetched: sitemaps.length,
    sitemapSeeds: seeds.length,
    renderedPagesCovered: renderedInventoryUrls,
    renderedPagesScanned: (options.pages || []).length,
    coveragePercent: urls.length ? Math.round((renderedInventoryUrls / urls.length) * 100) : 0,
    uncrawledInventoryUrls: Math.max(urls.length - renderedInventoryUrls, 0),
    truncated,
    offHostUrlsIgnored,
    crawlRavenPublicPages: CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
    crawlRavenEnterprisePages: CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES
  };

  return {
    status: urls.length ? "ready" : "empty",
    source: "robots-and-sitemaps",
    note: "Lists up to 50,000 URLs from your sitemaps. Only the pages loaded in this audit are checked for problems.",
    summary,
    seeds,
    sitemaps,
    urls: options.includeUrls ? urls : undefined,
    sampleUrls: urls.slice(0, 50),
    repairOpportunities: [],
    warnings: [...new Set(warnings)].slice(0, 20)
  };
}

/** @param {any} [inventory]
 * @returns {string[]}
 */
export function crawlInventoryBriefLines(inventory = {}) {
  if (!["ready", "empty"].includes(inventory.status)) return [];
  const summary = inventory.summary || {};
  const lines = [
    "## Crawl inventory",
    "",
    `Sitemap URLs discovered: ${summary.urlsDiscovered || 0}`,
    `Inventory cap: ${summary.inventoryLimit || CRAWLRAVEN_PUBLIC_CRAWL_PAGES}`,
    `Sitemaps fetched: ${summary.sitemapsFetched || 0}`,
    `Rendered proof pages overlapping inventory: ${summary.renderedPagesCovered || 0}/${summary.urlsDiscovered || 0}`,
    `Unrendered inventory URLs: ${summary.uncrawledInventoryUrls || 0}`,
    `Truncated by inventory cap: ${summary.truncated ? "yes" : "no"}`,
    ""
  ];
  if (inventory.warnings?.length) {
    lines.push("### Inventory warnings", "");
    for (const warning of inventory.warnings.slice(0, 8)) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }
  return lines;
}

/** @param {URL} start
 * @param {{ body?: unknown } | undefined} [robots]
 * @param {{ url?: string, ok?: boolean } | undefined} [sitemap]
 * @returns {string[]}
 */
function sitemapSeeds(start, robots = {}, sitemap = {}) {
  const seeds = new Set();
  for (const loc of sitemapLocationsFromRobots(String(robots.body || ""))) {
    const absolute = absoluteUrl(loc, start.origin);
    if (sameHost(absolute, start.href)) seeds.add(normalizeHttpUrl(absolute));
  }
  if (sitemap?.url && sitemap.ok) seeds.add(normalizeHttpUrl(sitemap.url));
  seeds.add(new URL("/sitemap.xml", start.origin).href);
  return [...seeds].filter(Boolean);
}

/** @typedef {{ ok: boolean, status: number, body: string, error?: string }} SitemapFetchResult */

/** @param {string} [url]
 * @param {Fetcher | undefined} [fetcher]
 * @param {{ allowPrivate?: boolean, privateAddressResolver?: unknown }} [options]
 * @returns {Promise<SitemapFetchResult>}
 */
async function fetchSitemap(url, fetcher, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const { response } = await fetchPublicUrl(
      /** @type {any} */ (fetcher),
      String(url),
      {
        headers: {
          accept: "application/xml,text/xml,text/plain,*/*",
          "user-agent": "SEOFixKit/0.9 crawl-inventory"
        },
        signal: controller.signal
      },
      {
        allowPrivate: options.allowPrivate,
        privateAddressResolver: /** @type {((hostname: string) => boolean | Promise<boolean>) | undefined} */ (
          options.privateAddressResolver
        )
      }
    );
    const contentType = response.headers?.get?.("content-type") || "";
    const body =
      contentType.includes("xml") || contentType.includes("text") || contentType === ""
        ? (await response.text()).slice(0, MAX_SITEMAP_BYTES)
        : "";
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: /** @type {Error} */ (error)?.message || "Could not fetch sitemap."
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** @typedef {{ type: string, urls: { loc: string, lastmod: string }[], sitemaps: { loc: string, lastmod: string }[], error: string }} SitemapParse */

/** @param {string} [xml]
 * @param {string} [baseUrl]
 * @returns {SitemapParse}
 */
function parseSitemap(xml = "", baseUrl = "") {
  const text = String(xml || "");
  if (!text.trim()) return { type: "empty", urls: [], sitemaps: [], error: "Sitemap body was empty." };
  const sitemaps = [...text.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi)]
    .map((block) => ({
      loc: absoluteUrl(tagValue(block[0], "loc"), baseUrl),
      lastmod: tagValue(block[0], "lastmod")
    }))
    .filter((item) => item.loc);
  const urls = [...text.matchAll(/<url\b[\s\S]*?<\/url>/gi)]
    .map((block) => ({
      loc: absoluteUrl(tagValue(block[0], "loc"), baseUrl),
      lastmod: tagValue(block[0], "lastmod")
    }))
    .filter((item) => item.loc);
  return {
    type: sitemaps.length ? "sitemapindex" : "urlset",
    urls,
    sitemaps,
    error: !urls.length && !sitemaps.length ? "No sitemap URLs were parsed." : ""
  };
}

/** @param {string} [body]
 * @returns {string[]}
 */
function sitemapLocationsFromRobots(body = "") {
  return String(body || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1] || "")
    .filter(Boolean);
}

/** @param {string} [block]
 * @param {string} [tag]
 * @returns {string}
 */
function tagValue(block = "", tag = "") {
  const match = String(block).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1] || "").trim();
}

/** @param {string} [value]
 * @returns {string}
 */
function decodeXml(value = "") {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** @param {string} [value]
 * @param {string} [baseUrl]
 * @returns {string}
 */
function absoluteUrl(value = "", baseUrl = "") {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

/** @param {unknown} [input]
 * @returns {string}
 */
function normalizeHttpUrl(input = "") {
  try {
    const trimmed = String(input || "").trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

/** @param {string} [left]
 * @param {string} [right]
 * @returns {boolean}
 */
function sameHost(left = "", right = "") {
  return normalizedHost(left) === normalizedHost(right);
}

/** @param {string} [value]
 * @returns {string}
 */
function normalizedHost(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** @param {string} [value]
 * @returns {string}
 */
function stripHash(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return String(value || "");
  }
}

/** @param {unknown} [value]
 * @returns {URL | null}
 */
function safeUrl(value = "") {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

/** @param {string} [input]
 * @param {number} [max]
 * @returns {string}
 */
function cleanText(input = "", max = 200) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** @param {unknown} [value]
 * @param {number} [max]
 * @returns {number}
 */
function clampPositive(value, max = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return max;
  return Math.min(Math.max(Math.round(parsed), 1), max);
}

/** @param {string} [reason]
 * @returns {{ status: string, source: string, summary: { urlsDiscovered: number }, seeds: unknown[], sitemaps: unknown[], sampleUrls: unknown[], warnings: string[] }}
 */
function skippedInventory(reason) {
  return {
    status: "skipped",
    source: "robots-and-sitemaps",
    summary: { urlsDiscovered: 0 },
    seeds: [],
    sitemaps: [],
    sampleUrls: [],
    warnings: reason ? [reason] : []
  };
}
