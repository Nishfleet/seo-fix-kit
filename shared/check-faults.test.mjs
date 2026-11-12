import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuditEngine } from "./audit-engine.js";
import { buildPublicCheckResponse } from "../worker/routes/public-check.js";
import { declaredSitemapUrls, randomMadeUpPath } from "./check-faults.js";

const XML_SITEMAP =
  '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://sm.example/</loc></url></urlset>';

function textResponse(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function htmlResponse(body) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function notFound() {
  return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
}

function proofBrowser(targetUrl, rendered = {}) {
  return {
    async newPage() {
      return {
        async goto() {
          return { status: () => 200 };
        },
        async evaluate() {
          return {
            source: "rendered-dom",
            finalUrl: targetUrl,
            title: "Proof page",
            description: "A proof-backed page.",
            generator: null,
            robots: null,
            canonical: targetUrl,
            lang: "en",
            viewport: "width=device-width, initial-scale=1",
            charset: "UTF-8",
            doctype: "html",
            hreflangs: [],
            h1s: ["Proof page"],
            headings: [{ level: "h1", text: "Proof page" }],
            links: [],
            internalLinks: [],
            externalLinks: [],
            images: [],
            imagesMissingAlt: [],
            scripts: [],
            stylesheets: [],
            openGraph: {},
            twitter: {},
            favicon: null,
            appleTouchIcon: null,
            schemaTypes: [],
            schemaErrors: [],
            navigationTiming: {},
            resourceTimings: [],
            resourceTimingsTotal: 0,
            wordCount: 12,
            bodyText: "Proof page with useful content.",
            bodySample: "Proof page with useful content.",
            ...rendered
          };
        },
        async close() {}
      };
    },
    async close() {}
  };
}

function fixtureFetch(routes, fallback = notFound) {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    const route = routes[String(url)];
    return route ? route() : fallback(String(url));
  };
  return { fetchImpl, requests };
}

const HOMEPAGE =
  "<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>Proof page with useful content.</p></body></html>";

