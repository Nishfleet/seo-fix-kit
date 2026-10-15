import { escapeHtml } from "./html.js";
import { TOOL_PATHS } from "./free-tools/catalog.js";
import { aiAnswerReadinessBriefLines, buildAiAnswerReadiness } from "./ai-answer-readiness.js";
import { backlinkAuditBriefLines, buildBacklinkAudit } from "./backlink-audit.js";
import { buildCompetitorBenchmark, competitorBenchmarkBriefLines } from "./competitor-benchmark.js";
import { crawlDepthSummary, normalizeCrawlLimit } from "./crawl-depth.js";
import { buildCrawlIntelligence, crawlIntelligenceBriefLines } from "./crawl-intelligence.js";
import { buildCrawlInventory, crawlInventoryBriefLines } from "./crawl-inventory.js";
import { buildGrowthOpportunities, growthOpportunitiesBriefLines } from "./growth-opportunities.js";
import { buildKeywordRankAudit, keywordRankAuditBriefLines } from "./keyword-rank-audit.js";
import { buildGeoReadinessAudit, geoReadinessBriefLines } from "./geo-readiness.js";
import { buildLocalSeoAudit, localSeoAuditBriefLines } from "./local-seo-audit.js";
import { buildPlatformSeoAudit, platformSeoAuditBriefLines } from "./platform-seo-audit.js";
import { buildRenderedCrawlScalePlan, renderedCrawlScaleBriefLines } from "./rendered-crawl-scale.js";
import {
  buildResourceWaterfall,
  resourceWaterfallBriefLines,
  resourceWaterfallFindings
} from "./resource-waterfall.js";
import { describeBlocked, robotsAccess } from "./robots-access.js";
import { isPrivateHost, isPrivateHostname } from "./url-safety.js";

const DOCS = {
  javascript: "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  title: "https://developers.google.com/search/docs/appearance/title-link",
  snippets: "https://developers.google.com/search/docs/appearance/snippet",
  structuredData: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
  hreflang: "https://developers.google.com/search/docs/specialty/international/localized-versions",
  coreWebVitals: "https://developers.google.com/search/docs/appearance/core-web-vitals",
  linkBestPractices: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable"
};
const MAX_HTML_BYTES = 1_000_000;
const RESOURCE_LIMITS = {
  linksPerPage: 50,
  imagesPerPage: 25,
  maxRedirects: 5,
  timeoutMs: 7000,
  largeHtmlBytes: 500_000,
  largeImageBytes: 500_000,
  slowRenderMs: 4000
};
const PERFORMANCE_LIMITS = {
  poorScore: 50,
  needsImprovementScore: 75,
  lcpPoorMs: 4000,
  lcpNeedsImprovementMs: 2500,
  clsPoor: 0.25,
  clsNeedsImprovement: 0.1,
  tbtPoorMs: 600,
  tbtNeedsImprovementMs: 300,
  fcpNeedsImprovementMs: 1800,
  speedIndexNeedsImprovementMs: 3400
};
export const VERSION = "0.9.0";

export function createAuditEngine({
  launchBrowser,
  fetchImpl = globalThis.fetch,
  pagespeedApiKey = "",
  pagespeedDisabled = false,
  appOrigin = "",
  allowLocalAudits = false,
  privateAddressResolver = null
} = {}) {
  if (typeof launchBrowser !== "function") {
    throw new Error("createAuditEngine requires a launchBrowser() adapter.");
  }
  const fetch = (...args) => fetchImpl(...args);
  const urlGuard = allowLocalAudits ? localAuditUrlStatus : publicAuditUrlStatus;
  const privateDnsGuard =
    allowLocalAudits || typeof privateAddressResolver !== "function" ? null : privateAddressResolver;

  async function auditUrl(inputUrl, options = {}) {
    const startedAt = Date.now();
    const startUrl = normalizeUrl(inputUrl);
    const origin = new URL(startUrl).origin;
    let crawlOrigin = origin;
    const maxPages = clampPageLimit(options.maxPages || 10);

    const robots =
      origin === (options.appOrigin || appOrigin)
        ? {
            ok: true,
            status: 200,
            url: `${origin}/robots.txt`,
            body: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
          }
        : await fetchText(`${origin}/robots.txt`);
    const sitemap =
      origin === (options.appOrigin || appOrigin)
        ? { ok: true, status: 200, url: `${origin}/sitemap.xml`, body: rootSitemap(origin) }
        : await fetchText(`${origin}/sitemap.xml`);
    const llmsTxt = await fetchText(`${origin}/llms.txt`);
    let browser;
    try {
      browser = await launchBrowser();
    } catch (error) {
      const busyError = new Error(
        "Audit capacity is busy right now. Your audit stays queued and retries automatically."
      );
      busyError.code = "BROWSER_BUSY";
      busyError.cause = error;
      throw busyError;
    }
    const pages = [];
    const queue = [startUrl];
    const visited = new Set();
    const resourceValidationBudget = { remainingPages: maxPages > 50 ? 10 : maxPages };

    try {
      while (queue.length && pages.length < maxPages) {
        const nextUrl = stripHash(queue.shift());
        if (visited.has(nextUrl)) continue;
        visited.add(nextUrl);

        const page = await inspectPage(nextUrl, browser, { resourceValidationBudget });
        if (!page.isHtml) continue;
        pages.push(page);
        if (pages.length === 1 && page.rendered?.finalUrl) {
          crawlOrigin = new URL(page.rendered.finalUrl).origin;
        }

        for (const link of page.rendered.internalLinks) {
          const href = stripHash(link.href);
          if (!href.startsWith(crawlOrigin)) continue;
          if (
            isLikelyHtmlUrl(href) &&
            !visited.has(href) &&
            !queue.includes(href) &&
            queue.length + pages.length < maxPages
          ) {
            queue.push(href);
          }
        }
      }
    } finally {
      await browser.close();
    }

    const performance = await collectPerformanceInsights(startUrl, pages[0], {
      pageSpeed: options.pageSpeed,
      pageSpeedApiKey: pagespeedApiKey,
      pageSpeedFetcher: options.pageSpeedFetcher,
      disabled: pagespeedDisabled
    });

    const declaredImages = await checkDeclaredImages(pages);
    let findings = buildFindings({
      pages,
      startUrl,
      robots,
      sitemap,
      performance,
      declaredImages
    });
    let score = scoreFindings(findings);
    let pageSummaries = buildPageSummaries(pages, findings, startUrl);
    let summary = summarize(findings, pages, maxPages);
    let repairPlan = buildRepairPlan(findings);
    const fixPack = buildFixPack(pages[0], origin, findings, declaredImages);
    const report = {
      id: `${new URL(startUrl).hostname.replace(/[^a-z0-9]+/gi, "-")}-${startedAt.toString(36)}`,
      url: startUrl,
      origin,
      scannedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      score,
      summary,
      crawlDepth: crawlDepthSummary(maxPages),
      warnings: [],
      docs: DOCS,
      performance,
      pages,
      pageSummaries,
      findings,
      llmsTxt: discoveryFileSummary(llmsTxt),
      crawlerAccess: robotsAccess(robots, pages[0]?.url || startUrl),
      repairPlan,
      repairBrief: "",
      fixPack
    };

    report.crawlInventory = await buildCrawlInventory(startUrl, {
      robots,
      sitemap,
      pages,
      maxUrls: options.crawlInventoryMaxUrls,
      maxSitemaps: options.crawlInventoryMaxSitemaps,
      allowPrivate: allowLocalAudits && isPrivateHost(startUrl),
      fetcher: fetch,
      privateAddressResolver: privateDnsGuard
    });

    const renderedCrawlScale = buildRenderedCrawlScalePlan(report, report.crawlInventory, {
      renderedCrawlTarget: options.renderedCrawlTarget || options.crawlScaleTarget
    });
    if (renderedCrawlScale.status === "ready") {
      report.renderedCrawlScale = renderedCrawlScale;
      repairPlan = mergeRepairPlans(repairPlan, renderedCrawlScale.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const crawlIntelligence = buildCrawlIntelligence(report, report.crawlInventory);
    if (crawlIntelligence.status === "ready") {
      report.crawlIntelligence = crawlIntelligence;
      repairPlan = mergeRepairPlans(repairPlan, crawlIntelligence.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const competitorReports = await auditCompetitorUrls(startUrl, options);
    if (competitorReports.reports.length) {
      report.competitorBenchmark = buildCompetitorBenchmark(report, competitorReports.reports);
    }
    if (competitorReports.warnings.length) {
      report.warnings.push(...competitorReports.warnings);
    }

    const backlinkAudit = await buildBacklinkAudit(report, options.backlinks || options.backlinkRows || [], {
      allowPrivate: allowLocalAudits && options.allowPrivateBacklinks === true,
      fetcher: fetch,
      privateAddressResolver: privateDnsGuard
    });
    if (backlinkAudit.status === "ready") {
      report.backlinkAudit = backlinkAudit;
      repairPlan = mergeRepairPlans(repairPlan, backlinkAudit.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const localSeoAudit = await buildLocalSeoAudit(report, options.localSeo || options.localSeoInput || {}, {
      allowPrivate: allowLocalAudits && options.allowPrivateLocalSeo === true,
      fetcher: fetch,
      privateAddressResolver: privateDnsGuard
    });
    if (localSeoAudit.status === "ready") {
      report.localSeoAudit = localSeoAudit;
      repairPlan = mergeRepairPlans(repairPlan, localSeoAudit.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const keywordRankAudit = buildKeywordRankAudit(report, options.keywordRows || options.keywordRankRows || [], {
      allowPrivate: allowLocalAudits && options.allowPrivateKeywordRows === true
    });
    if (keywordRankAudit.status === "ready") {
      report.keywordRankAudit = keywordRankAudit;
      repairPlan = mergeRepairPlans(repairPlan, keywordRankAudit.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const platformSeoAudit = buildPlatformSeoAudit(report);
    if (platformSeoAudit.status === "ready") {
      report.platformSeoAudit = platformSeoAudit;
      repairPlan = mergeRepairPlans(repairPlan, platformSeoAudit.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const aiAnswerReadiness = buildAiAnswerReadiness(report, {
      llmsTxt: report.llmsTxt,
      keywordRows: options.keywordRows || options.keywordRankRows || report.keywordRankAudit?.rows || []
    });
    if (aiAnswerReadiness.status === "ready") {
      report.aiAnswerReadiness = aiAnswerReadiness;
      if (aiAnswerReadiness.findings?.length) {
        findings = [...findings, ...aiAnswerReadiness.findings];
        score = scoreFindings(findings);
        pageSummaries = buildPageSummaries(pages, findings, startUrl);
        summary = summarize(findings, pages, maxPages);
        report.findings = findings;
        report.score = score;
        report.pageSummaries = pageSummaries;
        report.summary = summary;
      }
      repairPlan = mergeRepairPlans(repairPlan, aiAnswerReadiness.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    const growthOpportunities = buildGrowthOpportunities(report);
    if (growthOpportunities.status === "ready") {
      report.growthOpportunities = growthOpportunities;
    }

    const geoReadiness = buildGeoReadinessAudit(report);
    if (geoReadiness.status === "ready") {
      report.geoReadiness = geoReadiness;
      repairPlan = mergeRepairPlans(repairPlan, geoReadiness.repairOpportunities);
      report.repairPlan = repairPlan;
    }

    report.repairPlan = withScoreGains(report.repairPlan, findings, score);
    report.projectedScore = projectedScore(report.repairPlan, findings, score);

    report.repairBrief = buildRepairBrief({
      startUrl,
      score,
      summary,
      pages,
      findings,
      repairPlan,
      performance,
      competitorBenchmark: report.competitorBenchmark,
      crawlInventory: report.crawlInventory,
      renderedCrawlScale: report.renderedCrawlScale,
      crawlIntelligence: report.crawlIntelligence,
      backlinkAudit: report.backlinkAudit,
      localSeoAudit: report.localSeoAudit,
      keywordRankAudit: report.keywordRankAudit,
      platformSeoAudit: report.platformSeoAudit,
      aiAnswerReadiness: report.aiAnswerReadiness,
      growthOpportunities: report.growthOpportunities,
      geoReadiness: report.geoReadiness
    });

    return report;
  }

  async function inspectPage(url, browser, options = {}) {
    const staticFetch = await fetchText(url);
    const isHtml = isHtmlResponse(staticFetch, url);
    const finalUrl = staticFetch.url || url;
    const finalUrlCheck = urlGuard(finalUrl);
    const renderPrivateDnsBlocked =
      finalUrlCheck.ok && privateDnsGuard ? await privateDnsGuard(new URL(finalUrl).hostname) : false;
    const safeToRender = finalUrlCheck.ok && !renderPrivateDnsBlocked;
    const staticFacts = extractStaticFacts(staticFetch.body || "", finalUrl, staticFetch);
    const rendered =
      isHtml && safeToRender
        ? await extractRenderedFacts(browser, finalUrl, { urlGuard, privateDnsGuard })
        : staticFacts;
    const shouldValidateResources = isHtml && consumeResourceValidationBudget(options.resourceValidationBudget);
    const resources = shouldValidateResources ? await validatePageResources(rendered) : emptyResourceChecks();
    const resourceWaterfall = buildResourceWaterfall({
      url,
      finalUrl,
      rendered
    });

    return {
      url,
      finalUrl,
      redirected: stripHash(finalUrl) !== stripHash(url),
      renderSkippedReason:
        isHtml && !safeToRender
          ? renderPrivateDnsBlocked
            ? "This URL points at a private or internal address and cannot be audited."
            : finalUrlCheck.error || "Final URL left the audited origin."
          : "",
      status: staticFetch.status,
      ok: staticFetch.ok,
      contentType: staticFetch.contentType,
      headers: staticFetch.headers || {},
      redirectChain: staticFetch.redirectChain || [],
      responseTimeMs: staticFetch.responseTimeMs || null,
      transferSize: staticFetch.contentLength || byteLength(staticFetch.body || ""),
      isHtml,
      static: staticFacts,
      rendered,
      linkChecks: resources.links,
      imageChecks: resources.images,
      canonicalCheck: resources.canonical,
      resourceWaterfall
    };
  }

  async function auditCompetitorUrls(startUrl, options = {}) {
    if (options.skipCompetitors) return { reports: [], warnings: [] };
    const urls = normalizeCompetitorUrlsList(options.competitorUrls || options.competitors || [], startUrl, urlGuard);
    const reports = [];
    const warnings = [];

    for (const competitorUrl of urls) {
      try {
        const report = await auditUrl(competitorUrl, {
          maxPages: Math.min(clampPageLimit(options.competitorMaxPages || 1), 3),
          pageSpeed: options.competitorPageSpeed === true,
          skipCompetitors: true,
          crawlInventoryMaxUrls: 1,
          crawlInventoryMaxSitemaps: 1,
          renderedCrawlTarget: 0
        });
        reports.push(report);
      } catch (error) {
        warnings.push({
          title: "Competitor benchmark unavailable",
          body: `Could not benchmark ${competitorUrl}.`,
          detail: error?.message || "The competitor snapshot failed."
        });
      }
    }

    return { reports, warnings };
  }

  async function collectPerformanceInsights(startUrl, homePage, options = {}) {
    const fallback = buildRenderedPerformanceSummary(homePage);
    if (!shouldRunPageSpeed(startUrl, options)) {
      return {
        status: "skipped",
        source: "rendered-lab",
        reason: "PageSpeed Insights skipped for local, private, or disabled runs.",
        ...fallback
      };
    }

    try {
      const raw = await fetchPageSpeedInsights(startUrl, options);
      return {
        ...fallback,
        ...parsePageSpeedResult(raw),
        status: "success",
        source: "pagespeed-insights-v5",
        strategy: "mobile"
      };
    } catch (error) {
      return {
        status: "unavailable",
        source: "rendered-lab",
        reason: error.message || "PageSpeed Insights did not return performance data.",
        ...fallback
      };
    }
  }

  async function fetchPageSpeedInsights(url, options = {}) {
    if (typeof options.pageSpeedFetcher === "function") {
      return options.pageSpeedFetcher(url);
    }
    const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.append("category", "performance");
    endpoint.searchParams.set("locale", "en_US");
    if (options.pageSpeedApiKey) {
      endpoint.searchParams.set("key", options.pageSpeedApiKey);
    }
    const response = await fetch(endpoint.href, {
      headers: {
        "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; PageSpeed proof audit)`
      },
      signal: AbortSignal.timeout(45_000)
    });
    if (!response.ok) {
      throw new Error(`PageSpeed Insights returned HTTP ${response.status}.`);
    }
    return response.json();
  }

  async function validatePageResources(rendered = {}) {
    const pageUrl = rendered.finalUrl || "";
    const pageOrigin = pageUrl ? new URL(pageUrl).origin : "";
    const links = uniqueResources(rendered.links || [], "href")
      .slice(0, RESOURCE_LIMITS.linksPerPage)
      .map((link) => ({
        url: link.href,
        label: link.text || link.rawHref || link.href,
        kind: link.href && new URL(link.href).origin === pageOrigin ? "internal" : "external"
      }));
    const images = uniqueResources(
      (rendered.images || []).filter((image) => isHttpResourceUrl(image.src)),
      "src"
    )
      .slice(0, RESOURCE_LIMITS.imagesPerPage)
      .map((image) => ({
        url: image.src,
        label: image.alt || image.src,
        kind: "image"
      }));

    const canonicalOrigin = rendered.canonical ? safeOrigin(rendered.canonical) : "";
    const canonicalKind =
      canonicalOrigin && pageOrigin && isSameSiteOrigin(canonicalOrigin, pageOrigin) ? "internal" : "canonical";

    const [linkChecks, imageChecks, canonicalCheck] = await Promise.all([
      Promise.all(links.map(checkResource)),
      Promise.all(images.map(checkResource)),
      rendered.canonical
        ? checkResource({ url: rendered.canonical, label: "canonical", kind: canonicalKind })
        : Promise.resolve(null)
    ]);

    return {
      links: linkChecks,
      images: imageChecks,
      canonical: canonicalCheck
    };
  }

  async function checkResource(resource) {
    const result = await fetchResourceResult(resource.url);
    return {
      ...resource,
      ...result,
      redirected: (result.redirectChain || []).length > 0
    };
  }

  async function fetchResourceResult(url) {
    const checked = await fetchResource(url, "HEAD");
    const result = checked.status === 403 || checked.status === 405 ? await fetchResource(url, "GET") : checked;
    return result;
  }

  async function checkDeclaredImages(pages) {
    const results = [];
    const seen = new Set();
    const probedOrigins = new Set();

    const checkCandidate = async (page, candidate) => {
      if (!candidate.url || seen.has(candidate.url)) return null;
      seen.add(candidate.url);
      const checked = await checkResource({ url: candidate.url, label: candidate.key, kind: "image" });
      const contentType = String(checked.contentType || "").toLowerCase();
      const isImage =
        contentType.includes("image/") ||
        (!contentType && /\.(png|jpe?g|gif|webp|avif|svg)$/.test(new URL(candidate.url).pathname));
      const result = {
        pageUrl: page.url,
        key: candidate.key,
        url: candidate.url,
        ok: Boolean(checked.ok) && isImage,
        status: checked.status,
        contentType: checked.contentType,
        error: checked.error || "",
        redirected: Boolean(checked.redirected)
      };
      results.push(result);
      return result;
    };

    for (const page of pages) {
      const rendered = page.rendered || {};
      await checkCandidate(page, { key: "og", url: rendered.openGraph?.image });
      await checkCandidate(page, { key: "twitter", url: rendered.twitter?.image });
      const declaredIcon = await checkCandidate(page, {
        key: "apple-touch-icon",
        url: rendered.appleTouchIcon
      });
      const iconAlreadyOk =
        declaredIcon?.ok ||
        results.some((check) => check.key === "apple-touch-icon" && check.ok && check.url === rendered.appleTouchIcon);
      if (iconAlreadyOk) continue;
      let pageOrigin;
      try {
        pageOrigin = new URL(page.url).origin;
      } catch {
        continue;
      }
      if (probedOrigins.has(pageOrigin)) continue;
      probedOrigins.add(pageOrigin);
      await checkCandidate(page, {
        key: "apple-touch-icon-probe",
        url: `${pageOrigin}/apple-touch-icon.png`
      });
    }
    return results;
  }

  async function fetchResource(url, method) {
    try {
      const result = urlGuard(url);
      if (!result.ok) {
        return {
          ok: false,
          status: null,
          finalUrl: url,
          contentType: "",
          contentLength: 0,
          headers: {},
          redirectChain: [],
          guarded: true,
          error: result.error
        };
      }

      let currentUrl = url;
      let response = null;
      const redirectChain = [];
      for (let redirectCount = 0; redirectCount <= RESOURCE_LIMITS.maxRedirects; redirectCount += 1) {
        if (privateDnsGuard && (await privateDnsGuard(new URL(currentUrl).hostname))) {
          return {
            ok: false,
            status: null,
            finalUrl: currentUrl,
            contentType: "",
            contentLength: 0,
            headers: {},
            redirectChain,
            guarded: true,
            error: "This URL points at a private or internal address and cannot be audited."
          };
        }

        response = await fetch(currentUrl, {
          method,
          redirect: "manual",
          headers: { "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; evidence-backed SEO audit)` },
          signal: AbortSignal.timeout(RESOURCE_LIMITS.timeoutMs)
        });

        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).href;
        const nextStatus = urlGuard(nextUrl);
        if (!nextStatus.ok) {
          return {
            ok: false,
            status: response.status,
            finalUrl: nextUrl,
            contentType: "",
            contentLength: 0,
            headers: headersToObject(response.headers),
            redirectChain,
            error: nextStatus.error
          };
        }
        redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
        currentUrl = nextUrl;
      }

      if (!response) throw new Error("No response returned.");

      return {
        ok: response.ok,
        status: response.status,
        finalUrl: currentUrl,
        contentType: response.headers.get("content-type") || "",
        contentLength: Number(response.headers.get("content-length")) || 0,
        headers: headersToObject(response.headers),
        redirectChain,
        error: ""
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        finalUrl: url,
        contentType: "",
        contentLength: 0,
        headers: {},
        redirectChain: [],
        error: error.message
      };
    }
  }

  async function fetchText(url) {
    try {
      const started = Date.now();
      let currentUrl = url;
      let response = null;
      const redirectChain = [];
      for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
        const status = urlGuard(currentUrl);
        if (!status.ok) {
          return {
            ok: false,
            status: null,
            url: currentUrl,
            contentType: "",
            body: "",
            headers: {},
            redirectChain,
            responseTimeMs: Date.now() - started,
            contentLength: 0,
            error: status.error
          };
        }
        if (privateDnsGuard && (await privateDnsGuard(new URL(currentUrl).hostname))) {
          return {
            ok: false,
            status: null,
            url: currentUrl,
            contentType: "",
            body: "",
            headers: {},
            redirectChain,
            responseTimeMs: Date.now() - started,
            contentLength: 0,
            error: "This URL points at a private or internal address and cannot be audited."
          };
        }

        response = await fetch(currentUrl, {
          redirect: "manual",
          headers: { "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; evidence-backed SEO audit)` },
          signal: AbortSignal.timeout(15_000)
        });

        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).href;
        redirectChain.push({ status: response.status, from: currentUrl, to: nextUrl });
        currentUrl = nextUrl;
      }

      if (!response) {
        throw new Error("No response returned.");
      }

      const contentType = response.headers.get("content-type") || "";
      const body =
        contentType.includes("text") || contentType.includes("html") || contentType.includes("xml")
          ? await readTextLimited(response, MAX_HTML_BYTES)
          : "";
      return {
        ok: response.ok,
        status: response.status,
        url: currentUrl,
        contentType,
        body,
        headers: headersToObject(response.headers),
        redirectChain,
        responseTimeMs: Date.now() - started,
        contentLength: Number(response.headers.get("content-length")) || byteLength(body)
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        url,
        contentType: "",
        body: "",
        headers: {},
        redirectChain: [],
        responseTimeMs: null,
        contentLength: 0,
        error: error.message
      };
    }
  }

  return { auditUrl };
}

function discoveryFileSummary(file = {}) {
  const body = String(file.body || "");
  return {
    ok: Boolean(file.ok),
    status: file.status ?? null,
    url: file.url || "",
    contentType: file.contentType || "",
    contentLength: Number(file.contentLength || byteLength(body)),
    bodySample: body.slice(0, 500),
    responseTimeMs: file.responseTimeMs || null,
    error: file.error || ""
  };
}

function localAuditUrlStatus(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return publicAuditUrlStatus(value);
  }
  if (["http:", "https:"].includes(parsed.protocol) && isLocalhost(parsed.hostname)) {
    return { ok: true };
  }
  return publicAuditUrlStatus(value);
}

function consumeResourceValidationBudget(budget) {
  if (!budget) return true;
  if (Number(budget.remainingPages || 0) <= 0) return false;
  budget.remainingPages -= 1;
  return true;
}

async function extractRenderedFacts(browser, url, options = {}) {
  const page = await browser.newPage();
  const started = Date.now();

  try {
    await installRenderRequestGuard(page, options);

    // networkidle0 never settles on pages with analytics beacons, polling or websockets.
    const navigationTimeoutMs = Number(options.navigationTimeoutMs) > 0 ? Number(options.navigationTimeoutMs) : 25_000;
    let loadSettled = true;
    let response;
    try {
      response = await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: navigationTimeoutMs
      });
    } catch (navigationError) {
      if (!/timeout/i.test(String(navigationError?.message || ""))) throw navigationError;
      loadSettled = false;
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeoutMs
      });
      await wait(1500);
    }

    await wait(350);

    const facts = await page.evaluate(() => {
      const absolute = (value) => {
        try {
          return value ? new URL(value, location.href).href : null;
        } catch {
          return value || null;
        }
      };
      const metaByName = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || null;
      const metaByProperty = (property) =>
        document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") || null;
      const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((node) => ({
        level: node.tagName.toLowerCase(),
        text: text(node)
      }));
      const links = [...document.querySelectorAll("a[href]")]
        .map((node) => ({
          text: text(node),
          href: absolute(node.getAttribute("href")),
          rawHref: node.getAttribute("href")
        }))
        .filter((link) => link.href && link.href.startsWith("http"));
      const images = [...document.querySelectorAll("img")].map((node) => {
        const alt = node.getAttribute("alt");
        return {
          src: absolute(node.getAttribute("src")),
          alt: alt || "",
          hasAlt: node.hasAttribute("alt"),
          role: node.getAttribute("role") || "",
          ariaHidden: node.getAttribute("aria-hidden") === "true",
          width: node.getAttribute("width") || null,
          height: node.getAttribute("height") || null
        };
      });
      const scripts = [...document.querySelectorAll("script[src]")].map((node) => ({
        src: absolute(node.getAttribute("src")),
        type: node.getAttribute("type") || "",
        async: node.hasAttribute("async"),
        defer: node.hasAttribute("defer")
      }));
      const stylesheets = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((node) => ({
        href: absolute(node.getAttribute("href")),
        media: node.getAttribute("media") || ""
      }));
      const schemaTypesFor = (value) => {
        const types = [];
        const visit = (item) => {
          if (!item || typeof item !== "object") return;
          const type = item["@type"];
          if (Array.isArray(type)) types.push(...type.filter(Boolean));
          else if (type) types.push(type);
          for (const key of [
            "@graph",
            "itemListElement",
            "mainEntity",
            "hasPart",
            "review",
            "offers",
            "aggregateRating",
            "breadcrumb"
          ]) {
            const child = item[key];
            if (Array.isArray(child)) child.forEach(visit);
            else visit(child);
          }
        };
        if (Array.isArray(value)) value.forEach(visit);
        else visit(value);
        return types;
      };
      const schemaResults = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node, index) => {
        try {
          const parsed = JSON.parse(node.textContent || "{}");
          const values = Array.isArray(parsed) ? parsed : [parsed];
          return {
            index: index + 1,
            types: schemaTypesFor(parsed),
            missingContext: values.some((item) => item && !item["@context"])
          };
        } catch {
          return {
            index: index + 1,
            types: ["invalid-json"],
            error: "JSON-LD could not be parsed."
          };
        }
      });
      const bodyText = text(document.body);
      const leadText =
        [...(document.querySelector("main, article, [role=main]") || document.body).querySelectorAll("p")]
          .filter((node) => !node.closest("nav, header, footer, aside, [role=navigation]"))
          .map(text)
          .find((value) => value.split(" ").length >= 8) || "";
      const origin = location.origin;
      const number = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
      };
      const navigation = performance.getEntriesByType("navigation")[0] || null;
      const navigationTiming = navigation
        ? {
            startTimeMs: number(navigation.startTime),
            responseStartMs: number(navigation.responseStart),
            responseEndMs: number(navigation.responseEnd),
            domInteractiveMs: number(navigation.domInteractive),
            domContentLoadedMs: number(navigation.domContentLoadedEventEnd),
            loadEventMs: number(navigation.loadEventEnd),
            durationMs: number(navigation.duration),
            transferSize: number(navigation.transferSize),
            encodedBodySize: number(navigation.encodedBodySize),
            decodedBodySize: number(navigation.decodedBodySize),
            protocol: navigation.nextHopProtocol || ""
          }
        : {};
      const allResourceTimings = performance
        .getEntriesByType("resource")
        .map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType || "",
          startTime: number(entry.startTime),
          responseStart: number(entry.responseStart),
          responseEnd: number(entry.responseEnd),
          duration: number(entry.duration),
          transferSize: number(entry.transferSize),
          encodedBodySize: number(entry.encodedBodySize),
          decodedBodySize: number(entry.decodedBodySize),
          renderBlockingStatus: entry.renderBlockingStatus || "",
          nextHopProtocol: entry.nextHopProtocol || ""
        }))
        .sort((a, b) => a.startTime - b.startTime || b.duration - a.duration);
      const resourceTimings = allResourceTimings.slice(0, 150);

      return {
        source: "rendered-dom",
        finalUrl: location.href,
        title: document.title || "",
        description: metaByName("description"),
        generator: metaByName("generator"),
        robots: metaByName("robots"),
        canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute("href")),
        lang: document.documentElement.getAttribute("lang") || null,
        viewport: metaByName("viewport"),
        charset: document.characterSet || null,
        doctype: document.doctype ? document.doctype.name : null,
        hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => ({
          hreflang: node.getAttribute("hreflang"),
          href: absolute(node.getAttribute("href"))
        })),
        h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
        headings,
        links,
        internalLinks: links.filter((link) => new URL(link.href).origin === origin),
        externalLinks: links.filter((link) => new URL(link.href).origin !== origin),
        images,
        imagesMissingAlt: images.filter((image) => !image.hasAlt),
        scripts,
        stylesheets,
        openGraph: {
          title: metaByProperty("og:title"),
          description: metaByProperty("og:description"),
          image: absolute(metaByProperty("og:image")),
          url: absolute(metaByProperty("og:url")),
          type: metaByProperty("og:type")
        },
        twitter: {
          card: metaByName("twitter:card"),
          title: metaByName("twitter:title"),
          description: metaByName("twitter:description"),
          image: absolute(metaByName("twitter:image"))
        },
        favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute("href")),
        appleTouchIcon: absolute(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")),
        schemaTypes: schemaResults.flatMap((item) => item.types || []),
        schemaErrors: schemaResults
          .filter((item) => item.error || item.missingContext)
          .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
        navigationTiming,
        resourceTimings,
        resourceTimingsTotal: allResourceTimings.length,
        wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
        bodyText: bodyText.slice(0, 6000),
        bodySample: bodyText.slice(0, 280),
        leadText: leadText.slice(0, 600)
      };
    });

    return {
      ...facts,
      status: response?.status() || null,
      loadSettled,
      loadDurationMs: Date.now() - started
    };
  } finally {
    await page.close();
  }
}