test("the made-up path probe asks for one path of only letters and digits with no query", () => {
  const path = randomMadeUpPath();
  assert.match(path, /^\/madeup[a-z0-9]{12}$/);
  assert.doesNotMatch(path, /[^\x2fa-z0-9]|\.|\?|#|=/);
});

test("robots.txt sitemap lines are collected", () => {
  assert.deepEqual(declaredSitemapUrls("User-agent: *\nAllow: /\n\nsitemap: /sitemaps/main.xml\n"), [
    "/sitemaps/main.xml"
  ]);
  assert.deepEqual(declaredSitemapUrls("User-agent: *\nSitemap: https://sm.example/sitemap.xml\n"), [
    "https://sm.example/sitemap.xml"
  ]);
});

test("a made-up address that answers 200 with a page is reported with its path and status", async () => {
  const origin = "https://soft.example";
  const { fetchImpl, requests } = fixtureFetch(
    {
      [`${origin}/robots.txt`]: () => textResponse("User-agent: *\nAllow: /\n"),
      [`${origin}/llms.txt`]: notFound,
      [`${origin}/`]: () => htmlResponse(HOMEPAGE)
    },
    () => htmlResponse(HOMEPAGE)
  );
  const engine = createAuditEngine({
    launchBrowser: async () => proofBrowser(`${origin}/`),
    fetchImpl,
    pagespeedDisabled: true
  });
  const report = await engine.auditUrl(`${origin}/`, { maxPages: 1, pageSpeed: false, probeMadeUpAddress: true });
  const finding = report.findings.find((item) => /Made-up addresses return a page/.test(item.title));
  assert.ok(finding, "a soft-404 site must be reported");
  assert.equal(finding.severity, "warning");
  assert.match(finding.evidence, /^GET \/madeup[a-z0-9]+ returned 200 with a page/);
  assert.match(finding.evidence, /content type text\/html/);
  const probeRequests = requests.filter((url) => /^https:\/\/soft\.example\/madeup[a-z0-9]+$/.test(url));
  assert.equal(probeRequests.length, 1, "the probe sends exactly one extra request");
  assert.ok(
    requests.every((url) => !/\?/.test(url)),
    "no checked request carries a query string"
  );
  const payload = buildPublicCheckResponse(report);
  assert.ok(
    payload.findings.some((item) => /Made-up addresses return a page/.test(item.title)),
    "the one-page check surfaces the made-up-address fault"
  );
});

test("links that redirect are reported with the final address to use instead", async () => {
  const origin = "https://redir.example";
  const { fetchImpl } = fixtureFetch({
    [`${origin}/robots.txt`]: () => textResponse("User-agent: *\nAllow: /\n"),
    [`${origin}/llms.txt`]: notFound,
    [`${origin}/sitemap.xml`]: notFound,
    [`${origin}/`]: () =>
      htmlResponse('<!doctype html><html><head><title>Proof page</title></head><body><a href="/old">Old</a></body></html>'),
    [`${origin}/old`]: () =>
      new Response(null, { status: 301, headers: { location: `${origin}/new` } }),
    [`${origin}/new`]: () => htmlResponse("<!doctype html><html><head><title>New page</title></head><body><p>New page.</p></body></html>")
  });
  const engine = createAuditEngine({
    launchBrowser: async () =>
      proofBrowser(`${origin}/`, {
        links: [{ text: "Old", href: `${origin}/old`, rawHref: "/old" }],
        internalLinks: [{ text: "Old", href: `${origin}/old`, rawHref: "/old" }]
      }),
    fetchImpl,
    pagespeedDisabled: true
  });
  const report = await engine.auditUrl(`${origin}/`, { maxPages: 1, pageSpeed: false, probeMadeUpAddress: true });
  const finding = report.findings.find((item) => /Redirecting internal links on home/.test(item.title));
  assert.ok(finding, "a page with a redirecting internal link must be reported");
  assert.match(finding.evidence, /redirects to https:\/\/redir\.example\/new \(HTTP 301\)/);
  assert.match(finding.evidence, /Use the final URL instead\./);
  const payload = buildPublicCheckResponse(report);
  const shown = payload.findings.find((item) => /Redirecting internal links on home/.test(item.title));
  assert.ok(shown, "the one-page check surfaces the redirecting-link fault");
  assert.match(shown.evidence, /https:\/\/redir\.example\/new/, "the check names the final address");
});

test("a sitemap named in robots.txt satisfies the missing-sitemap check", async () => {
  const origin = "https://sm.example";
  const { fetchImpl } = fixtureFetch({
    [`${origin}/robots.txt`]: () =>
      textResponse(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemaps/main.xml\n`),
    [`${origin}/llms.txt`]: notFound,
    [`${origin}/sitemap.xml`]: notFound,
    [`${origin}/sitemaps/main.xml`]: () =>
      new Response(XML_SITEMAP, { status: 200, headers: { "content-type": "application/xml" } })
  });
  const engine = createAuditEngine({
    launchBrowser: async () => proofBrowser(`${origin}/`),
    fetchImpl,
    pagespeedDisabled: true
  });
  const report = await engine.auditUrl(`${origin}/`, { maxPages: 1, pageSpeed: false });
  assert.equal(
    report.findings.some((item) => /Sitemap not found/.test(item.title)),
    false,
    "a sitemap named in robots.txt must not be reported as missing"
  );
  assert.equal(
    report.findings.some((item) => /does not list your sitemap/.test(item.title)),
    false
  );
});

test("a site with no sitemap at the root or named in robots.txt still gets the missing-sitemap finding", async () => {
  const origin = "https://nosm.example";
  const { fetchImpl } = fixtureFetch({
    [`${origin}/robots.txt`]: () => textResponse("User-agent: *\nAllow: /\n"),
    [`${origin}/llms.txt`]: notFound,
    [`${origin}/`]: () => htmlResponse(HOMEPAGE)
  });
  const engine = createAuditEngine({
    launchBrowser: async () => proofBrowser(`${origin}/`),
    fetchImpl,
    pagespeedDisabled: true
  });
  const report = await engine.auditUrl(`${origin}/`, { maxPages: 1, pageSpeed: false });
  const finding = report.findings.find((item) => /Sitemap not found/.test(item.title));
  assert.ok(finding, "a missing sitemap must be reported");
  assert.equal(finding.severity, "warning");
  assert.match(finding.evidence, /GET https:\/\/nosm\.example\/sitemap\.xml returned 404/);
  const payload = buildPublicCheckResponse(report);
  assert.ok(
    payload.findings.some((item) => /Sitemap not found/.test(item.title)),
    "the one-page check surfaces the missing-sitemap fault"
  );
});