async function installRenderRequestGuard(page, options = {}) {
  if (typeof page?.route === "function") {
    await page.route("**/*", async (route) => {
      const request = typeof route.request === "function" ? route.request() : null;
      const requestUrl = requestUrlFor(request);
      if (await isAllowedRenderRequest(requestUrl, options)) {
        await continueInterceptedRequest(route);
        return;
      }
      await abortInterceptedRequest(route);
    });
    return;
  }

  if (typeof page?.setRequestInterception !== "function" || typeof page?.on !== "function") return;

  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (await isAllowedRenderRequest(requestUrlFor(request), options)) {
      await continueInterceptedRequest(request);
      return;
    }
    await abortInterceptedRequest(request);
  });
}

function requestUrlFor(request) {
  if (!request) return "";
  if (typeof request.url === "function") return request.url();
  return String(request.url || "");
}

async function isAllowedRenderRequest(requestUrl = "", options = {}) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return ["about:", "blob:", "data:"].includes(parsed.protocol);
  }

  const status =
    typeof options.urlGuard === "function" ? options.urlGuard(parsed.href) : publicAuditUrlStatus(parsed.href);
  if (!status.ok) return false;
  if (options.privateDnsGuard && (await options.privateDnsGuard(parsed.hostname))) return false;
  return true;
}

async function continueInterceptedRequest(target) {
  if (typeof target?.continue === "function") await target.continue();
}

async function abortInterceptedRequest(target) {
  if (typeof target?.abort === "function") await target.abort();
}

function extractStaticFacts(html, url, fetchResult = {}) {
  const base = new URL(url);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || "";
  const staticMarkup = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const body = withoutScripts.match(/<body[\s\S]*?<\/body>/i)?.[0] || withoutScripts;
  const bodyText = decodeEntities(stripTags(body)).replace(/\s+/g, " ").trim();
  const contentMarkup = (body.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || body).replace(
    /<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi,
    ""
  );
  const leadText =
    [...contentMarkup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => decodeEntities(stripTags(match[1])).replace(/\s+/g, " ").trim())
      .find((value) => value.split(" ").length >= 8) || "";
  const links = [...staticMarkup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absolute(match[1], base.href),
      rawHref: match[1],
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    }))
    .filter((link) => link.href?.startsWith("http"));
  const images = [...staticMarkup.matchAll(/<img\b[^>]*>/gi)].map((match) => {
    const alt = attr(match[0], "alt");
    return {
      src: absolute(attr(match[0], "src"), base.href),
      alt: alt || "",
      hasAlt: alt !== null,
      role: attr(match[0], "role") || "",
      ariaHidden: attr(match[0], "aria-hidden") === "true",
      width: attr(match[0], "width") || null,
      height: attr(match[0], "height") || null
    };
  });
  const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => ({
    src: absolute(match[1], base.href),
    type: attr(match[0], "type") || "",
    async: attr(match[0], "async") !== null,
    defer: attr(match[0], "defer") !== null
  }));
  const stylesheets = [
    ...html.matchAll(/<link\b(?=[^>]*rel=["'][^"']*stylesheet[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi)
  ].map((match) => ({
    href: absolute(match[1], base.href),
    media: attr(match[0], "media") || ""
  }));
  const schemaTypesFor = (value) => {
    const types = [];
    const visit = (item) => {
      if (!item || typeof item !== "object") return;
      const type = item["@type"];
      if (Array.isArray(type)) types.push(...type.filter(Boolean));
      else if (type) types.push(type);
      for (const key of [
        "@graph",
        "itemListElement",
        "mainEntity",
        "hasPart",
        "review",
        "offers",
        "aggregateRating",
        "breadcrumb"
      ]) {
        const child = item[key];
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    };
    if (Array.isArray(value)) value.forEach(visit);
    else visit(value);
    return types;
  };
  const headings = [];
  for (const match of staticMarkup.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    headings.push({
      level: match[1].toLowerCase(),
      text: decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim()
    });
  }
  const schemaResults = [
    ...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ].map((match, index) => {
    try {
      const parsed = JSON.parse(match[1] || "{}");
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return {
        index: index + 1,
        types: schemaTypesFor(parsed),
        missingContext: values.some((item) => item && !item["@context"])
      };
    } catch {
      return {
        index: index + 1,
        types: ["invalid-json"],
        error: "JSON-LD could not be parsed."
      };
    }
  });

  return {
    source: "static-html",
    finalUrl: url,
    status: fetchResult.status || null,
    title: decodeEntities(stripTags(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")),
    description: meta(head, "name", "description"),
    generator: meta(head, "name", "generator"),
    robots: meta(head, "name", "robots"),
    canonical: absolute(linkRel(head, "canonical"), base.href),
    lang: html.match(/<html\b[^>]*lang=["']([^"']+)["']/i)?.[1] || null,
    viewport: meta(head, "name", "viewport"),
    charset:
      html.match(/<meta\b[^>]*charset=["']?([^"'\s/>]+)/i)?.[1] ||
      (meta(head, "http-equiv", "content-type") || "").match(/charset=([^;]+)/i)?.[1] ||
      null,
    doctype: html.trimStart().toLowerCase().startsWith("<!doctype html") ? "html" : null,
    hreflangs: [
      ...head.matchAll(
        /<link\b(?=[^>]*rel=["'][^"']*alternate[^"']*["'])(?=[^>]*hreflang=["']([^"']+)["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/gi
      )
    ].map((match) => ({
      hreflang: match[1],
      href: absolute(match[2], base.href)
    })),
    h1s: headings.filter((heading) => heading.level === "h1").map((h) => h.text),
    headings,
    links,
    internalLinks: links.filter((link) => new URL(link.href).origin === base.origin),
    externalLinks: links.filter((link) => new URL(link.href).origin !== base.origin),
    images,
    imagesMissingAlt: images.filter((image) => !image.hasAlt),
    scripts,
    stylesheets,
    openGraph: {
      title: meta(head, "property", "og:title"),
      description: meta(head, "property", "og:description"),
      image: absolute(meta(head, "property", "og:image"), base.href),
      url: absolute(meta(head, "property", "og:url"), base.href),
      type: meta(head, "property", "og:type")
    },
    twitter: {
      card: meta(head, "name", "twitter:card"),
      title: meta(head, "name", "twitter:title"),
      description: meta(head, "name", "twitter:description"),
      image: absolute(meta(head, "name", "twitter:image"), base.href)
    },
    favicon: absolute(linkRel(head, "icon"), base.href),
    appleTouchIcon: absolute(linkRel(head, "apple-touch-icon"), base.href),
    schemaTypes: schemaResults.flatMap((item) => item.types || []),
    schemaErrors: schemaResults
      .filter((item) => item.error || item.missingContext)
      .map((item) => item.error || `JSON-LD block ${item.index} is missing @context.`),
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodyText: bodyText.slice(0, 6000),
    bodySample: bodyText.slice(0, 280),
    leadText: leadText.slice(0, 600)
  };
}

function buildFindings({ pages, startUrl, robots, sitemap, performance, declaredImages = [] }) {
  const findings = [];
  let activePage = null;
  const add = (finding) => {
    const pageFields = activePage
      ? {
          pageUrl: activePage.url,
          finalUrl: activePage.finalUrl || activePage.rendered?.finalUrl || activePage.url,
          pageLabel: pathLabel(activePage.url, startUrl)
        }
      : {};
    findings.push({
      id: `${finding.type}-${findings.length + 1}`,
      confidence: finding.confidence || "verified",
      ...pageFields,
      ...finding
    });
  };

  for (const page of pages) {
    activePage = page;
    const rendered = page.rendered;
    const staticFacts = page.static;
    const label = pathLabel(page.url, startUrl);
    const finalUrl = rendered.finalUrl || page.finalUrl || page.url;
    const finalUrlObject = new URL(finalUrl);
    const linkChecks = page.linkChecks || [];
    const imageChecks = page.imageChecks || [];
    const brokenInternalLinks = linkChecks.filter((check) => check.kind === "internal" && isBrokenResource(check));
    const brokenExternalLinks = linkChecks.filter((check) => check.kind === "external" && isBrokenResource(check));
    const redirectedInternalLinks = linkChecks.filter(
      (check) =>
        check.kind === "internal" && !isBrokenResource(check) && !isThrottledResource(check) && check.redirected
    );
    const brokenImages = imageChecks.filter(isBrokenResource);
    const oversizedImages = imageChecks.filter(
      (check) => !isBrokenResource(check) && check.contentLength > RESOURCE_LIMITS.largeImageBytes
    );
    const nonHttpsResources = [...(rendered.links || []), ...(rendered.images || [])].filter(
      (resource) => finalUrlObject.protocol === "https:" && (resource.href || resource.src || "").startsWith("http:")
    );
    const addRenderedGuard = ({ title, evidence, fix, source }) =>
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: ${title}`,
        why: "The raw HTML lacks this, but the page has it once the browser runs its JavaScript. Nothing to fix.",
        evidence,
        fix,
        source: source || DOCS.javascript
      });

    if (page === pages[0]) {
      addPerformanceFindings(add, performance, label);
    }

    for (const finding of resourceWaterfallFindings(page.resourceWaterfall, label, DOCS.coreWebVitals)) {
      add(finding);
    }

    if (brokenInternalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Broken internal links on ${label}`,
        why: "Visitors who click these links land on an error page, and search engines hit a dead end.",
        evidence: formatResourceEvidence(brokenInternalLinks),
        fix: "Point each link at a page that loads, bring the missing page back, or delete the link.",
        source: DOCS.linkBestPractices
      });
    }

    if (brokenExternalLinks.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken external links on ${label}`,
        why: "Links to other sites that error out make the page look neglected.",
        evidence: formatResourceEvidence(brokenExternalLinks),
        fix: "Swap each broken link for a working source, or remove it.",
        source: DOCS.linkBestPractices,
        confidence: "needs-review"
      });
    }

    if (redirectedInternalLinks.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Redirecting internal links on ${label}`,
        why: "Each of these links goes through a redirect before reaching the page. Linking to the final canonical URL saves a hop for visitors and crawlers.",
        evidence: formatResourceEvidence(redirectedInternalLinks),
        fix: "Change each link to the URL it ends up at."
      });
    }

    if (brokenImages.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Broken images on ${label}`,
        why: "Visitors see an empty box, and the image can't show up in image search or share previews.",
        evidence: formatResourceEvidence(brokenImages),
        fix: "Upload the missing files again, point the tags at images that exist, or remove the tags."
      });
    }

    if (oversizedImages.length) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large image files on ${label}`,
        why: "Big image files make the page load slower, most of all on phones.",
        evidence: formatResourceEvidence(oversizedImages),
        fix: "Resize each image to the size it shows on screen, compress it, and save it as WebP or AVIF.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (nonHttpsResources.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Non-HTTPS resources on ${label}`,
        why: "Browsers block or warn about http:// files on an https:// page, so parts of the page may break.",
        evidence: `${nonHttpsResources.length} rendered resources use http://, including ${formatResourceUrl(nonHttpsResources[0].href || nonHttpsResources[0].src)}.`,
        fix: "Change every http:// link, script, image and canonical URL on the page to https://."
      });
    }

    if (page.redirected || stripHash(rendered.finalUrl || page.finalUrl || page.url) !== stripHash(page.url)) {
      add({
        type: "issue",
        severity: "notice",
        title: `URL redirects before rendering on ${label}`,
        why: "This URL redirects. That is fine, but your links, canonical and sitemap should use the final URL.",
        evidence: `Requested ${page.url}; final URL ${rendered.finalUrl || page.finalUrl}.`,
        fix: "Use the final URL in the canonical tag, internal links and sitemap.",
        confidence: "needs-review"
      });
    }

    if (page.redirectChain?.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long redirect chain before rendering on ${label}`,
        why: "Each extra redirect adds a round trip before the page starts loading.",
        evidence: formatRedirectChain(page.redirectChain),
        fix: "Make the first URL redirect straight to the final canonical URL in one step."
      });
    }

    if (rendered.loadSettled !== false && rendered.loadDurationMs > RESOURCE_LIMITS.slowRenderMs) {
      add({
        type: "issue",
        severity: "warning",
        title: `Slow rendered load on ${label}`,
        why: "Visitors wait longer before they can use the page, and some leave.",
        evidence: `Rendered audit reached network idle in ${rendered.loadDurationMs}ms.`,
        fix: "Defer render-blocking scripts the first view doesn't need, compress large files, then rerun the audit to compare load time.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (page.transferSize > RESOURCE_LIMITS.largeHtmlBytes) {
      add({
        type: "issue",
        severity: "notice",
        title: `Large HTML response on ${label}`,
        why: "A heavy HTML file takes longer to download and usually carries data the page doesn't need inline.",
        evidence: `Initial HTML response was about ${formatBytes(page.transferSize)}.`,
        fix: "Move large inline data and scripts into separate files, remove unused markup, and turn on gzip or Brotli compression.",
        source: DOCS.coreWebVitals,
        confidence: "needs-review"
      });
    }

    if (staticFacts.h1s.length === 0 && rendered.h1s.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: H1 exists after render`,
        why: "The H1 is added by JavaScript. Tools that only read raw HTML would call it missing. The page is fine.",
        evidence: `Rendered H1: "${rendered.h1s[0]}"`,
        fix: "No change needed. Don't add a second H1.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.internalLinks.length === 0 && rendered.internalLinks.length > 0) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: internal links exist after render`,
        why: "The links are added by JavaScript. Raw HTML has none, but the loaded page does.",
        evidence: `${rendered.internalLinks.length} rendered internal links found.`,
        fix: "No change needed. Keep them as normal <a href> links.",
        source: DOCS.javascript
      });
    }

    if (staticFacts.wordCount < 50 && rendered.wordCount >= 250) {
      add({
        type: "guard",
        severity: "good",
        title: `False positive guarded on ${label}: rendered content is not thin`,
        why: "Raw HTML has little text, but the loaded page has plenty.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "No change needed.",
        source: DOCS.javascript
      });
    }

    if (!staticFacts.title && rendered.title) {
      addRenderedGuard({
        title: "title exists after render",
        evidence: `Rendered title: "${rendered.title}"`,
        fix: "No change needed. Don't add a second title.",
        source: DOCS.title
      });
    }

    if (!staticFacts.description && rendered.description) {
      addRenderedGuard({
        title: "meta description exists after render",
        evidence: `Rendered description: "${rendered.description}"`,
        fix: "No change needed. Keep the description matching what the page says."
      });
    }

    if (!staticFacts.canonical && rendered.canonical) {
      addRenderedGuard({
        title: "canonical exists after render",
        evidence: `Rendered canonical: ${rendered.canonical}`,
        fix: "No change needed. Don't add a second canonical tag."
      });
    }

    if (!staticFacts.viewport && rendered.viewport) {
      addRenderedGuard({
        title: "viewport exists after render",
        evidence: `Rendered viewport: "${rendered.viewport}"`,
        fix: "No change needed. Don't add a second viewport tag."
      });
    }

    if (
      (!staticFacts.openGraph.image || !staticFacts.twitter.image) &&
      rendered.openGraph.image &&
      rendered.twitter.image
    ) {
      addRenderedGuard({
        title: "social images exist after render",
        evidence: `Rendered og:image: ${rendered.openGraph.image}; twitter:image: ${rendered.twitter.image}`,
        fix: "No change needed. Don't add a second set of social tags."
      });
    }

    if ((staticFacts.schemaTypes || []).length === 0 && rendered.schemaTypes.length > 0) {
      addRenderedGuard({
        title: "structured data exists after render",
        evidence: `Rendered schema types: ${rendered.schemaTypes.join(", ")}`,
        fix: "No change needed. Don't add a second copy of the schema.",
        source: DOCS.structuredData
      });
    }

    if (rendered.schemaErrors?.length) {
      add({
        type: "issue",
        severity: "warning",
        title: `Structured data JSON is invalid on ${label}`,
        why: "Search engines skip schema they can't parse, so this markup does nothing right now.",
        evidence: rendered.schemaErrors.slice(0, 3).join(" "),
        fix: "Fix the JSON syntax error, and make sure each block has @context and an @type that matches what the page shows.",
        source: DOCS.structuredData
      });
    }

    const hreflangIssues = validateHreflang(rendered.hreflangs || [], finalUrl);
    for (const issue of hreflangIssues) {
      add({
        type: "issue",
        severity: issue.severity,
        title: `${issue.title} on ${label}`,
        why: issue.why,
        evidence: issue.evidence,
        fix: issue.fix,
        source: DOCS.hreflang,
        confidence: issue.confidence || "verified"
      });
    }

    const canonicalProbeFailedTransiently = isTransientCanonicalProbeFailure(page.canonicalCheck);
    if (
      rendered.canonical &&
      page.canonicalCheck &&
      isBrokenResource(page.canonicalCheck) &&
      !canonicalProbeFailedTransiently
    ) {
      add({
        type: "issue",
        severity: "warning",
        title: `Canonical URL is not reachable on ${label}`,
        why: "The canonical tag points at a URL that doesn't load, so search engines can't follow it.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Change the canonical href to the live URL of this page, or bring the target page back.",
        source: DOCS.javascript
      });
    } else if (rendered.canonical && page.canonicalCheck?.redirected && !canonicalProbeFailedTransiently) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical URL redirects on ${label}`,
        why: "The canonical tag points at a URL that redirects. It should name the final URL.",
        evidence: formatResourceEvidence([page.canonicalCheck]),
        fix: "Change the canonical href to the URL the redirect ends at."
      });
    }

    if (
      rendered.canonical &&
      rendered.openGraph?.url &&
      canonicalKey(rendered.canonical) !== canonicalKey(rendered.openGraph.url)
    ) {
      add({
        type: "issue",
        severity: "notice",
        title: `Canonical and og:url disagree on ${label}`,
        why: "The canonical tag and og:url name different URLs for the same page.",
        evidence: `Canonical: ${rendered.canonical}; og:url: ${rendered.openGraph.url}.`,
        fix: "Set og:url to the same URL as the canonical tag.",
        confidence: "needs-review"
      });
    }

    if (rendered.canonical && (rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Canonical conflicts with noindex on ${label}`,
        why: "The page points search engines to a preferred URL and also tells them not to index it. Those two tags contradict each other.",
        evidence: `Canonical: ${rendered.canonical}; robots meta: "${rendered.robots}".`,
        fix: "If the page should be in search, remove noindex. If it shouldn't, remove the canonical tag."
      });
    }

    if (!rendered.title || rendered.title.length < 12) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing or weak title on ${label}`,
        why: "The title is the clickable headline in search results and the text on the browser tab.",
        evidence: rendered.title ? `Current title: "${rendered.title}"` : "No title found.",
        fix: "Write a title that names what this page offers, used on no other page.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(suggestTitle(page.url, rendered))}</title>`
      });
    } else if (rendered.title.length > 65) {
      add({
        type: "issue",
        severity: "warning",
        title: `Long title on ${label}`,
        why: "Search results cut off long titles, so the end of this one won't show.",
        evidence: `${rendered.title.length} characters: "${rendered.title}"`,
        fix: "Cut the title to about 60 characters and put the main topic first.",
        source: DOCS.title,
        snippet: `<title>${escapeHtml(trimSentence(rendered.title, 58))}</title>`
      });
    }

    if (!rendered.description) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing meta description on ${label}`,
        why: "Search engines often use the meta description as the text under your link in results.",
        evidence: "No meta description found in the rendered page.",
        fix: "Add a meta description of 1 to 2 sentences that says what this page offers.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    } else if (rendered.description.length < 70 || rendered.description.length > 165) {
      add({
        type: "issue",
        severity: "warning",
        title: `Meta description needs tightening on ${label}`,
        why: "Search engines may rewrite your description, but they start from yours when it's clear.",
        evidence: `${rendered.description.length} characters: "${rendered.description}"`,
        fix: "Rewrite it in 1 to 2 sentences that say what the page offers and who it's for.",
        source: DOCS.snippets,
        snippet: `<meta name="description" content="${escapeHtml(suggestDescription(rendered))}" />`
      });
    }

    if (!rendered.h1s.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `Missing H1 on ${label}`,
        why: "The H1 is the main heading. It tells visitors and search engines what the page is about.",
        evidence: "No rendered H1 found.",
        fix: "Add one H1 at the top of the page that names its topic.",
        source: DOCS.javascript,
        snippet: `<h1>${escapeHtml(suggestTitle(page.url, rendered))}</h1>`
      });
    } else if (rendered.h1s.length > 1) {
      add({
        type: "issue",
        severity: "warning",
        title: `Multiple H1s on ${label}`,
        why: "More than one H1 makes it less clear which heading is the page's main topic.",
        evidence: `${rendered.h1s.length} rendered H1s: ${rendered.h1s.join(" | ")}`,
        fix: "Keep one H1 and change the other headings to H2."
      });
    }

    const hierarchyIssue = headingHierarchyIssue(rendered.headings || []);
    if (hierarchyIssue) {
      add({
        type: "issue",
        severity: "warning",
        title: `Heading hierarchy needs cleanup on ${label}`,
        why: "Headings skip levels or start below H1, so screen readers and search engines get a muddled outline of the page.",
        evidence: hierarchyIssue,
        fix: "Use one H1, then H2 for sections and H3 inside them. Don't skip a level.",
        confidence: "needs-review"
      });
    }

    if (rendered.wordCount < 250) {
      add({
        type: "issue",
        severity: "warning",
        title: `Thin rendered content on ${label}`,
        why: "The page has very little text. That is a rule of thumb, not a ranking rule, but short pages often don't answer what the searcher wanted.",
        evidence: `${rendered.wordCount} rendered words found.`,
        fix: "Add the details a buyer needs: what it is, who it's for, price or process, and what to do next.",
        confidence: "needs-review"
      });
    }

    if (!rendered.internalLinks.length) {
      add({
        type: "issue",
        severity: "critical",
        title: `No rendered internal links on ${label}`,
        why: "Search engines find your other pages by following links. This page links to none.",
        evidence: "No internal anchor links found in the rendered DOM.",
        fix: "Add normal <a href> links to your main related pages.",
        source: DOCS.javascript
      });
    }

    if (!rendered.canonical) {
      add({
        type: "issue",
        severity: "warning",
        title: `Missing canonical URL on ${label}`,
        why: "A canonical tag tells search engines which URL to show when the same page is reachable at more than one address.",
        evidence: "No rendered rel=canonical tag found.",
        fix: "Add a canonical tag with this page's preferred URL.",
        source: DOCS.javascript,
        snippet: `<link rel="canonical" href="${page.url}" />`
      });
    }

    if (!rendered.viewport) {
      add({
        type: "issue",
        severity: "warning",
        title: `Viewport meta tag missing on ${label}`,
        why: "Without a viewport tag, mobile phones show the page zoomed out at desktop width.",
        evidence: "No rendered viewport meta tag found.",
        fix: "Add a viewport meta tag set to width=device-width, initial-scale=1 in the head.",
        snippet: '<meta name="viewport" content="width=device-width, initial-scale=1" />'
      });
    }

    if (!rendered.lang) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML language missing on ${label}`,
        why: "The lang attribute tells browsers, screen readers and translation tools what language the page is in.",
        evidence: "No lang attribute found on the rendered html element.",
        fix: 'Add a truthful language code such as <html lang="en">.',
        snippet: '<html lang="en">'
      });
    }

    if (!rendered.charset) {
      add({
        type: "issue",
        severity: "notice",
        title: `Character encoding missing on ${label}`,
        why: "Without a charset, some browsers show accented letters and symbols as garbled text.",
        evidence: "No rendered charset could be confirmed.",
        fix: "Declare UTF-8 as the first tag in the head.",
        snippet: '<meta charset="utf-8" />'
      });
    }

    if (!rendered.doctype) {
      add({
        type: "issue",
        severity: "notice",
        title: `HTML doctype missing on ${label}`,
        why: "Without a doctype, browsers fall back to an old layout mode and the page can display differently.",
        evidence: "No HTML doctype was found before rendering.",
        fix: "Start the document with <!doctype html>.",
        snippet: "<!doctype html>"
      });
    }

    const robotsHeader = headerValue(page.headers, "x-robots-tag");
    if ((rendered.robots || "").toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Noindex found on ${label}`,
        why: "This tag tells search engines to keep the page out of results.",
        evidence: `Robots meta: "${rendered.robots}"`,
        fix: "If this page should show up in search, remove the noindex tag or header."
      });
    } else if (robotsHeader.toLowerCase().includes("noindex")) {
      add({
        type: "issue",
        severity: "critical",
        title: `Noindex found on ${label}`,
        why: "Your server sends a header that tells search engines to keep the page out of results. It's invisible in the page source, so it's easy to miss.",
        evidence: `X-Robots-Tag response header: "${robotsHeader}"`,
        fix: "If this page should show up in search, remove the noindex tag or header."
      });
    }

    if (!rendered.openGraph.image || !rendered.twitter.image) {
      add({
        type: "issue",
        severity: "warning",
        title: `Social share image incomplete on ${label}`,
        why: "Links to this page shared on social apps or in chats show no image. This doesn't affect rankings.",
        evidence: `og:image: ${rendered.openGraph.image || "missing"}; twitter:image: ${
          rendered.twitter.image || "missing"
        }`,
        fix: "Add og:image and twitter:image tags pointing at a 1200x630 image.",
        snippet: buildSocialSnippet(page.url, rendered, declaredImages)
      });
    } else {
      const brokenSocialImages = declaredImages.filter(
        (check) => check.pageUrl === page.url && (check.key === "og" || check.key === "twitter") && !check.ok
      );
      if (brokenSocialImages.length) {
        const reasons = brokenSocialImages
          .map((check) => {
            const label = check.key === "og" ? "og:image" : "twitter:image";
            if (check.error) return `${label} (${check.url}): ${check.error}`;
            if (!check.ok && check.contentType) {
              return `${label} (${check.url}): returned ${check.status || "no status"} with content-type ${check.contentType}`;
            }
            return `${label} (${check.url}): returned ${check.status || "no status"}`;
          })
          .join("; ");
        add({
          type: "issue",
          severity: "warning",
          title: `Social share image is not loadable on ${label}`,
          why: "The share image tag points at a file that doesn't load as an image, so share previews show no picture. This doesn't affect rankings.",
          evidence: reasons,
          fix: "Point each share image tag at a 1200x630 image that loads, or remove the tag.",
          snippet: buildSocialSnippet(page.url, rendered, declaredImages),
          confidence: "needs-review"
        });
      }
    }

    const declaredAppleIcon = rendered.appleTouchIcon
      ? declaredImages.find((check) => check.key === "apple-touch-icon" && check.url === rendered.appleTouchIcon)
      : null;
    if (!rendered.appleTouchIcon) {
      add({
        type: "issue",
        severity: "notice",
        title: `Apple touch icon missing on ${label}`,
        why: "When someone saves the page to a mobile home screen, it shows a blank tile. This doesn't affect rankings.",
        evidence: "No apple-touch-icon link found.",
        fix: 'Add a 180x180 PNG icon and link it with <link rel="apple-touch-icon">.',
        snippet: buildAppleTouchIconSnippet(page.url, declaredImages)
      });
    } else if (declaredAppleIcon && !declaredAppleIcon.ok) {
      const reason = declaredAppleIcon.error
        ? declaredAppleIcon.error
        : declaredAppleIcon.contentType
          ? `returned ${declaredAppleIcon.status || "no status"} with content-type ${declaredAppleIcon.contentType}`
          : `returned ${declaredAppleIcon.status || "no status"}`;
      add({
        type: "issue",
        severity: "notice",
        title: `Apple touch icon is not loadable on ${label}`,
        why: "The icon tag points at a file that doesn't load as an image, so the home-screen tile is blank. This doesn't affect rankings.",
        evidence: `apple-touch-icon (${declaredAppleIcon.url}): ${reason}`,
        fix: "Point the apple-touch-icon link at a square PNG that loads, or remove the tag.",
        snippet: buildAppleTouchIconSnippet(page.url, declaredImages),
        confidence: "needs-review"
      });
    }

    if (rendered.images.length > 0 && rendered.imagesMissingAlt.length > 0) {
      add({
        type: "issue",
        severity: "warning",
        title: `Images missing alt attributes on ${label}`,
        why: "Screen readers read alt text aloud, and search engines use it to understand the image.",
        evidence: `${rendered.imagesMissingAlt.length}/${rendered.images.length} images have no alt attribute. Intentionally empty alt="" images are treated as decorative, not scored.`,
        fix: 'Describe each meaningful image in a few words. Give purely decorative images alt="".',
        confidence: "needs-review"
      });
    }

    if (!rendered.schemaTypes.length || rendered.schemaTypes.every((type) => type === "invalid-json")) {
      add({
        type: "enhancement",
        severity: "notice",
        title: `Structured data opportunity on ${label}`,
        why: "Schema markup can make the page eligible for extra details in search results, such as ratings or prices.",
        evidence: "No JSON-LD structured data found.",
        fix: "Add JSON-LD schema that describes only what the page shows.",
        source: DOCS.structuredData,
        snippet: buildSchemaSnippet(page.url, rendered)
      });
    }

    if (finalUrlObject.protocol === "http:" && !isLocalhost(finalUrlObject.hostname)) {
      add({
        type: "issue",
        severity: "warning",
        title: `Page is not served over HTTPS on ${label}`,
        why: 'Browsers mark http:// pages as "Not secure", which puts visitors off.',
        evidence: `Final rendered URL uses ${finalUrlObject.protocol}//.`,
        fix: "Turn on HTTPS, redirect every http:// URL to https://, and use https:// in the canonical tag and sitemap."
      });
    }

    const capturedHeaderCount = Object.keys(page.headers || {}).length;
    const missingSecurityHeaders = capturedHeaderCount ? missingBasicSecurityHeaders(page.headers) : [];
    if (page === pages[0] && missingSecurityHeaders.length) {
      add({
        type: "issue",
        severity: "notice",
        title: "Basic security headers missing",
        why: "These headers stop other sites from framing your pages and stop browsers from guessing file types. Google counts a safe site as part of page experience, and visitors trust it more.",
        evidence: `The HTML response did not include: ${missingSecurityHeaders.map((item) => item.label).join(", ")}.`,
        fix: "Add these headers in your host or CDN settings (for example Cloudflare Transform Rules, Netlify _headers, or Vercel headers). They apply to every page at once.",
        snippet: missingSecurityHeaders.map((item) => item.snippet).join("\n"),
        confidence: "needs-review",
        acceptance:
          "The homepage response includes X-Content-Type-Options, a frame-ancestors or X-Frame-Options rule, and a Referrer-Policy."
      });
    }
    if (
      capturedHeaderCount > 0 &&
      finalUrlObject.protocol === "https:" &&
      !headerValue(page.headers, "strict-transport-security")
    ) {
      add({
        type: "issue",
        severity: "notice",
        title: `HSTS security header missing on ${label}`,
        why: "This header tells browsers to always use HTTPS for your site, even if someone types http://.",
        evidence: "The initial HTML response did not include a strict-transport-security header.",
        fix: "First confirm every page on the domain works over HTTPS. Then add a Strict-Transport-Security header.",
        confidence: "needs-review"
      });
    }
  }
  activePage = null;

  if (!robots.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Robots.txt not found",
      why: "Search engines check /robots.txt first to see what they may crawl and where your sitemap is.",
      evidence: `GET /robots.txt returned ${robots.status || "no response"}.`,
      fix: "Add a robots.txt file at the site root with a Sitemap: line.",
      snippet: "User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml"
    });
  }

  const access = robotsAccess(robots, pages[0]?.url || startUrl);
  if (access?.blockedSearch.length) {
    add({
      type: "issue",
      severity: "critical",
      title: "Robots.txt blocks search engines from your site",
      why: "Search engines obey robots.txt. While this rule stays, your pages can drop out of Google and Bing results.",
      evidence: `For ${access.path}, robots.txt blocks ${describeBlocked(access.blockedSearch)}.`,
      fix: "Remove the Disallow rule that covers your public pages. Keep Disallow only for private areas like /admin or /cart.",
      snippet: `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", startUrl).href}`,
      acceptance: "The robots.txt tester shows Googlebot and Bingbot allowed on your homepage."
    });
  }
  if (access && sitemap.ok && !access.sitemaps.length) {
    add({
      type: "issue",
      severity: "notice",
      title: "Robots.txt does not list your sitemap",
      why: "A Sitemap: line in robots.txt is how every search engine and AI crawler finds your sitemap without being told.",
      evidence: "robots.txt loads but has no Sitemap: line.",
      fix: "Add a Sitemap: line with the full URL of your sitemap to the end of robots.txt.",
      snippet: `Sitemap: ${new URL("/sitemap.xml", startUrl).href}`
    });
  }

  if (!sitemap.ok) {
    add({
      type: "issue",
      severity: "warning",
      title: "Sitemap not found",
      why: "A sitemap lists the pages you want search engines to find.",
      evidence: `GET /sitemap.xml returned ${sitemap.status || "no response"}.`,
      fix: "Publish /sitemap.xml listing your public pages, and add its URL to robots.txt."
    });
  }

  return findings;
}

function buildRepairPlan(findings) {
  return findings
    .filter((finding) => finding.severity !== "good")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding, index) => ({
      priority: index + 1,
      severity: finding.severity,
      title: finding.title,
      pageUrl: finding.pageUrl || null,
      pageLabel: finding.pageLabel || null,
      proof: finding.evidence,
      fix: finding.fix,
      confidence: finding.confidence || "verified",
      source: finding.source || null,
      snippet: finding.snippet || null,
      estimatedEffort: estimatedEffort(finding),
      workType: workType(finding),
      acceptance: finding.acceptance || acceptanceCheck(finding)
    }));
}

function mergeRepairPlans(basePlan = [], extraItems = []) {
  const merged = [...basePlan, ...(extraItems || [])];
  return merged.map((item, index) => ({
    ...item,
    priority: index + 1
  }));
}

function buildRepairBrief({
  startUrl,
  score,
  summary,
  pages,
  findings,
  repairPlan,
  performance,
  competitorBenchmark,
  crawlInventory,
  renderedCrawlScale,
  crawlIntelligence,
  backlinkAudit,
  localSeoAudit,
  keywordRankAudit,
  platformSeoAudit,
  aiAnswerReadiness,
  growthOpportunities,
  geoReadiness
}) {
  const lines = [
    "# SEO Fix Kit repair brief",
    "",
    `Site: ${startUrl}`,
    `Scanned pages: ${summary.pagesScanned}`,
    `Score: ${score}/100`,
    `Issues: ${summary.critical} critical, ${summary.warnings} warnings, ${summary.notices} notices`,
    `False positives avoided: ${summary.guardedFalsePositives}`,
    ""
  ];

  if (!repairPlan.length) {
    lines.push("## Fix order", "", "No critical repairs found in this scan.", "");
  } else {
    lines.push("## Fix order", "");
    for (const item of repairPlan) {
      lines.push(`${item.priority}. [${item.severity}] ${item.title}`);
      lines.push(`   Proof: ${item.proof}`);
      lines.push(`   Fix: ${item.fix}`);
      lines.push(`   Acceptance check: ${item.acceptance}`);
      if (item.snippet) {
        lines.push("", "```html", fenceSafe(item.snippet), "```", "");
      }
    }
  }

  const guarded = findings.filter((finding) => finding.severity === "good");
  if (guarded.length) {
    lines.push("## Do not fix these false positives", "");
    for (const finding of guarded) {
      lines.push(`- ${finding.title}: ${finding.evidence}`);
    }
    lines.push("");
  }

  if (pages[0]?.rendered) {
    const facts = pages[0].rendered;
    lines.push("## Rendered proof snapshot", "");
    lines.push(`- Rendered title: ${facts.title || "missing"}`);
    lines.push(`- Rendered description: ${facts.description || "missing"}`);
    lines.push(`- Rendered H1s: ${facts.h1s?.join(" | ") || "none"}`);
    lines.push(`- Rendered word count: ${facts.wordCount ?? "unknown"}`);
    lines.push(`- Rendered internal links: ${facts.internalLinks?.length ?? 0}`);
    lines.push(`- Broken rendered links: ${pages[0].linkChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(`- Broken rendered images: ${pages[0].imageChecks?.filter(isBrokenResource).length ?? 0}`);
    lines.push(
      `- Rendered load time: ${facts.loadDurationMs ?? "unknown"}ms${facts.loadSettled === false ? " (network idle never reached; snapshot taken after the audit's fallback wait)" : ""}`
    );
    lines.push(`- Rendered schema types: ${facts.schemaTypes?.join(", ") || "none"}`);
    lines.push("");
  }

  if (performance && performance.status !== "skipped") {
    lines.push("## Performance proof snapshot", "");
    lines.push(`- Source: ${performance.source || "rendered-lab"}`);
    if (Number.isFinite(performance.performanceScore)) {
      lines.push(`- Mobile PageSpeed score: ${performance.performanceScore}/100`);
    }
    const metrics = performance.labMetrics || {};
    if (metrics.largestContentfulPaint?.display) lines.push(`- LCP: ${metrics.largestContentfulPaint.display}`);
    if (metrics.totalBlockingTime?.display) lines.push(`- TBT: ${metrics.totalBlockingTime.display}`);
    if (metrics.cumulativeLayoutShift?.display) lines.push(`- CLS: ${metrics.cumulativeLayoutShift.display}`);
    if (metrics.speedIndex?.display) lines.push(`- Speed Index: ${metrics.speedIndex.display}`);
    if (performance.fieldData?.overallCategory) {
      lines.push(`- Field data category: ${performance.fieldData.overallCategory}`);
    }
    if (performance.opportunities?.length) {
      lines.push(
        `- Top opportunity: ${performance.opportunities[0].title} (${performanceOpportunityEvidence(performance.opportunities[0])})`
      );
    }
    if (performance.reason) lines.push(`- Note: ${performance.reason}`);
    lines.push("");
  }

  lines.push(...resourceWaterfallBriefLines(pages[0]?.resourceWaterfall));
  lines.push(...competitorBenchmarkBriefLines(competitorBenchmark));
  lines.push(...crawlInventoryBriefLines(crawlInventory));
  lines.push(...renderedCrawlScaleBriefLines(renderedCrawlScale));
  lines.push(...crawlIntelligenceBriefLines(crawlIntelligence));
  lines.push(...backlinkAuditBriefLines(backlinkAudit));
  lines.push(...localSeoAuditBriefLines(localSeoAudit));
  lines.push(...keywordRankAuditBriefLines(keywordRankAudit));
  lines.push(...platformSeoAuditBriefLines(platformSeoAudit));
  lines.push(...aiAnswerReadinessBriefLines(aiAnswerReadiness));
  lines.push(...growthOpportunitiesBriefLines(growthOpportunities));
  lines.push(...geoReadinessBriefLines(geoReadiness));

  lines.push("Re-run SEO Fix Kit after shipping changes and keep only fixes that match visible page content.");
  return lines.join("\n");
}

function buildFixPack(page, origin, findings = [], declaredImages = []) {
  if (!page) return [];
  const issueFixes = findings
    .filter((finding) => finding.severity !== "good" && finding.snippet)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding) => ({
      title: `Fix: ${finding.title}`,
      body: `${finding.fix} Proof: ${finding.evidence}`,
      snippet: finding.snippet
    }));

  return [
    ...issueFixes,
    {
      title: "Social preview tags",
      body: "Use this when og:image or twitter:image is missing.",
      snippet: buildSocialSnippet(page.url, page.rendered, declaredImages)
    },
    {
      title: "Canonical tag",
      body: "Use this when the page has one preferred public URL.",
      snippet: `<link rel="canonical" href="${page.url}" />`
    },
    {
      title: "Basic WebSite schema",
      body: "Use truthful schema that matches visible content.",
      snippet: buildSchemaSnippet(origin, page.rendered)
    }
  ].filter(dedupeFix);
}

function severityRank(severity) {
  return { critical: 0, warning: 1, notice: 2, good: 3 }[severity] ?? 4;
}

function acceptanceCheck(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title")) {
    return "The page has its own title that names its topic and isn't cut off in search results.";
  }
  if (title.includes("description")) {
    return "The page has one meta description of about 70 to 165 characters.";
  }
  if (title.includes("h1")) {
    return "The page shows one H1 that names its main topic.";
  }
  if (title.includes("internal links")) {
    return "The loaded page has normal <a href> links to your important pages.";
  }
  if (title.includes("broken") && title.includes("link")) {
    return "Every link listed here now loads, or you removed it on purpose.";
  }
  if (title.includes("broken") && title.includes("image")) {
    return "Every image listed here now loads, or you removed it on purpose.";
  }
  if (title.includes("redirecting internal")) {
    return "Internal links go straight to the final URL with no redirect.";
  }
  if (title.includes("canonical conflicts")) {
    return "The page has either noindex or a canonical tag pointing elsewhere, not both.";
  }
  if (title.includes("noindex")) {
    return "Pages you want in search have no noindex tag or header.";
  }
  if (title.includes("canonical")) {
    return "The page has one canonical tag with its preferred URL.";
  }
  if (title.includes("hreflang")) {
    return "Each hreflang code appears once, is valid, includes this page, and points at a page that loads.";
  }
  if (title.includes("json")) {
    return "The JSON-LD parses without errors and has @context and an @type that matches the page.";
  }
  if (title.includes("https") || title.includes("hsts") || title.includes("security")) {
    return "The page loads over HTTPS, sends the security headers, and loads no http:// files.";
  }
  if (
    title.includes("pagespeed") ||
    title.includes("largest contentful paint") ||
    title.includes("total blocking time") ||
    title.includes("layout shift")
  ) {
    return "A rerun shows the PageSpeed numbers in the passing range and this problem gone.";
  }
  if (title.includes("slow") || title.includes("large image") || title.includes("large html")) {
    return "A rerun shows a smaller download or faster load. Then check real-user Core Web Vitals in Search Console.";
  }
  if (title.includes("social share")) {
    return "The page has og:image and twitter:image tags pointing at a 1200x630 image.";
  }
  if (title.includes("apple touch")) {
    return "The page links an Apple touch icon that loads.";
  }
  if (title.includes("alt")) {
    return 'Meaningful images have alt text. Decorative images have alt="".';
  }
  if (title.includes("structured data")) {
    return "The JSON-LD is valid and describes only what the page shows.";
  }
  if (title.includes("viewport")) {
    return "The page has a viewport meta tag with width=device-width.";
  }
  if (title.includes("language")) {
    return "The <html> tag has the right lang attribute.";
  }
  if (title.includes("encoding")) {
    return 'The page declares UTF-8 with <meta charset="utf-8">.';
  }
  if (title.includes("doctype")) {
    return "The HTML starts with <!doctype html>.";
  }
  if (title.includes("redirect")) {
    return "The canonical tag, sitemap and internal links all use the final URL.";
  }
  if (title.includes("robots.txt")) {
    return "/robots.txt loads and includes a Sitemap: line.";
  }
  if (title.includes("sitemap")) {
    return "/sitemap.xml loads and lists the pages you want in search.";
  }
  return "Rerun the audit. This problem is gone, or marked needs review with the reason shown.";
}

function dedupeFix(fix, index, fixes) {
  return fixes.findIndex((item) => item.snippet === fix.snippet) === index;
}

function fenceSafe(value) {
  return String(value || "").replaceAll("```", "` ` `");
}

function buildSocialSnippet(url, facts, declaredImages = []) {
  const title = escapeHtml(facts.title || suggestTitle(url, facts));
  const description = escapeHtml(facts.description || suggestDescription(facts));
  const origin = new URL(url).origin;
  const liveImage =
    declaredImages.find((check) => check.key === "og" && check.ok && check.url.startsWith(origin)) ||
    declaredImages.find((check) => check.key === "twitter" && check.ok && check.url.startsWith(origin));
  const image = liveImage ? liveImage.url : `${origin}/og-image.png`;
  const placeholderNote = liveImage
    ? ""
    : `<!-- The audited page had no working og:image. Create ${origin}/og-image.png (1200x630) or replace it with your real share image. -->\n`;
  return [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ]
    .join("\n")
    .replace(/^/, placeholderNote);
}

function buildAppleTouchIconSnippet(url, declaredImages = []) {
  const origin = new URL(url).origin;
  const verified = declaredImages.find(
    (check) =>
      (check.key === "apple-touch-icon" || check.key === "apple-touch-icon-probe") &&
      check.ok &&
      check.url.startsWith(`${origin}/`)
  );
  const href = verified ? verified.url : `${origin}/apple-touch-icon.png`;
  const note = verified
    ? `<!-- ${verified.url} was verified to load as an image during this audit. Apple expects a square PNG, ideally 180x180. -->\n`
    : `<!-- No icon file loaded at ${origin}/apple-touch-icon.png during this audit. Create a square 180x180 PNG there, or point href at your real icon file, before shipping this tag. -->\n`;
  return `${note}<link rel="apple-touch-icon" href="${href}" />`;
}

function buildSchemaSnippet(url, facts) {
  const origin = new URL(url).origin;
  return `<script type="application/ld+json">\n${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: facts.title || new URL(url).hostname,
      url: origin,
      description: facts.description || suggestDescription(facts)
    },
    null,
    2
  )}\n</script>`;
}

function shouldRunPageSpeed(startUrl, options = {}) {
  if (options.pageSpeed === false || options.disabled) return false;
  if (options.pageSpeed === true) return true;
  const parsed = new URL(startUrl);
  return ["http:", "https:"].includes(parsed.protocol) && !isLocalhost(parsed.hostname);
}

function parsePageSpeedResult(raw = {}) {
  const lighthouse = raw.lighthouseResult || {};
  const audits = lighthouse.audits || {};
  const rawScore = lighthouse.categories?.performance?.score;
  const performanceScore = Number.isFinite(rawScore) ? Math.round(rawScore * 100) : null;
  const labMetrics = {
    firstContentfulPaint: metricFromAudit(audits["first-contentful-paint"]),
    largestContentfulPaint: metricFromAudit(audits["largest-contentful-paint"]),
    totalBlockingTime: metricFromAudit(audits["total-blocking-time"]),
    cumulativeLayoutShift: metricFromAudit(audits["cumulative-layout-shift"]),
    speedIndex: metricFromAudit(audits["speed-index"])
  };
  const fieldMetrics = parseFieldMetrics(raw.loadingExperience);
  return {
    analysisTimestamp: raw.analysisUTCTimestamp || "",
    finalUrl: raw.id || "",
    performanceScore,
    category: scoreCategory(performanceScore),
    fieldData: {
      overallCategory: raw.loadingExperience?.overall_category || "",
      originFallback: Boolean(raw.loadingExperience?.origin_fallback),
      metrics: fieldMetrics
    },
    labMetrics,
    opportunities: topPageSpeedOpportunities(audits)
  };
}

function metricFromAudit(audit = {}) {
  return {
    title: audit.title || "",
    value: Number(audit.numericValue || 0),
    display: audit.displayValue || formatMetricValue(audit.numericValue),
    score: typeof audit.score === "number" ? Math.round(audit.score * 100) : null
  };
}

function parseFieldMetrics(loadingExperience = {}) {
  const metrics = loadingExperience.metrics || {};
  return {
    largestContentfulPaint: fieldMetric(metrics.LARGEST_CONTENTFUL_PAINT_MS, "ms"),
    interactionToNextPaint: fieldMetric(metrics.INTERACTION_TO_NEXT_PAINT, "ms"),
    cumulativeLayoutShift: fieldMetric(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, "ratio"),
    firstContentfulPaint: fieldMetric(metrics.FIRST_CONTENTFUL_PAINT_MS, "ms")
  };
}

function fieldMetric(metric, unit) {
  if (!metric) return null;
  const percentile = unit === "ratio" ? Number(metric.percentile || 0) / 100 : Number(metric.percentile || 0);
  return {
    percentile,
    display: unit === "ratio" ? percentile.toFixed(2) : `${Math.round(percentile)}ms`,
    category: metric.category || ""
  };
}

function topPageSpeedOpportunities(audits = {}) {
  const ids = [
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "unminified-javascript",
    "unminified-css",
    "modern-image-formats",
    "uses-optimized-images",
    "uses-responsive-images",
    "offscreen-images",
    "total-byte-weight",
    "server-response-time",
    "largest-contentful-paint-element"
  ];
  return ids
    .map((id) => {
      const audit = audits[id];
      if (!audit) return null;
      const savingsMs = Number(audit.details?.overallSavingsMs || 0);
      const savingsBytes = Number(audit.details?.overallSavingsBytes || 0);
      const score = typeof audit.score === "number" ? audit.score : null;
      const hasSavings = savingsMs > 0 || savingsBytes > 0;
      const failed = score !== null && score < 0.9;
      if (!hasSavings && !failed) return null;
      return {
        id,
        title: audit.title || id,
        description: audit.description || "",
        displayValue: audit.displayValue || "",
        score: score === null ? null : Math.round(score * 100),
        savingsMs,
        savingsBytes
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes)
    .slice(0, 5);
}

function buildRenderedPerformanceSummary(homePage) {
  const rendered = homePage?.rendered || {};
  return {
    performanceScore: null,
    category: "",
    fieldData: {
      overallCategory: "",
      originFallback: false,
      metrics: {}
    },
    labMetrics: {
      renderedLoad: {
        title: "Rendered browser load",
        value: Number(rendered.loadDurationMs || 0),
        display: rendered.loadDurationMs ? `${Math.round(rendered.loadDurationMs)}ms` : "unknown",
        score: null
      },
      htmlTransfer: {
        title: "Initial HTML transfer",
        value: Number(homePage?.transferSize || 0),
        display: formatBytes(homePage?.transferSize || 0),
        score: null
      }
    },
    opportunities: []
  };
}

function addPerformanceFindings(add, performance = {}, label) {
  if (!performance || performance.status === "skipped") return;
  if (performance.status === "unavailable") {
    return;
  }

  if (
    Number.isFinite(performance.performanceScore) &&
    performance.performanceScore < PERFORMANCE_LIMITS.needsImprovementScore
  ) {
    add({
      type: "performance",
      severity: performance.performanceScore < PERFORMANCE_LIMITS.poorScore ? "critical" : "warning",
      title: `Low mobile PageSpeed performance on ${label}`,
      why: "Slow pages lose visitors, and Google uses page experience as one ranking signal.",
      evidence: `Mobile PageSpeed performance score is ${performance.performanceScore}/100 (${performance.category || "unknown"}).`,
      fix: "Work through the PageSpeed items in this report, then rerun until the mobile score is 75 or higher.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const lcp = performance.labMetrics?.largestContentfulPaint;
  if (lcp?.value > PERFORMANCE_LIMITS.lcpNeedsImprovementMs) {
    add({
      type: "performance",
      severity: lcp.value > PERFORMANCE_LIMITS.lcpPoorMs ? "critical" : "warning",
      title: `Slow Largest Contentful Paint on ${label}`,
      why: "LCP is when the biggest thing on screen, usually the hero image or headline, finishes loading. Here it takes too long.",
      evidence: `PageSpeed lab LCP is ${lcp.display || `${Math.round(lcp.value)}ms`}.`,
      fix: "Compress and resize the hero image, preload it, and defer scripts and styles the first view doesn't need.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const tbt = performance.labMetrics?.totalBlockingTime;
  if (tbt?.value > PERFORMANCE_LIMITS.tbtNeedsImprovementMs) {
    add({
      type: "performance",
      severity: tbt.value > PERFORMANCE_LIMITS.tbtPoorMs ? "critical" : "warning",
      title: `High Total Blocking Time on ${label}`,
      why: "JavaScript keeps the page busy, so taps and clicks respond late.",
      evidence: `PageSpeed lab TBT is ${tbt.display || `${Math.round(tbt.value)}ms`}.`,
      fix: "Remove scripts you don't use, defer the rest, and cut third-party widgets you can live without.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  const cls = performance.labMetrics?.cumulativeLayoutShift;
  if (cls?.value > PERFORMANCE_LIMITS.clsNeedsImprovement) {
    add({
      type: "performance",
      severity: cls.value > PERFORMANCE_LIMITS.clsPoor ? "critical" : "warning",
      title: `Layout shift risk on ${label}`,
      why: "Content jumps around while the page loads, so visitors tap the wrong thing.",
      evidence: `PageSpeed lab CLS is ${cls.display || cls.value.toFixed(2)}.`,
      fix: "Set width and height on images, ads and embeds so the space is held before they load.",
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }

  for (const opportunity of performance.opportunities || []) {
    add({
      type: "performance",
      severity: opportunity.savingsMs > 1000 || opportunity.savingsBytes > 250_000 ? "warning" : "notice",
      title: `${opportunity.title} on ${label}`,
      why: "Google PageSpeed measured this as slowing the page down.",
      evidence: performanceOpportunityEvidence(opportunity),
      fix: performanceOpportunityFix(opportunity),
      source: DOCS.coreWebVitals,
      confidence: "needs-review"
    });
  }
}

function performanceOpportunityEvidence(opportunity) {
  const savings = [];
  if (opportunity.savingsMs) savings.push(`${Math.round(opportunity.savingsMs)}ms potential savings`);
  if (opportunity.savingsBytes) savings.push(`${formatBytes(opportunity.savingsBytes)} potential transfer savings`);
  if (opportunity.displayValue) savings.push(opportunity.displayValue);
  if (opportunity.score !== null) savings.push(`audit score ${opportunity.score}/100`);
  return savings.join("; ") || opportunity.title;
}

function performanceOpportunityFix(opportunity) {
  const id = opportunity.id || "";
  if (id.includes("render-blocking"))
    return "Inline the CSS the first view needs, and defer other CSS and JavaScript so they don't block the page from showing.";
  if (id.includes("unused-javascript"))
    return "Delete scripts you don't use, split the bundle by page, and defer code the first view doesn't need.";
  if (id.includes("unused-css")) return "Remove unused CSS and load only the styles this page needs.";
  if (id.includes("image") || id.includes("offscreen"))
    return "Resize images to their on-screen size, compress them, use WebP or AVIF, and lazy-load images below the fold.";
  if (id.includes("total-byte-weight"))
    return "Compress files, remove unused code, and drop heavy third-party scripts to cut the page's total download size.";
  if (id.includes("server-response")) return "Speed up the server's first response with page caching or a CDN.";
  if (id.includes("largest-contentful-paint"))
    return "Preload and compress the largest element on screen, and make sure it is in the HTML rather than added later by JavaScript.";
  return "Read the PageSpeed detail for this item and make the smallest change that removes the slowdown.";
}

function scoreCategory(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 90) return "fast";
  if (score >= PERFORMANCE_LIMITS.needsImprovementScore) return "good";
  if (score >= PERFORMANCE_LIMITS.poorScore) return "needs-improvement";
  return "poor";
}

function formatMetricValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number >= 1000 ? `${(number / 1000).toFixed(1)}s` : `${Math.round(number)}ms`;
}

function isHttpResourceUrl(value = "") {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function safeOrigin(value = "") {
  try {
    return new URL(value).origin || "";
  } catch {
    return "";
  }
}

function isSameSiteOrigin(originA = "", originB = "") {
  if (!originA || !originB) return false;
  if (originA === originB) return true;
  try {
    const host = (value) => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host(originA) === host(originB);
  } catch {
    return false;
  }
}

function emptyResourceChecks() {
  return { links: [], images: [], canonical: null };
}

function validateHreflang(hreflangs = [], pageUrl = "") {
  const issues = [];
  if (!hreflangs.length) return issues;

  const seen = new Map();
  for (const tag of hreflangs) {
    const code = String(tag.hreflang || "").toLowerCase();
    if (!code || !/^(x-default|[a-z]{2,3}(-[a-z0-9]{2,8})*)$/i.test(code)) {
      issues.push({
        severity: "warning",
        title: "Invalid hreflang code",
        why: "Google ignores hreflang tags with invalid codes, so it may show the wrong language version.",
        evidence: `Invalid hreflang value "${tag.hreflang || "missing"}" points to ${tag.href || "missing href"}.`,
        fix: 'Use codes like "en" or "en-gb", or "x-default" for the fallback page.'
      });
    }
    if (seen.has(code)) {
      issues.push({
        severity: "warning",
        title: "Duplicate hreflang tag",
        why: "The same language code points at two URLs, so search engines can't tell which one to show.",
        evidence: `${code} appears more than once: ${seen.get(code)} and ${tag.href || "missing href"}.`,
        fix: "Keep one hreflang tag per language code and remove the duplicate."
      });
    }
    seen.set(code, tag.href || "");
  }

  const pageKey = canonicalKey(pageUrl);
  const hasSelfReference = hreflangs.some((tag) => canonicalKey(tag.href) === pageKey);
  if (!hasSelfReference) {
    issues.push({
      severity: "notice",
      title: "Hreflang is missing a self-reference",
      why: "Each language version should list itself in its own hreflang tags. This one doesn't.",
      evidence: `No hreflang href matches the current page ${pageUrl}.`,
      fix: "Add a hreflang tag for this page next to the tags for its alternate language versions.",
      confidence: "needs-review"
    });
  }

  if (hreflangs.length > 1 && !seen.has("x-default")) {
    issues.push({
      severity: "notice",
      title: "Hreflang cluster has no x-default",
      why: "x-default tells Google which page to show visitors whose language you don't cover.",
      evidence: `${hreflangs.length} hreflang tags were found, but none use x-default.`,
      fix: 'If you have a general fallback page, add an hreflang="x-default" tag pointing at it.',
      confidence: "needs-review"
    });
  }

  return dedupeHreflangIssues(issues);
}

function dedupeHreflangIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.title}:${issue.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 429 and 503 mean "ask again later"; Google backs off on them rather than dropping the URL.
const THROTTLED_STATUSES = new Set([408, 425, 429, 503]);

// Cloudflare 520-526 are edge errors for an unreachable origin; Google retries 5xx rather than treating the URL as dead.
const CLOUDFLARE_ORIGIN_ERRORS = new Set([520, 521, 522, 523, 524, 525, 526]);

export function isThrottledResource(check) {
  return Boolean(check && check.status && THROTTLED_STATUSES.has(check.status));
}

export function isSameOriginInfraFailure(check) {
  return Boolean(check && check.kind === "internal" && check.status && CLOUDFLARE_ORIGIN_ERRORS.has(check.status));
}

export function isTransientCanonicalProbeFailure(check) {
  if (!check || check.kind !== "internal") return false;
  if (isSameOriginInfraFailure(check)) return true;
  return Boolean(!check.status && !check.guarded && check.error);
}

function isBrokenResource(check) {
  if (isThrottledResource(check)) return false;
  if (isSameOriginInfraFailure(check)) return false;
  return !check || !check.ok || !check.status || check.status >= 400;
}

function formatResourceEvidence(resources = []) {
  const shown = resources.slice(0, 5).map((resource) => {
    const status = resource.status || resource.error || "no response";
    const destination =
      resource.redirected && resource.finalUrl && resource.finalUrl !== resource.url
        ? ` -> ${formatResourceUrl(resource.finalUrl)}`
        : "";
    const size = resource.contentLength ? ` (${formatBytes(resource.contentLength)})` : "";
    return `${formatResourceUrl(resource.url)} returned ${status}${destination}${size}`;
  });
  const extra = resources.length > shown.length ? `; ${resources.length - shown.length} more` : "";
  return `${shown.join("; ")}${extra}.`;
}

function formatRedirectChain(chain = []) {
  if (!chain.length) return "No redirect chain recorded.";
  return chain
    .slice(0, 6)
    .map((step) => `${step.status}: ${formatResourceUrl(step.from)} -> ${formatResourceUrl(step.to)}`)
    .join("; ");
}

function formatResourceUrl(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`.replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return String(value || "unknown");
  }
}

function canonicalKey(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort?.();
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "");
  }
}

function uniqueResources(items = [], key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function headersToObject(headers) {
  const output = {};
  headers?.forEach?.((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

const BASIC_SECURITY_HEADERS = [
  {
    label: "X-Content-Type-Options",
    present: (headers) => /nosniff/i.test(headerValue(headers, "x-content-type-options")),
    snippet: "X-Content-Type-Options: nosniff"
  },
  {
    label: "X-Frame-Options or CSP frame-ancestors",
    present: (headers) =>
      Boolean(headerValue(headers, "x-frame-options")) ||
      /frame-ancestors/i.test(headerValue(headers, "content-security-policy")),
    snippet: "Content-Security-Policy: frame-ancestors 'self'"
  },
  {
    label: "Referrer-Policy",
    present: (headers) => Boolean(headerValue(headers, "referrer-policy")),
    snippet: "Referrer-Policy: strict-origin-when-cross-origin"
  }
];

function missingBasicSecurityHeaders(headers = {}) {
  return BASIC_SECURITY_HEADERS.filter((item) => !item.present(headers));
}

function headerValue(headers = {}, name) {
  return headers[String(name).toLowerCase()] || "";
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLocalhost(hostname = "") {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".local");
}

function isHtmlResponse(fetchResult, url) {
  const contentType = (fetchResult.contentType || "").toLowerCase();
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) return true;
  if (
    isLikelyHtmlUrl(url) &&
    (contentType.includes("application/octet-stream") ||
      contentType.includes("binary/octet-stream") ||
      contentType.includes("text/plain"))
  ) {
    return true;
  }
  if (contentType) return false;
  return isLikelyHtmlUrl(url);
}

function isLikelyHtmlUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return !/\.(txt|xml|json|csv|pdf|png|jpe?g|gif|webp|svg|ico|css|js|map|zip)$/i.test(pathname);
  } catch {
    return false;
  }
}

async function readTextLimited(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("HTML byte limit exceeded");
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.slice(0, Math.max(0, merged.length - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

function buildPageSummaries(pages, findings, startUrl) {
  return pages.map((page) => {
    const pageFindings = findings.filter((finding) => finding.pageUrl === page.url && finding.severity !== "good");
    const guards = findings.filter((finding) => finding.pageUrl === page.url && finding.severity === "good");
    const facts = page.rendered || {};
    const staticFacts = page.static || {};
    return {
      url: page.url,
      path: pathLabel(page.url, startUrl),
      status: page.status,
      finalUrl: facts.finalUrl || page.finalUrl || page.url,
      score: scoreFindings(pageFindings),
      critical: pageFindings.filter((finding) => finding.severity === "critical").length,
      warnings: pageFindings.filter((finding) => finding.severity === "warning").length,
      notices: pageFindings.filter((finding) => finding.severity === "notice").length,
      guards: guards.length,
      title: facts.title || "",
      h1: facts.h1s?.[0] || "",
      wordCount: facts.wordCount || 0,
      internalLinks: facts.internalLinks?.length || 0,
      brokenLinks: page.linkChecks?.filter(isBrokenResource).length || 0,
      brokenImages: page.imageChecks?.filter(isBrokenResource).length || 0,
      loadDurationMs: facts.loadDurationMs || 0,
      loadSettled: facts.loadSettled === true,
      schemaTypes: facts.schemaTypes || [],
      staticWordCount: staticFacts.wordCount || 0,
      staticH1: staticFacts.h1s?.[0] || "",
      staticInternalLinks: staticFacts.internalLinks?.length || 0
    };
  });
}

function summarize(findings, pages, maxPages = pages.length) {
  return {
    pagesScanned: pages.length,
    maxPages,
    crawlLimitHit: pages.length >= maxPages,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    notices: findings.filter((finding) => finding.severity === "notice").length,
    guardedFalsePositives: findings.filter((finding) => finding.severity === "good").length,
    totalFindings: findings.length,
    scoring: scoreBreakdown(findings)
  };
}

function scoreFindings(findings) {
  const { penalty } = scoreBreakdown(findings);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function scoreBreakdown(findings = []) {
  const groups = new Map();
  for (const finding of findings) {
    if (!finding || finding.severity === "good") continue;
    const key = scoreFindingKey(finding);
    const group = groups.get(key) || { key, critical: 0, warning: 0, notice: 0 };
    if (finding.severity === "critical") group.critical += 1;
    if (finding.severity === "warning") group.warning += 1;
    if (finding.severity === "notice") group.notice += 1;
    groups.set(key, group);
  }

  let penalty = 0;
  const repeated = [];
  for (const group of groups.values()) {
    const groupPenalty =
      severityPenalty(group.critical, "critical") +
      severityPenalty(group.warning, "warning") +
      severityPenalty(group.notice, "notice");
    penalty += groupPenalty;
    const count = group.critical + group.warning + group.notice;
    if (count > 1) {
      repeated.push({
        key: group.key,
        count,
        penalty: Number(groupPenalty.toFixed(2))
      });
    }
  }

  return {
    method: "deduped-template-penalty-v1",
    penalty: Number(penalty.toFixed(2)),
    repeated
  };
}

function severityPenalty(count, severity) {
  if (!count) return 0;
  const first = { critical: 12, warning: 5, notice: 1 }[severity] || 0;
  const repeat = { critical: 4, warning: 1.5, notice: 0.25 }[severity] || 0;
  const cap = { critical: 28, warning: 10, notice: 3 }[severity] || first;
  return Math.min(cap, first + Math.max(0, count - 1) * repeat);
}

export function withScoreGains(plan = [], findings = [], score = scoreFindings(findings)) {
  const gains = new Map();
  return plan.map((item) => {
    const key = issuePatternKey(item.title);
    if (!gains.has(key)) {
      const group = findings.filter((finding) => finding.severity !== "good" && scoreFindingKey(finding) === key);
      gains.set(key, {
        count: group.length,
        gain: group.length ? scoreFindings(findings.filter((finding) => !group.includes(finding))) - score : 0
      });
    }
    const { count, gain } = gains.get(key);
    return count ? { ...item, scoreGain: gain, sameIssueCount: count } : item;
  });
}

export function projectedScore(plan = [], findings = [], score = scoreFindings(findings), limit = 3) {
  const top = plan.slice(0, limit);
  const keys = new Set(top.map((item) => issuePatternKey(item.title)));
  const after = scoreFindings(findings.filter((finding) => !keys.has(scoreFindingKey(finding))));
  return after > score ? { fixes: top.length, from: score, to: after } : null;
}

function scoreFindingKey(finding) {
  return issuePatternKey(finding.title || "Unknown issue");
}

function headingHierarchyIssue(headings = []) {
  if (!headings.length) return "";
  const levels = headings.map((heading) => Number(String(heading.level).replace("h", "")));
  if (levels[0] !== 1) {
    return `First rendered heading is H${levels[0]} instead of H1.`;
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      return `Heading jumps from H${levels[index - 1]} to H${levels[index]}.`;
    }
  }
  return "";
}

function estimatedEffort(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("broken link") || title.includes("broken image")) return "15-45 min";
  if (
    title.includes("pagespeed") ||
    title.includes("largest contentful paint") ||
    title.includes("total blocking time") ||
    title.includes("layout shift")
  )
    return "45-120 min";
  if (title.includes("robots") || title.includes("sitemap")) return "15-30 min";
  if (title.includes("title") || title.includes("description") || title.includes("canonical")) return "5-15 min";
  if (title.includes("social") || title.includes("schema") || title.includes("viewport")) return "15-45 min";
  if (title.includes("hreflang") || title.includes("security") || title.includes("https")) return "30-90 min";
  if (title.includes("slow") || title.includes("large")) return "45-120 min";
  if (title.includes("thin") || title.includes("internal links") || title.includes("heading")) return "30-90 min";
  return "15-30 min";
}

function workType(finding) {
  const title = finding.title.toLowerCase();
  if (title.includes("title") || title.includes("description") || title.includes("thin") || title.includes("alt")) {
    return "content";
  }
  if (
    title.includes("schema") ||
    title.includes("canonical") ||
    title.includes("viewport") ||
    title.includes("social")
  ) {
    return "code";
  }
  if (title.includes("broken link") || title.includes("broken image")) {
    return "content";
  }
  if (
    title.includes("robots") ||
    title.includes("sitemap") ||
    title.includes("redirect") ||
    title.includes("hreflang") ||
    title.includes("https") ||
    title.includes("security") ||
    title.includes("slow") ||
    title.includes("large") ||
    title.includes("pagespeed") ||
    title.includes("largest contentful paint") ||
    title.includes("total blocking time") ||
    title.includes("layout shift")
  ) {
    return "technical";
  }
  return "review";
}

function attr(html, name) {
  const wanted = String(name || "").toLowerCase();
  for (const match of String(html || "").matchAll(/\s([^\s=]+)\s*=\s*(["'])(.*?)\2/gi)) {
    if (match[1].toLowerCase() === wanted) return match[3] || null;
  }
  return null;
}

function meta(head, key, value) {
  for (const match of String(head || "").matchAll(/<meta\b[^>]*>/gi)) {
    if (attr(match[0], key) === value) return attr(match[0], "content");
  }
  return null;
}

function linkRel(head, rel) {
  const wanted = String(rel || "").toLowerCase();
  for (const match of String(head || "").matchAll(/<link\b[^>]*>/gi)) {
    const tokens = String(attr(match[0], "rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.includes(wanted)) return attr(match[0], "href");
  }
  return null;
}

function absolute(value, base) {
  try {
    return value ? new URL(value, base).href : null;
  } catch {
    return value || null;
  }
}

export function normalizeUrl(input) {
  const trimmed = String(input || "").trim();
  const explicitScheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
  if (explicitScheme && !/^https?$/i.test(explicitScheme[1])) {
    throw new Error(`Unsupported URL scheme "${explicitScheme[1]}".`);
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not supported.");
  }
  url.hash = "";
  return url.href;
}

export function parseAuditCompetitorUrls(body = {}, targetUrl = "", urlGuard = publicAuditUrlStatus) {
  const input = body.competitorUrls ?? body.competitor_urls ?? body.competitors ?? "";
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,]+/)
        .map((value) => value.trim());
  const urls = [];
  const seen = new Set();
  const targetHost = normalizedHostname(targetUrl);

  for (const value of raw) {
    if (!value) continue;
    if (urls.length >= 5) break;
    let normalized;
    try {
      normalized = normalizeUrl(value);
    } catch {
      return { ok: false, error: "Enter valid competitor URLs, one per line." };
    }
    const check = urlGuard(normalized);
    if (!check.ok) {
      return { ok: false, error: `Competitor ${value}: ${check.error}` };
    }
    const host = normalizedHostname(normalized);
    if (!host || host === targetHost || seen.has(host)) continue;
    seen.add(host);
    urls.push(normalized);
  }

  return { ok: true, urls };
}

export function normalizeCompetitorUrlsList(values = [], targetUrl = "", urlGuard = publicAuditUrlStatus) {
  const result = parseAuditCompetitorUrls({ competitorUrls: values }, targetUrl, urlGuard);
  return result.ok ? result.urls : [];
}

export function competitorUrlsKey(values = []) {
  return normalizeCompetitorUrlsList(values).map(normalizedHostname).sort().join(",");
}

function normalizedHostname(value = "") {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function clampPageLimit(value) {
  return normalizeCrawlLimit(value);
}

export function issuePatternKey(title) {
  return String(title || "Unknown issue")
    .replace(/\son\s(home|\/[^\s]+)/i, "")
    .replace(/\sneeds cleanup.*/i, " needs cleanup")
    .trim();
}

export function publicAuditUrlStatus(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid public website URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only public http and https URLs can be audited." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") && !host.includes(":")) {
    return { ok: false, error: "Enter a valid public website URL." };
  }

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateHostname(host)
  ) {
    return { ok: false, error: "Use a public website URL, not a private or local address." };
  }

  return { ok: true };
}

function stripHash(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function pathLabel(url, startUrl) {
  const parsed = new URL(url);
  if (stripHash(url) === stripHash(startUrl)) return "home";
  return parsed.pathname || "page";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function suggestTitle(url, facts) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const firstH1 = facts.h1s?.[0];
  return trimSentence(firstH1 || `${host} page`, 58);
}

function suggestDescription(facts = {}) {
  const base =
    facts.leadText ||
    facts.bodySample ||
    facts.title ||
    "Clear page summary that explains the offer, audience, and next action.";
  const cleaned = base.replace(/\s+/g, " ").trim();
  const max = 155;
  if (cleaned.length <= max) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  let fitted = "";
  for (const sentence of sentences) {
    const next = `${fitted} ${sentence.trim()}`.trim();
    if (next.length > max) break;
    fitted = next;
  }
  if (fitted.length >= 70) return fitted;
  const cut = cleaned.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:\s]+$/, "")}…`;
}

function trimSentence(value, max) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const ROOT_PUBLIC_PATHS = [
  "/",
  "/demo",
  "/check",
  "/methodology",
  "/pricing",
  "/small-business-seo-audit",
  "/rendered-vs-static-seo-audit",
  "/ai-answer-readiness",
  "/privacy",
  "/proof",
  "/support",
  "/terms",
  "/about",
  ...TOOL_PATHS
];

export const ROOT_PUBLIC_LASTMODS = {
  "/": "2026-10-15T04:56:18Z",
  "/demo": "2026-10-13T04:43:48Z",
  "/check": "2026-10-15T06:24:10Z",
  "/methodology": "2026-10-13T04:43:48Z",
  "/pricing": "2026-10-15T05:58:29Z",
  "/small-business-seo-audit": "2026-10-13T04:43:48Z",
  "/rendered-vs-static-seo-audit": "2026-10-13T04:43:48Z",
  "/ai-answer-readiness": "2026-10-13T04:43:48Z",
  "/privacy": "2026-10-14T17:44:52Z",
  "/proof": "2026-10-13T04:43:48Z",
  "/support": "2026-10-13T04:43:48Z",
  "/terms": "2026-10-13T04:43:48Z",
  "/about": "2026-10-13T04:43:48Z",
  "/tools": "2026-10-13T04:43:48Z",
  "/tools/meta-tags": "2026-10-13T04:43:48Z",
  "/tools/serp-preview": "2026-10-13T04:43:48Z",
  "/tools/open-graph": "2026-10-13T04:43:48Z",
  "/tools/schema": "2026-10-13T04:43:48Z",
  "/tools/robots-txt": "2026-10-13T04:43:48Z",
  "/tools/robots-txt-tester": "2026-10-13T04:43:48Z",
  "/tools/llms-txt": "2026-10-13T04:43:48Z",
  "/tools/hreflang": "2026-10-13T04:43:48Z",
  "/tools/redirects": "2026-10-13T04:43:48Z",
  "/tools/sitemap-generator": "2026-10-13T04:43:48Z",
  "/tools/utm-builder": "2026-10-13T04:43:48Z",
  "/tools/word-counter": "2026-10-13T04:43:48Z",
  "/tools/keyword-density": "2026-10-13T04:43:48Z",
  "/tools/disavow": "2026-10-13T04:43:48Z",
  "/tools/seo-checklist": "2026-10-13T04:43:48Z"
};

export function rootSitemap(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ROOT_PUBLIC_PATHS.map(
    (path) => `<url><loc>${origin}${path}</loc><lastmod>${ROOT_PUBLIC_LASTMODS[path]}</lastmod></url>`
  ).join("")}</urlset>`;
}

export { escapeHtml };
