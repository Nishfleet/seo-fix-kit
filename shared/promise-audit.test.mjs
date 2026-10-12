import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import {
  buildAiAnswerReadiness,
  aiAnswerReadinessBriefLines,
  aiAnswerReadinessSummaryCopy
} from "./ai-answer-readiness.js";
import { createAuditEngine, parseAuditCompetitorUrls } from "./audit-engine.js";
import { buildBacklinkAudit } from "./backlink-audit.js";
import {
  CRAWL_DEPTH_TIERS,
  CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES,
  CRAWLRAVEN_PUBLIC_CRAWL_PAGES,
  SELF_SERVE_MAX_CRAWL_PAGES
} from "./crawl-depth.js";
import { buildCrawlIntelligence } from "./crawl-intelligence.js";
import { buildCrawlInventory } from "./crawl-inventory.js";
import { dodoRepairSprintCheckoutConfigStatus } from "./dodo.js";
import { buildGrowthOpportunities, growthOpportunitiesSummaryCopy } from "./growth-opportunities.js";
import { buildKeywordRankAudit } from "./keyword-rank-audit.js";
import {
  LARGE_RENDERED_CRAWL_BATCH_SIZE,
  LARGE_RENDERED_CRAWL_TARGET_PAGES,
  largeRenderedCrawlMergeReadiness,
  retryLargeRenderedCrawlFailures
} from "./large-rendered-crawl.js";
import { buildLocalSeoAudit } from "./local-seo-audit.js";
import { offerCatalog, repairSprintEligibilityFromProposals } from "./offers.js";
import { buildPlatformSeoAudit } from "./platform-seo-audit.js";
import { buildRemediationBrief } from "./remediation-brief.js";
import { repairAccountSummaryFromItems } from "./account-repair-summary.js";
import { buildRepairImplementationPack } from "./repair-implementation-pack.js";
import { buildRepairProofReceipt } from "./repair-proof-receipt.js";
import { buildReportDelta } from "./report-delta.js";
import { buildResourceWaterfall } from "./resource-waterfall.js";
import { fixPackCheckoutDisabled } from "../src/fix-pack-checkout.js";
import { createTestD1 } from "../test/support/d1.mjs";
import { app as workerApp } from "../worker/index.js";
import { cleanupExpiredRows } from "../worker/lib/db.js";
import {
  REPORT_RETENTION_DAYS,
  latestSavedReportForDelta,
  saveAuditReportWithContext
} from "../worker/lib/report-data.js";
import { sha256Hex } from "../worker/lib/security.js";
import { siteVerificationText } from "../worker/lib/serializers.js";
import { clampScheduleInterval } from "../worker/lib/text.js";
import { auditUrl as workerAuditUrl } from "../worker/routes/audits.js";
import { runDueLargeRenderedCrawlWorkers } from "../worker/routes/large-crawls.js";
import { llmsText, homeMarkdown } from "../worker/routes/pages.js";
import { buildPublicCheckResponse } from "../worker/routes/public-check.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const liveSection = readme.split("## What is live in this repo")[1]?.split("## Run locally")[0] || "";
// Wrangler's own config reader, so deploy claims are checked against the
// values Wrangler deploys, not against the file's formatting.
const wranglerConfig = unstable_readConfig({ config: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)) });

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";

// True when the Worker's router has a real route for `path` (any method, or
// the given one); a trailing slash means "some route under this prefix".
// Checks registered routes, not source text.
function workerRoutes(path, method = "") {
  return workerApp.routes.some(
    (route) =>
      (path.endsWith("/") ? route.path.startsWith(path) : route.path === path) &&
      (!method || route.method === method || route.method === "ALL")
  );
}

// --- Behaviour harness -------------------------------------------------------
// Every check below exercises real code: the Worker router with an in-memory
// D1 that has every migration applied, the shared audit engine with a fake
// browser, or the shared builders with small fixtures.

function isoFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function testCtx() {
  const pending = [];
  return {
    pending,
    waitUntil: (promise) => pending.push(promise),
    passThroughOnException() {}
  };
}

async function publicPage(path) {
  const response = await workerApp.fetch(new Request(`${ORIGIN}${path}`), {}, testCtx());
  assert.equal(response.status, 200, `${path} must render`);
  return response.text();
}

const PUBLIC_HTML_PATHS = [
  "/demo",
  "/check",
  "/methodology",
  "/packages",
  "/proof",
  "/small-business-seo-audit",
  "/rendered-vs-static-seo-audit",
  "/ai-answer-readiness",
  "/support",
  "/terms",
  "/privacy"
];

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
}

function jsonLdTypes(value, types = []) {
  if (Array.isArray(value)) value.forEach((item) => jsonLdTypes(item, types));
  else if (value && typeof value === "object") {
    if (value["@type"]) types.push(value["@type"]);
    for (const child of Object.values(value)) jsonLdTypes(child, types);
  }
  return types;
}

async function withStubbedFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A Browser Run binding that records the call and refuses to start a browser.
function recordingBrowserBinding() {
  const calls = [];
  return {
    calls,
    async fetch(input) {
      calls.push(String(input?.url || input));
      throw new Error("No Browser Run session in tests.");
    }
  };
}

// A private-beta workspace: in-memory D1 plus one live beta session whose
// token is sent the same way the SPA sends it.
async function privateBeta({ accessMode = "invite", inviteId = "invite-1", env: extraEnv = {} } = {}) {
  const db = createTestD1();
  const now = new Date().toISOString();
  if (inviteId) {
    db.insert("beta_invites", {
      id: inviteId,
      code_hash: `seeded-${inviteId}`,
      owner_email: OWNER,
      status: "used",
      max_uses: 1,
      used_count: 1,
      created_at: now
    });
  }
  const sessionToken = randomUUID();
  db.insert("beta_sessions", {
    token_hash: await sha256Hex(sessionToken),
    owner_email: OWNER,
    created_at: now,
    expires_at: isoFromNow(DAY_MS),
    last_seen_at: now,
    invite_id: inviteId,
    access_mode: accessMode
  });
  const queued = [];
  const env = { WAITLIST_DB: db, AUDIT_QUEUE: { send: async (message) => queued.push(message) }, ...extraEnv };
  const ctx = testCtx();
  const call = (path, { method = "GET", body, headers = {} } = {}) =>
    workerApp.fetch(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.7",
          "x-beta-session": sessionToken,
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      env,
      ctx
    );
  return { db, env, ctx, call, queued, inviteId, sessionToken };
}

function insertSavedReport(
  db,
  report,
  { id = `example-com-${randomUUID()}`, ownerEmail = OWNER, inviteId = null, expiresAt = isoFromNow(30 * DAY_MS) } = {}
) {
  const now = new Date().toISOString();
  const url = new URL(report.url);
  db.insert("audit_reports", {
    id,
    url: report.url,
    origin: url.origin,
    score: report.score ?? 80,
    summary_json: "{}",
    report_json: JSON.stringify({ ...report, id, reportPath: `/beta/reports/${id}` }),
    created_at: now,
    updated_at: now,
    owner_email: ownerEmail,
    owner_session_hash: "",
    target_host: url.hostname,
    expires_at: expiresAt,
    owner_invite_id: inviteId
  });
  return id;
}

function savedReportFixture(url = "https://example.com/") {
  return {
    url,
    score: 72,
    findings: [
      {
        id: "issue-1",
        type: "issue",
        severity: "critical",
        title: "Missing or weak title on home",
        pageUrl: url,
        pageLabel: "home",
        evidence: "No title found.",
        fix: "Add a unique, descriptive title for this page.",
        snippet: "<title>Example home</title>"
      }
    ],
    repairPlan: []
  };
}

// One offline run of the production audit engine against a small fixture
// site, with a fake browser standing in for Browser Run / Playwright. Shared
// by every engine-output claim below.
const SHOP = "https://shop.example";
const RIVAL = "https://rival.example";
const fixtureResources = {
  [`${SHOP}/robots.txt`]: { body: `User-agent: *\nAllow: /\nSitemap: ${SHOP}/sitemaps/main.xml\n`, type: "text/plain" },
  [`${SHOP}/sitemaps/main.xml`]: {
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SHOP}/</loc></url><url><loc>${SHOP}/about</loc></url><url><loc>${SHOP}/orphan-guide</loc></url></urlset>`,
    type: "application/xml"
  },
  [`${SHOP}/`]: {
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>'
  },
  [`${SHOP}/about`]: {
    body: '<!doctype html><html lang="en"><head><title>About Shop Example</title></head><body><h1>About</h1></body></html>'
  },
  [`${SHOP}/old`]: { status: 301, location: "/about" },
  [`${SHOP}/img/huge.jpg`]: { type: "image/jpeg", length: 900_000 },
  [`${RIVAL}/`]: {
    body: '<!doctype html><html lang="en"><head><title>Rival</title></head><body><h1>Rival</h1></body></html>'
  }
};

async function fixtureFetch(url, init = {}) {
  const resource = fixtureResources[String(url)];
  if (!resource) return new Response("", { status: 404 });
  const headers = { "content-type": resource.type || "text/html; charset=utf-8" };
  if (resource.location) headers.location = resource.location;
  if (resource.length) headers["content-length"] = String(resource.length);
  return new Response(init.method === "HEAD" ? null : resource.body || "", { status: resource.status || 200, headers });
}

const fixtureRendered = {
  [`${SHOP}/`]: {
    title: "",
    description: null,
    canonical: `${SHOP}/gone-canonical`,
    h1s: ["Shop Example storefront"],
    headings: [{ level: "h1", text: "Shop Example storefront" }],
    hreflangs: [{ hreflang: "english!!", href: `${SHOP}/` }],
    links: [
      { href: `${SHOP}/about`, text: "About" },
      { href: `${SHOP}/missing`, text: "Missing" },
      { href: `${SHOP}/old`, text: "Old" }
    ],
    images: [
      { src: `${SHOP}/img/missing.png`, alt: "Missing", hasAlt: true },
      { src: `${SHOP}/img/huge.jpg`, alt: "Huge", hasAlt: true }
    ],
    schemaTypes: ["invalid-json"],
    schemaErrors: ["JSON-LD could not be parsed."]
  },
  [`${SHOP}/about`]: {
    title: "About Shop Example",
    h1s: ["About"],
    headings: [{ level: "h1", text: "About" }],
    links: [{ href: `${SHOP}/`, text: "Home" }]
  },
  [`${RIVAL}/`]: {
    title: "Rival storefront for proof-backed buyers",
    description: "Rival storefront description with enough words to count as a useful meta description for buyers.",
    h1s: ["Rival storefront"],
    headings: [{ level: "h1", text: "Rival storefront" }],
    wordCount: 400
  }
};

function fixtureBrowser() {
  return {
    async newPage() {
      let current = "";
      return {
        async goto(url) {
          current = url;
          return { status: () => 200 };
        },
        async evaluate() {
          const overrides = fixtureRendered[current] || {};
          const links = overrides.links || [];
          const origin = new URL(current).origin;
          return {
            source: "rendered-dom",
            finalUrl: current,
            title: "",
            description: null,
            generator: null,
            robots: null,
            canonical: current,
            lang: "en",
            viewport: "width=device-width, initial-scale=1",
            charset: "UTF-8",
            doctype: "html",
            hreflangs: [],
            h1s: [],
            headings: [],
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
            wordCount: 40,
            bodyText: "Shop example words ".repeat(10),
            bodySample: "Shop example words",
            ...overrides,
            links,
            internalLinks: links.filter((link) => link.href.startsWith(origin)),
            externalLinks: links.filter((link) => !link.href.startsWith(origin))
          };
        },
        async close() {}
      };
    },
    async close() {}
  };
}

let fixtureAuditPromise = null;
function fixtureAudit() {
  fixtureAuditPromise ||= createAuditEngine({
    launchBrowser: async () => fixtureBrowser(),
    fetchImpl: fixtureFetch
  }).auditUrl(`${SHOP}/`, {
    maxPages: 2,
    pageSpeed: true,
    competitorUrls: [`${RIVAL}/`],
    pageSpeedFetcher: async () => ({
      lighthouseResult: {
        categories: { performance: { score: 0.42 } },
        audits: {
          "largest-contentful-paint": { numericValue: 5200, displayValue: "5.2 s" },
          "total-blocking-time": { numericValue: 900, displayValue: "900 ms" },
          "render-blocking-resources": {
            title: "Eliminate render-blocking resources",
            score: 0.2,
            details: { overallSavingsMs: 800 }
          }
        }
      }
    })
  });
  return fixtureAuditPromise;
}

function findingTitled(report, pattern) {
  return report.findings.find((finding) => pattern.test(finding.title));
}

// --- Claims ------------------------------------------------------------------

test("README 'What is live in this repo' section exists and documents the self-serve crawl promise", () => {
  assert.ok(liveSection.length > 500, "README must keep a 'What is live in this repo' section");
  assert.match(liveSection, /1,000 pages per queued audit/i);
  assert.match(liveSection, /up to 50,000 sitemap URLs/i);
  assert.equal(SELF_SERVE_MAX_CRAWL_PAGES, 1000, "self-serve crawl cap is 1,000 pages");
  assert.equal(CRAWLRAVEN_PUBLIC_CRAWL_PAGES, 50000, "sitemap inventory cap is 50,000 URLs");
  assert.equal(CRAWLRAVEN_ENTERPRISE_CRAWL_PAGES, 100000, "enterprise staged cap stays 100,000");
});

test("README large-crawl promise matches stored batch and target limits", () => {
  assert.match(liveSection, /50,000-page targets \(early access\)/i);
  assert.match(liveSection, /1,000-page batches/i);
  assert.equal(LARGE_RENDERED_CRAWL_TARGET_PAGES, 50000, "large-crawl target is 50,000 pages");
  assert.equal(LARGE_RENDERED_CRAWL_BATCH_SIZE, 1000, "large-crawl batch size is 1,000 pages");
});

test("README retention promise matches the code constant", () => {
  assert.match(liveSection, /30-day report retention/i);
  assert.equal(REPORT_RETENTION_DAYS, 30, "report retention is 30 days");
});

test("README competitor promise caps at five public homepages", () => {
  assert.match(liveSection, /up to five public competitor homepages/i);
  const input = {
    competitorUrls: Array.from({ length: 9 }, (_, index) => `https://competitor-${index}.example/`)
  };
  const result = parseAuditCompetitorUrls(input, "https://target.example/");
  assert.equal(result.ok, true);
  assert.equal(result.urls.length, 5, "competitor benchmarking accepts at most five URLs");
});

test("README Lite check promise matches the 1-page, 3/day quota", async () => {
  assert.match(liveSection, /homepage-only Lite check \(1 page, 3\/day\)/i);
  assert.match(liveSection, /runs without verification/i);
  const beta = await privateBeta();

  const deep = await beta.call("/api/audit", {
    method: "POST",
    body: { url: "https://unverified.example/", maxPages: 10 }
  });
  assert.equal(deep.status, 403, "a multi-page audit of an unverified host is refused");
  assert.equal((await deep.json()).code, "SITE_VERIFICATION_REQUIRED");
  const withExtras = await beta.call("/api/audit", {
    method: "POST",
    body: { url: "https://unverified.example/", maxPages: 1, competitorUrls: ["https://rival.example/"] }
  });
  assert.equal(withExtras.status, 403, "a 1-page run with extras is not a Lite check");

  for (const host of ["lite-one.example", "lite-two.example", "lite-three.example"]) {
    const lite = await beta.call("/api/audit", { method: "POST", body: { url: `https://${host}/`, maxPages: 1 } });
    assert.equal(lite.status, 202, `a homepage-only Lite check of ${host} queues before site verification`);
  }
  const fourth = await beta.call("/api/audit", {
    method: "POST",
    body: { url: "https://lite-four.example/", maxPages: 1 }
  });
  assert.equal(fourth.status, 429, "the fourth Lite check of the day is rejected");
  assert.match((await fourth.json()).error, /Daily Lite check limit/);
  const liteBuckets = beta.db.rows("SELECT bucket, count FROM audit_usage WHERE bucket LIKE 'audit:lite-day:%'");
  assert.equal(liteBuckets.length, 1, "Lite quota uses one daily bucket per owner");
  assert.equal(liteBuckets[0].count, 3, "Lite checks are capped at three per day");
  assert.deepEqual(
    beta.db.rows("SELECT max_pages FROM audit_jobs").map((row) => row.max_pages),
    [1, 1, 1],
    "Lite checks queue as 1-page runs"
  );
});

test("README weekly monitor promise matches the schedule interval", () => {
  assert.match(liveSection, /weekly self-serve audit monitors/i);
  assert.equal(clampScheduleInterval(undefined), 7, "monitors default to a weekly interval");
  assert.equal(clampScheduleInterval(3), 7, "monitors never run more often than weekly");
});

test("README public page promise matches Worker routing and copy", async () => {
  assert.match(liveSection, /Public `\/demo`, `\/methodology`, `\/packages`, and `\/proof` pages showing the proof loop, limits, package ladder, and a real before\/after repair receipt/i);
  assert.match(liveSection, /Intent-matching public landing pages at `\/small-business-seo-audit`, `\/rendered-vs-static-seo-audit`, and `\/ai-answer-readiness`/i);
  for (const path of ["/demo", "/methodology", "/packages", "/check", "/proof"]) {
    assert.ok(workerRoutes(path, "GET"), `Worker must route ${path}`);
  }
  for (const path of ["/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"]) {
    assert.ok(workerRoutes(path, "GET"), `Worker must route ${path}`);
  }
  assert.match(await publicPage("/packages"), /\$99\.00 one-time/, "packages page shows the public Fix Pack price");
});

test("README intent-landing-page promise matches routes, sitemap, and schema boundaries", async () => {
  const landingPaths = ["/small-business-seo-audit", "/rendered-vs-static-seo-audit", "/ai-answer-readiness"];
  // run_worker_first: true sends every path (including these) through the
  // Worker before the SPA assets.
  assert.equal(wranglerConfig.assets.run_worker_first, true, "the Worker must run before SPA assets for every path");
  for (const path of landingPaths) {
    assert.ok(workerRoutes(path, "GET"), `Worker must route ${path}`);
    assert.match(liveSection, new RegExp(`\`${path}\``, "i"), `README must name ${path}`);
  }
  // With run_worker_first, /sitemap.xml is the Worker-served sitemap.
  const sitemap = await publicPage("/sitemap.xml");
  for (const path of landingPaths) {
    assert.ok(sitemap.includes(`<loc>${ORIGIN}${path}</loc>`), `served sitemap must list ${path}`);
  }
  for (const path of landingPaths) {
    const html = await publicPage(path);
    const blocks = jsonLdBlocks(html);
    const types = jsonLdTypes(blocks);
    assert.ok(types.includes("SoftwareApplication"), `${path} carries SoftwareApplication schema`);
    assert.ok(types.includes("FAQPage"), `${path} carries FAQPage schema`);
    const text = visibleText(html);
    const questions = blocks.flatMap((block) => (block["@type"] === "FAQPage" ? block.mainEntity : []));
    assert.ok(questions.length > 0, `${path} FAQ schema has questions`);
    for (const question of questions) {
      assert.ok(text.includes(question.name), `${path} FAQ schema question is visible copy: ${question.name}`);
    }
    assert.doesNotMatch(
      html,
      /live AI citation monitoring is live/i,
      "no landing page may claim live citation monitoring"
    );
  }
  assert.match(
    visibleText(await publicPage("/ai-answer-readiness")),
    /does not provide live AI citation monitoring or answer-engine sampling/i,
    "the AI readiness landing page keeps the AI boundary"
  );
});

test("README Cloudflare path routes are actually registered in the Worker", () => {
  const claimedRoutes = [
    "/api/health",
    "/api/deep-health",
    "/api/waitlist",
    "/api/access/request",
    "/api/access/verify",
    "/api/beta/login",
    "/api/beta/session",
    "/api/beta/logout",
    "/api/account/summary",
    "/api/audit",
    "/api/audit/jobs/",
    "/api/large-crawls",
    "/api/audit/schedules",
    "/api/developer",
    "/api/developer/tokens",
    "/api/developer/webhooks",
    "/api/sites",
    "/api/sites/claim",
    "/api/sites/verify",
    "/api/reports/",
    "/api/webhooks/dodo",
    "/api/billing/summary",
    "/api/beta/fix-request",
    "/api/beta/monitoring-checkout",
    "/v1/audits",
    "/v1/projects",
    "/v1/large-crawls",
    "/admin/summary",
    "/admin/invites",
    "/admin/leads.csv",
    "/llms.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/privacy",
    "/support",
    "/terms",
    "/demo",
    "/methodology",
    "/packages",
    "/small-business-seo-audit",
    "/rendered-vs-static-seo-audit",
    "/ai-answer-readiness",
    "/check",
    "/api/public-check",
    "/beta"
  ];
  for (const route of claimedRoutes) {
    assert.ok(workerRoutes(route), `Worker must register route ${route}`);
  }
});

// Drives every abuse-controlled surface once through the Worker against one
// D1 and returns the quota rows it left behind.
async function exerciseAbuseControlledSurfaces() {
  const browser = recordingBrowserBinding();
  const emails = [];
  const beta = await privateBeta({
    env: {
      BETA_ACCESS_PASSWORD: "FounderPass2026",
      EMAIL: { send: async (message) => emails.push(message) },
      SEOFIXKIT_EMAIL_FROM: "beta@seofixkit.com",
      BROWSER: browser
    }
  });
  assert.equal((await beta.call("/api/waitlist", { method: "POST", body: { email: "lead@example.com" } })).status, 200);
  assert.equal(
    (await beta.call("/api/beta/login", { method: "POST", body: { email: OWNER, password: "FounderPass2026" } }))
      .status,
    200
  );
  assert.equal(
    (await beta.call("/api/access/request", { method: "POST", body: { email: "self-serve@example.com" } })).status,
    200
  );
  assert.equal(
    (await beta.call("/api/audit", { method: "POST", body: { url: "https://audited-site.example/", maxPages: 1 } }))
      .status,
    202
  );
  const check = await withStubbedFetch(
    async () => new Response("", { status: 404 }),
    () => beta.call("/api/public-check", { method: "POST", body: { url: "https://93.184.216.34/" } })
  );
  return { beta, check, browser, buckets: beta.db.rows("SELECT bucket FROM audit_usage").map((row) => row.bucket) };
}

test("README abuse-control claim matches D1 buckets for every listed surface", async () => {
  assert.match(liveSection, /D1-backed abuse controls/i);
  assert.match(liveSection, /across access links, login, waitlist, network, session, daily, and target-site audit buckets/i);
  const { buckets } = await exerciseAbuseControlledSurfaces();
  for (const bucket of [
    "waitlist:ip",
    "login:ip",
    "access:ip",
    "audit:ip",
    "audit:session",
    "audit:target",
    "audit:lite-day",
    "check:ip-hour",
    "check:target-hour"
  ]) {
    assert.ok(
      buckets.some((stored) => stored.startsWith(`${bucket}`)),
      `abuse control must cover ${bucket} (stored: ${buckets.join(", ")})`
    );
  }
});

test("quota target buckets never store a plaintext hostname, public or private", async () => {
  const { buckets } = await exerciseAbuseControlledSurfaces();
  const targetBuckets = buckets.filter((bucket) => /^(audit|check):target/.test(bucket));
  assert.ok(
    targetBuckets.some((bucket) => bucket.startsWith("audit:target")),
    "the private audit target bucket was written"
  );
  assert.ok(
    targetBuckets.some((bucket) => bucket.startsWith("check:target")),
    "the anonymous /check target bucket was written"
  );
  for (const bucket of targetBuckets) {
    assert.match(bucket, /:[0-9a-f]{32}$/, `${bucket} must end in a 32-hex host hash`);
  }
  for (const bucket of buckets) {
    assert.doesNotMatch(bucket, /audited-site|93\.184\.216\.34/, `${bucket} must not hold a readable target host`);
  }
});

test("README anonymous one-page check claim matches the Worker, page, and rate limits", async () => {
  assert.match(liveSection, /Public anonymous one-page URL check at `\/check` and `POST \/api\/public-check`/i);
  assert.match(liveSection, /per-network and per-site rate limits with hashed, short-lived counters/i);
  assert.match(liveSection, /no stored report/i);
  assert.match(liveSection, /handoff into private beta access with no ranking promise/i);
  assert.ok(workerRoutes("/check", "GET"), "Worker must route /check");
  assert.ok(workerRoutes("/api/public-check", "POST"), "Worker must route /api/public-check");
  assert.match(liveSection, /real browser rendering of one public page/i);
  const page = visibleText(await publicPage("/check"));
  assert.match(
    page,
    /opens the page in a real browser|open the page in a real browser/i,
    "the public check copy states real browser rendering"
  );
  assert.match(
    page,
    /does not guarantee rankings, traffic, indexing, revenue, AI citations/i,
    "the public check keeps the no-ranking boundary"
  );
  const { buckets, check, browser } = await exerciseAbuseControlledSurfaces();
  assert.ok(
    buckets.some((bucket) => bucket.startsWith("check:target-day:")),
    "the check is rate-limited per site per day"
  );
  assert.equal(check.status, 503, "with no browser available the check reports busy capacity");
  assert.ok(
    browser.calls.some((url) => url.includes("/v1/devtools/browser")),
    "the check renders through the Browser Run binding"
  );
  assert.equal(
    wranglerConfig.assets.run_worker_first,
    true,
    "/check (and every other path) is served by the Worker before SPA assets"
  );
});

test("README homepage anonymous-check claim matches the CTA beside the email form", () => {
  assert.match(
    readme,
    /request a secure one-use email link or check one public page anonymously/i,
    "README promises both homepage entry paths"
  );
  // The rendered homepage form, /check CTA, and FAQ are checked in a browser by test/spa.test.mjs.
});

// State-truthfulness pins. The numeric caps and routes above are locked to
// code; these claims describe what is NOT live or how limits are computed, so
// they were spot-checked once (PR #60) and are locked here so the README
// cannot silently drift into overclaiming.

test("README large-crawl daily rate matches the scheduled worker defaults", async () => {
  assert.match(liveSection, /roughly 1,000 pages\/day/i);
  assert.ok(wranglerConfig.triggers.crons.includes("*/15 * * * *"), "scheduled worker runs every 15 minutes");
  const db = createTestD1();
  const now = new Date().toISOString();
  for (const id of ["crawl-a", "crawl-b"]) {
    db.insert("large_crawl_jobs", {
      id,
      owner_email: OWNER,
      target_url: "https://large.example/",
      target_host: "large.example",
      status: "queued",
      created_at: now,
      updated_at: now
    });
  }
  // No SEOFIXKIT_LARGE_CRAWL_WORKER_* vars: the defaults apply.
  await runDueLargeRenderedCrawlWorkers({ WAITLIST_DB: db, BROWSER: recordingBrowserBinding() });
  const heartbeats = db.rows("SELECT crawl_job_id, concurrency FROM large_crawl_worker_heartbeats");
  assert.equal(heartbeats.length, 1, "default is one batch per tick");
  assert.equal(heartbeats[0].concurrency, 10, "default is ten URLs per batch");
  const ticksPerDay = (24 * 60) / 15;
  const pagesPerDay = ticksPerDay * heartbeats.length * heartbeats[0].concurrency;
  assert.ok(pagesPerDay >= 900 && pagesPerDay <= 1000, `default caps render ${pagesPerDay} pages/day, matching 'roughly 1,000'`);
});

test("README keyword-volume claim keeps a storage path without a live provider", () => {
  assert.match(liveSection, /keyword volume imports have a storage path but no live provider yet/i);
  const db = createTestD1();
  const columns = db.rows("PRAGMA table_info(keyword_volume_observations)").map((column) => column.name);
  assert.ok(columns.includes("monthly_volume"), "a migrated table must store keyword volume rows");
  const audit = buildKeywordRankAudit({ url: "https://example.com/", pages: [] }, [
    { query: "seo audit", pageUrl: "https://example.com/", clicks: 1, impressions: 10, position: 3 }
  ]);
  assert.match(
    audit.note,
    /not a keyword volume, rank-tracking, or backlink database/,
    "keyword audit does not claim a live volume provider"
  );
});

test("README offer-catalog claim matches config-gated monitoring and paused checkouts", () => {
  assert.match(liveSection, /Server-owned offer catalog and entitlement scaffolding for Proof Monitoring, Repair Sprint, SEO\/GEO Repair Agent, and Agency Workspace/i);
  assert.match(liveSection, /Proof Monitoring has a config-gated Dodo subscription checkout path/i);
  // Repair Sprint moved from "not live yet" to a config-gated one-time checkout
  // that only opens from a report with an owner-approved executable proposal.
  // Repair Agent and paid Agency Workspace checkout are still not live, and the
  // README must keep saying so.
  assert.match(
    liveSection,
    /Repair Sprint has a config-gated Dodo one-time checkout path for approved proposal queues/i
  );
  assert.match(
    liveSection,
    /Repair Agent checkout and paid Agency Workspace checkout are not live yet/i
  );
  assert.doesNotMatch(
    liveSection,
    /Repair Agent checkout .{0,40}(is|are) live/i,
    "the README may not claim Repair Agent checkout is live"
  );
  const byName = (offers) => Object.fromEntries(offers.map((offer) => [offer.name, offer]));
  const unconfigured = byName(offerCatalog());
  for (const name of ["Proof Monitoring", "Repair Sprint", "SEO/GEO Repair Agent", "Agency Workspace"]) {
    assert.ok(unconfigured[name], `offer catalog names ${name}`);
  }
  // Both config-gated offers carry the label, so neither renders as
  // unconditionally purchasable.
  assert.equal(unconfigured["Proof Monitoring"].statusLabel, "Config gated");
  assert.equal(unconfigured["Repair Sprint"].statusLabel, "Config gated");
  assert.equal(unconfigured["Proof Monitoring"].checkoutLive, false);
  assert.equal(unconfigured["Repair Sprint"].checkoutConfigured, false);
  const configured = byName(
    offerCatalog({ fixPackCheckoutReady: true, monitoringCheckoutReady: true, repairSprintCheckoutReady: true })
  );
  assert.equal(configured["Proof Monitoring"].checkoutLive, true, "monitoring checkout opens once configured");
  assert.equal(
    configured["Repair Sprint"].checkoutConfigured,
    true,
    "Repair Sprint checkout is gated behind a configured Dodo product"
  );
  // Repair Sprint eligibility only reports a live checkout once a proposal is
  // approved AND checkout is configured.
  const approved = [{ executionMode: "self_serve", approvalStatus: "approved" }];
  const pending = [{ executionMode: "self_serve", approvalStatus: "pending" }];
  assert.equal(repairSprintEligibilityFromProposals(approved, null, { checkoutReady: true }).checkoutLive, true);
  assert.equal(repairSprintEligibilityFromProposals(approved, null, { checkoutReady: false }).checkoutLive, false);
  assert.equal(repairSprintEligibilityFromProposals(pending, null, { checkoutReady: true }).checkoutLive, false);
  // Repair Agent and Agency Workspace stay paused even with every product configured.
  for (const name of ["SEO/GEO Repair Agent", "Agency Workspace"]) {
    assert.equal(configured[name].checkoutState, "paused", `${name} checkout stays paused`);
    assert.equal(configured[name].checkoutLive, false, `${name} checkout is not live`);
  }
});

test("README AI Answer Readiness claim stays free of live AI sampling", async () => {
  assert.match(liveSection, /no live AI-engine sampling or citation monitoring/i);
  const readiness = (await fixtureAudit()).aiAnswerReadiness;
  assert.equal(readiness.status, "ready");
  assert.match(
    readiness.note,
    /does not sample AI engines or monitor citations|does not sample AI engines, monitor citations/
  );
  assert.match(aiAnswerReadinessSummaryCopy(readiness), /not live answer-engine sampling or citation monitoring/);
});

test("README AI Answer Readiness claim ranks faults by imported Search Console traffic", async () => {
  assert.match(
    liveSection,
    /when Search Console or rank-tracker rows are imported, readiness faults are ranked by the clicks and impressions on the affected pages/i
  );
  // Ranking order by traffic is proven in shared/ai-answer-readiness.test.mjs
  // ("imported Search Console rows rank readiness faults by traffic on
  // affected pages"); here the imported rows must switch the prioritization
  // mode and the brief must say so.
  const report = await fixtureAudit();
  const ranked = buildAiAnswerReadiness(report, {
    keywordRows: [{ query: "shop example", pageUrl: `${SHOP}/about`, clicks: 50, impressions: 900 }]
  });
  assert.equal(ranked.summary.prioritization, "imported-search-console-traffic");
  assert.match(aiAnswerReadinessBriefLines(ranked).join("\n"), /Prioritization: imported Search Console traffic/);
  assert.equal(buildAiAnswerReadiness(report).summary.prioritization, "proof-order");
  const page = visibleText(await publicPage("/ai-answer-readiness"));
  assert.match(page, /Compared with CrawlRaven/);
  assert.match(page, /does not connect to Search Console or GA4 automatically/);
  assert.match(page, /On "technical readiness predicts nothing \(r=0\.009\)"/);
  assert.match(page, /never claims to predict citations/);
  assert.match(page, /Content relevance is the citation driver; technical health is the hygiene floor/);
});

test("README AI readiness derivation signals match the checks that compute them", async () => {
  assert.match(liveSection, /AI Answer Readiness \/ SEO-GEO readiness checks derived from rendered content depth, helpful schema, canonical\/internal-link clarity, question-led structure, sitemap context/i);
  const { checks } = (await fixtureAudit()).aiAnswerReadiness;
  for (const check of ["contentDepth", "structuredData", "sourceClarity", "answerStructure", "discoveryFiles"]) {
    assert.ok(checks[check], `${check} readiness check is computed`);
  }
});

test("README growth-opportunity claim stays draft-only", async () => {
  assert.match(liveSection, /Draft-only growth opportunities/i);
  assert.match(liveSection, /no article-volume autopilot, auto-publishing, or ranking promises/i);
  const growth = (await fixtureAudit()).growthOpportunities;
  assert.equal(growth.status, "ready");
  assert.ok(
    growth.opportunities.every((item) => item.status === "draft_only" && item.draftOnly),
    "growth opportunities are draft-only records"
  );
  assert.match(
    growth.note,
    /do not publish content, create CMS drafts, open pull requests, or promise rankings/,
    "no auto-publishing or ranking promises"
  );
});

test("README site-claim promise matches verified-host flow and apex/www folding", async () => {
  assert.match(liveSection, /Site ownership claims backed by D1 `site_claims`/i);
  assert.match(liveSection, /non-founder audits require a verified host \(apex and www count as one site\)/i);
  assert.match(liveSection, /homepage-only Lite check \(1 page, 3\/day\) runs without verification/i);
  const beta = await privateBeta();
  const claimHost = async (host) => {
    const response = await beta.call("/api/sites/claim", { method: "POST", body: { host } });
    assert.equal(response.status, 200);
    return (await response.json()).site;
  };
  const tokenFor = (host) =>
    beta.db.rows("SELECT verification_token FROM site_claims WHERE host = ?", host)[0].verification_token;

  await claimHost("dns-verified.example");
  const dnsText = siteVerificationText(tokenFor("dns-verified.example"));
  const dnsVerify = await withStubbedFetch(
    async (url) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 16, data: `"${dnsText}"` }] })
        : new Response("", { status: 404 }),
    () => beta.call("/api/sites/verify", { method: "POST", body: { host: "dns-verified.example" } })
  );
  assert.equal((await dnsVerify.json()).verified, true, "DNS TXT verification verifies the claim");

  await claimHost("example.com");
  const fileText = siteVerificationText(tokenFor("example.com"));
  const fileVerify = await withStubbedFetch(
    async (url) =>
      String(url) === "https://example.com/.well-known/seofixkit.txt"
        ? new Response(fileText, { status: 200 })
        : new Response("", { status: 404 }),
    () => beta.call("/api/sites/verify", { method: "POST", body: { host: "example.com" } })
  );
  assert.equal((await fileVerify.json()).verified, true, "HTTPS file verification verifies the claim");
  assert.deepEqual(beta.db.rows("SELECT host, status, verification_method FROM site_claims ORDER BY host"), [
    { host: "dns-verified.example", status: "verified", verification_method: "dns-txt" },
    { host: "example.com", status: "verified", verification_method: "https-file" }
  ]);

  const www = await beta.call("/api/audit", {
    method: "POST",
    body: { url: "https://www.example.com/", maxPages: 10 }
  });
  assert.equal(www.status, 202, "a claim on the apex domain also covers www");
  const unverified = await beta.call("/api/audit", {
    method: "POST",
    body: { url: "https://other.example/", maxPages: 10 }
  });
  assert.equal(unverified.status, 403, "non-founder multi-page audits require a verified host");
});

test("README beta-invite claim keeps the shared password a founder override", async () => {
  assert.match(liveSection, /the shared beta password is only a founder override/i);
  const beta = await privateBeta({ env: { BETA_ACCESS_PASSWORD: "FounderPass2026" } });
  const founder = await beta.call("/api/beta/login", {
    method: "POST",
    body: { email: "anyone@example.com", password: "FounderPass2026" }
  });
  assert.equal(founder.status, 200);
  assert.equal((await founder.json()).accessMode, "founder-override", "password path opens a founder-override session");
  const stored = beta.db.rows("SELECT access_mode FROM beta_sessions WHERE owner_email = 'anyone@example.com'");
  assert.deepEqual(stored, [{ access_mode: "founder-override" }]);
  const withoutPassword = await privateBeta();
  const wrong = await withoutPassword.call("/api/beta/login", {
    method: "POST",
    body: { email: "anyone@example.com", password: "FounderPass2026" }
  });
  assert.equal(wrong.status, 401, "with no BETA_ACCESS_PASSWORD configured the shared password opens nothing");
});

function proofReceiptInput(overrides = {}) {
  const report = {
    id: "report-1",
    url: "https://example.com/",
    createdAt: "2026-06-20T10:00:00.000Z",
    score: 85,
    findings: [
      {
        id: "issue-1",
        title: "Missing title",
        severity: "critical",
        pageUrl: "https://example.com/",
        evidence: "Rendered title is missing."
      }
    ]
  };
  const item = {
    id: "queue-1",
    reportId: "report-1",
    issueId: "issue-1",
    title: "Missing title",
    severity: "critical",
    pageUrl: "https://example.com/",
    proof: "Rendered title is missing.",
    acceptance: "Rendered title exists.",
    actionMode: "self_serve",
    status: "fixed",
    rerunStatus: "fixed"
  };
  const action = {
    id: "action-1",
    report_id: "report-1",
    queue_item_id: "queue-1",
    issue_id: "issue-1",
    action_mode: "self_serve",
    action_type: "metadata_copy",
    approval_state: "approved",
    execution_state: "applied",
    rerun_state: "fixed",
    rerun_report_id: "rerun-report-1",
    source_proof: "Rendered title is missing.",
    proposed_change: "Add title copy to the home page.",
    acceptance: "Rendered title exists.",
    applied_at: "2026-06-20T11:00:00.000Z",
    updated_at: "2026-06-20T12:05:00.000Z",
    ...overrides.action
  };
  const rerunReport = {
    id: "rerun-report-1",
    url: "https://example.com/",
    createdAt: "2026-06-20T12:00:00.000Z",
    score: 96,
    findings: [],
    reportDelta: { fixedIssues: [{ id: "issue-1", title: "Missing title", pageUrl: "https://example.com/" }] },
    ...overrides.rerunReport
  };
  return { report, item, action, rerunReport };
}

test("README repair-proof-receipt claim keeps publishing and ranking disclaimers", () => {
  assert.match(liveSection, /Private repair proof receipts after fixed rerun proof/i);
  assert.match(liveSection, /connecting the original issue, approved\/applied change, and same-host rerun report/i);
  const receipt = buildRepairProofReceipt(proofReceiptInput());
  assert.equal(receipt.ok, true);
  assert.match(
    receipt.markdown,
    /connects one owner-approved repair action to the same-host rerun proof/,
    "receipts connect the approved action to same-host rerun proof"
  );
  assert.match(liveSection, /without claiming SEOFixKit published or guaranteed the repair/i);
  assert.match(
    receipt.markdown,
    /does not mean SEOFixKit published, merged, indexed, ranked, or guaranteed the change/
  );
  assert.match(receipt.markdown, /Rankings, traffic, indexing, AI citations, and revenue are not guaranteed/);
});

// Functional claim pins. The numeric caps, routes, and state-truthfulness
// claims above are locked; these pins tie the remaining "What is live in this
// repo" bullets (rendered audit, evidence, intelligence, deltas, validation
// pack, PSI, waterfall, imports, platform, briefs, queue/board/packs, feed,
// proposals, D1 tables, and dashboard surfaces) to the behaviour that backs them.

test("README rendered-audit claims match the Worker browser runtime and local Playwright adapter", async () => {
  assert.match(liveSection, /Rendered-page audit powered by Cloudflare Browser Run in the Worker \(emulated by `wrangler dev` locally\); the offline audit smoke tests use Playwright/i);
  const browser = recordingBrowserBinding();
  await withStubbedFetch(
    async () => new Response("", { status: 404 }),
    () =>
      assert.rejects(
        workerAuditUrl("https://93.184.216.34/", { BROWSER: browser }, { maxPages: 1, pageSpeed: false }),
        (error) => error.code === "BROWSER_BUSY"
      )
  );
  assert.ok(
    browser.calls.some((url) => url.includes("/v1/devtools/browser")),
    "deployed Worker launches Browser Run through the BROWSER binding"
  );
  assert.equal(wranglerConfig.browser.binding, "BROWSER", "wrangler binds Browser Run as BROWSER");
  // The offline engine (server/audit/engine.js, Playwright) renders a real
  // page in worker/routes/public-check.test.mjs ("public check output is
  // verbatim engine output for the public test page") and
  // worker/routes/pages.test.mjs ("demo brief is verbatim real engine output").
  assert.match(liveSection, /Static HTML vs rendered DOM comparison/i);
  const report = await fixtureAudit();
  const guard = findingTitled(report, /False positive guarded on home: H1 exists after render/);
  assert.ok(guard, "engine compares static HTML (no H1) with the rendered DOM (H1)");
  assert.match(liveSection, /Evidence-backed findings/i);
  assert.ok(
    report.findings.filter((finding) => finding.severity !== "good").every((finding) => finding.evidence),
    "findings carry evidence"
  );
});

test("README crawl-depth and page-proof claims match per-page scores", async () => {
  assert.match(liveSection, /crawl-depth tiers up to 1,000 pages per queued audit/i);
  assert.equal(Math.max(...CRAWL_DEPTH_TIERS.map((tier) => tier.pages)), 1000, "deepest tier is 1,000 pages");
  assert.match(liveSection, /with per-page scores and page proof/i);
  const report = await fixtureAudit();
  assert.deepEqual(
    report.pageSummaries.map((page) => page.url),
    report.pages.map((page) => page.url),
    "every crawled page gets a summary"
  );
  for (const page of report.pageSummaries) {
    assert.equal(typeof page.score, "number", `${page.url} gets a score`);
  }
  assert.notEqual(
    report.pageSummaries[0].score,
    report.pageSummaries[1].score,
    "scores are per page, not copied from the site score"
  );
});

function crawlPage(url, { title = "", description = "", h1 = "", bodyText = "", links = [] } = {}) {
  return {
    url,
    finalUrl: url,
    rendered: {
      finalUrl: url,
      title,
      description,
      h1s: h1 ? [h1] : [],
      bodyText,
      wordCount: bodyText.split(" ").length,
      internalLinks: links.map((href) => ({ href, text: href }))
    }
  };
}

test("README crawl-intelligence claim matches every listed signal", () => {
  assert.match(liveSection, /internal link graph depth/i);
  assert.match(liveSection, /low-inbound pages/i);
  assert.match(liveSection, /sitemap-sample orphan candidates/i);
  assert.match(liveSection, /duplicate titles\/descriptions\/H1s/i);
  assert.match(liveSection, /near-duplicate content/i);
  assert.match(liveSection, /parameterized internal URLs/i);
  assert.match(liveSection, /keyword-cannibalization heuristics/i);
  const site = "https://plumber.example";
  const sharedBody = Array.from({ length: 60 }, (_, index) => `emergency plumbing repair word${index % 45}`).join(" ");
  const duplicate = {
    title: "Emergency plumbing repair Austin",
    description: "Fast emergency plumbing repair across Austin today.",
    h1: "Emergency plumbing repair",
    bodyText: sharedBody
  };
  const intelligence = buildCrawlIntelligence(
    {
      url: `${site}/`,
      pages: [
        crawlPage(`${site}/`, { title: "Home", links: [`${site}/a`, `${site}/b`, `${site}/shop?sort=price`] }),
        crawlPage(`${site}/a`, { ...duplicate, links: [`${site}/c`] }),
        crawlPage(`${site}/b`, duplicate),
        crawlPage(`${site}/c`, { title: "Deep page" })
      ]
    },
    { status: "ready", sampleUrls: [{ url: `${site}/orphan` }] }
  );
  const { checks } = intelligence;
  assert.equal(checks.duplicateTitles.length, 1, "duplicate titles checked");
  assert.equal(checks.duplicateDescriptions.length, 1, "duplicate descriptions checked");
  assert.equal(checks.duplicateH1s.length, 1, "duplicate H1s checked");
  assert.equal(checks.duplicateContentPairs.length, 1, "near-duplicate content checked");
  assert.deepEqual(
    checks.orphanInventoryCandidates.map((item) => item.url),
    [`${site}/orphan`],
    "sitemap orphan candidates checked"
  );
  assert.equal(checks.cannibalizationGroups.length, 1, "cannibalization heuristics checked");
  assert.deepEqual(
    checks.parameterizedLinks.map((link) => link.href),
    [`${site}/shop?sort=price`],
    "parameterized internal URLs checked"
  );
  assert.ok(
    checks.lowInboundPages.some((page) => page.url === `${site}/c`),
    "low-inbound pages checked"
  );
  assert.equal(
    checks.linkGraph.nodes.find((node) => node.url === `${site}/c`).depth,
    2,
    "internal link graph depth computed"
  );
});

test("README audit-history delta claim matches fixed, new, and still-open issues", async () => {
  assert.match(liveSection, /Audit history deltas for saved reruns/i);
  assert.match(liveSection, /fixed, new, and still-open proven issues/i);
  const issue = (title) => ({ type: "issue", severity: "warning", title, pageUrl: "https://example.com/" });
  const delta = buildReportDelta(
    { url: "https://example.com/", findings: [issue("Still broken"), issue("Brand new")] },
    { id: "previous-report-1", url: "https://example.com/", findings: [issue("Still broken"), issue("Since fixed")] }
  );
  assert.deepEqual(
    delta.fixedIssues.map((item) => item.title),
    ["Since fixed"],
    "fixed issues reported"
  );
  assert.deepEqual(
    delta.newIssues.map((item) => item.title),
    ["Brand new"],
    "new issues reported"
  );
  assert.deepEqual(
    delta.persistentIssues.map((item) => item.title),
    ["Still broken"],
    "still-open issues reported"
  );

  // The previous run is the latest saved report for the same owner and host.
  const db = createTestD1();
  const sameHost = insertSavedReport(db, { url: "https://example.com/", findings: [] });
  insertSavedReport(db, { url: "https://other.example/", findings: [] });
  insertSavedReport(db, { url: "https://example.com/", findings: [] }, { ownerEmail: "someone-else@example.com" });
  const previous = await latestSavedReportForDelta(
    { WAITLIST_DB: db },
    { ownerEmail: OWNER },
    "example.com",
    new Date().toISOString()
  );
  assert.equal(previous.id, sameHost, "delta compares against the same owner and host");
});

test("README technical validation pack covers every listed check", async () => {
  assert.match(liveSection, /Technical validation pack/i);
  for (const signal of [
    /broken links/i,
    /redirecting internal links/i,
    /broken images/i,
    /canonical reachability/i,
    /hreflang mistakes/i,
    /invalid JSON-LD/i,
    /HTTPS\/HSTS/i,
    /large assets/i,
    /slow rendered loads/i
  ]) {
    assert.match(liveSection, signal, `README lists ${signal}`);
  }
  const report = await fixtureAudit();
  assert.ok(findingTitled(report, /^Redirecting internal links on home/), "redirecting internal links checked");
  assert.ok(findingTitled(report, /^Broken internal links on home/), "broken links checked");
  assert.ok(findingTitled(report, /^Broken images on home/), "broken images checked");
  assert.ok(findingTitled(report, /^Canonical URL is not reachable on home/), "canonical reachability checked");
  assert.ok(findingTitled(report, /^Invalid hreflang code on home/), "hreflang mistakes checked");
  assert.match(
    findingTitled(report, /^Structured data JSON is invalid/).evidence,
    /JSON-LD could not be parsed/,
    "invalid JSON-LD checked"
  );
  assert.ok(findingTitled(report, /^HSTS security header missing on home/), "HSTS checked");
  assert.match(findingTitled(report, /^Large image files on home/).evidence, /huge\.jpg/, "large assets checked");
  // Slow rendered loads: shared/audit-engine.test.mjs ("settled slow pages
  // still get a slow-load finding with truthful evidence") renders a page that
  // settles after 4s and asserts the "Slow rendered load" finding.
});

test("README PageSpeed claim matches mobile score, lab metrics, and opportunities", async () => {
  assert.match(liveSection, /PageSpeed Insights \/ Lighthouse performance proof/i);
  const { performance, findings } = await fixtureAudit();
  assert.equal(performance.source, "pagespeed-insights-v5", "PSI result parsed");
  assert.equal(performance.strategy, "mobile");
  assert.equal(performance.performanceScore, 42, "mobile performance score parsed");
  assert.equal(performance.labMetrics.largestContentfulPaint.value, 5200, "Core Web Vitals lab metrics parsed");
  assert.equal(performance.labMetrics.totalBlockingTime.value, 900, "TBT lab metric parsed");
  assert.deepEqual(
    performance.opportunities.map((item) => item.id),
    ["render-blocking-resources"],
    "top opportunities parsed"
  );
  assert.ok(
    findings.some((finding) => /Mobile PageSpeed performance score is 42\/100/.test(finding.evidence)),
    "repair-ready PSI finding exists"
  );
});

test("README resource-waterfall claim matches request, transfer, and slow/heavy/render-blocking evidence", () => {
  assert.match(liveSection, /Browser resource-waterfall proof/i);
  assert.match(liveSection, /request counts/i);
  assert.match(liveSection, /observed transfer size/i);
  assert.match(liveSection, /slow\/heavy\/render-blocking resource evidence/i);
  const waterfall = buildResourceWaterfall({
    url: "https://public.example/",
    rendered: {
      finalUrl: "https://public.example/",
      navigationTiming: { domContentLoadedMs: 900 },
      resourceTimings: [
        {
          name: "https://public.example/app.css",
          initiatorType: "link",
          renderBlockingStatus: "blocking",
          startTime: 10,
          duration: 120,
          transferSize: 30_000
        },
        {
          name: "https://public.example/hero.jpg",
          initiatorType: "img",
          startTime: 20,
          duration: 2400,
          transferSize: 900_000
        }
      ],
      resourceTimingsTotal: 2
    }
  });
  assert.equal(waterfall.summary.totalRequests, 2, "request counts captured");
  assert.equal(waterfall.summary.totalTransferBytes, 930_000, "observed transfer size captured");
  assert.deepEqual(
    waterfall.slowResources.map((resource) => resource.url),
    ["https://public.example/hero.jpg"],
    "slow resources captured"
  );
  assert.deepEqual(
    waterfall.heavyResources.map((resource) => resource.url),
    ["https://public.example/hero.jpg"],
    "heavy resources captured"
  );
  assert.deepEqual(
    waterfall.renderBlockingCandidates.map((resource) => resource.url),
    ["https://public.example/app.css"],
    "render-blocking candidates captured"
  );
  assert.ok(waterfall.repairOpportunities.length > 0, "waterfall repair actions exist");
});

test("README backlink import claim matches live/lost proof, risk flags, and history tables", async () => {
  assert.match(liveSection, /backlink import audit and import-history tables for supplied rows/i);
  assert.match(liveSection, /live\/lost link proof, risky source signals, broken target checks, anchor concentration flags, and repair actions/i);
  const target = "https://target.example/";
  const sources = {
    "https://news.example/story": `<a href="${target}">cheap widgets</a>`,
    "https://blog.example/post": "<p>The link was removed.</p>",
    "https://spam-links.xyz/page": `<a href="${target}">cheap widgets</a><a href="https://target.example/missing">cheap widgets</a>`
  };
  const audit = await buildBacklinkAudit(
    { url: target, pages: [{ url: target, finalUrl: target, ok: true, status: 200 }] },
    [
      { sourceUrl: "https://news.example/story", targetUrl: target, anchorText: "cheap widgets" },
      { sourceUrl: "https://blog.example/post", targetUrl: target, anchorText: "cheap widgets" },
      { sourceUrl: "https://spam-links.xyz/page", targetUrl: target, anchorText: "cheap widgets" },
      {
        sourceUrl: "https://spam-links.xyz/page",
        targetUrl: "https://target.example/missing",
        anchorText: "cheap widgets"
      }
    ],
    {
      fetcher: async (url) =>
        sources[String(url)]
          ? new Response(sources[String(url)], { status: 200, headers: { "content-type": "text/html" } })
          : new Response("", { status: 404 }),
      privateAddressResolver: async () => false
    }
  );
  assert.equal(audit.summary.live, 3, "live link proof counted");
  assert.equal(audit.summary.lost, 1, "lost link proof counted");
  assert.ok(audit.summary.toxicRisk >= 1, "risky source signals flagged");
  assert.equal(audit.summary.brokenTargets, 1, "broken target checks exist");
  assert.deepEqual(
    audit.anchorRisks.map((risk) => risk.anchor),
    ["cheap widgets"],
    "anchor concentration flags exist"
  );
  assert.ok(audit.repairOpportunities.length >= 3, "backlink repair actions exist");
  const tables = createTestD1()
    .rows("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((row) => row.name);
  assert.ok(tables.includes("backlink_edges"), "backlink_edges history table exists");
  assert.ok(tables.includes("backlink_import_batches"), "backlink import batch table exists");
});

test("README local SEO claim matches NAP, LocalBusiness schema, and citation checks", async () => {
  assert.match(liveSection, /local SEO audit for supplied business details, Google Business Profile URL, local keywords, and citation URLs/i);
  assert.match(liveSection, /NAP, LocalBusiness schema, citation consistency, and repair actions/i);
  const report = await fixtureAudit();
  const audit = await buildLocalSeoAudit(
    report,
    {
      businessName: "Shop Example Store",
      phone: "+1 512 555 0100",
      address: "1 Main St, Austin, TX",
      googleBusinessProfileUrl: "https://maps.google.com/?cid=123",
      localKeywords: ["austin widgets"],
      citations: [{ sourceUrl: "https://directory.example/shop", businessName: "Shop Example Store" }]
    },
    {
      fetcher: async () =>
        new Response("Different Name LLC, 9 Other Rd", { status: 200, headers: { "content-type": "text/html" } }),
      privateAddressResolver: async () => false
    }
  );
  assert.equal(audit.status, "ready");
  assert.equal(audit.input.googleBusinessProfileUrl, "https://maps.google.com/?cid=123", "GBP URL accepted");
  assert.deepEqual(audit.input.localKeywords, ["austin widgets"], "local keywords accepted");
  assert.equal(audit.citationRows.length, 1, "citation URLs accepted");
  assert.ok(audit.summary.napFieldsSupplied >= 3, "NAP fields checked");
  const repairs = audit.repairOpportunities.map((item) => `${item.title} ${item.proof}`).join("\n");
  assert.match(repairs, /LocalBusiness schema is missing/, "LocalBusiness schema checked");
  assert.match(repairs, /citation/i, "citation consistency checked");
  const columns = createTestD1()
    .rows("PRAGMA table_info(audit_jobs)")
    .map((column) => column.name);
  assert.ok(columns.includes("local_seo_input_json"), "local SEO inputs stored on queued audits");
});

test("README keyword/rank import claim matches listed repair actions and history tables", async () => {
  assert.match(liveSection, /keyword\/rank import audit and trend-history tables/i);
  assert.match(liveSection, /for supplied Search Console or rank-tracker rows/i);
  assert.match(liveSection, /low-CTR/i);
  assert.match(liveSection, /page-two/i);
  assert.match(liveSection, /zero-click/i);
  assert.match(liveSection, /decline/i);
  assert.match(liveSection, /cannibalization/i);
  assert.match(liveSection, /intent-match/i);
  assert.match(liveSection, /uncrawled landing-page/i);
  const report = await fixtureAudit();
  const audit = buildKeywordRankAudit(report, [
    { query: "shop example widgets", pageUrl: `${SHOP}/`, clicks: 1, impressions: 800, position: 4 },
    { query: "buy blue widgets online", pageUrl: `${SHOP}/about`, clicks: 5, impressions: 400, position: 14 },
    { query: "widget repair kit", pageUrl: `${SHOP}/about`, clicks: 0, impressions: 300, position: 8 },
    {
      query: "widget sale",
      pageUrl: `${SHOP}/`,
      clicks: 5,
      impressions: 200,
      position: 6,
      previousClicks: 40,
      previousPosition: 2
    },
    { query: "shop example widgets", pageUrl: `${SHOP}/about`, clicks: 2, impressions: 150, position: 7 },
    { query: "widget care guide", pageUrl: `${SHOP}/guides/care`, clicks: 3, impressions: 120, position: 9 }
  ]);
  assert.equal(audit.status, "ready", "Search Console rows accepted");
  assert.match(audit.note, /supplied Search Console or rank-tracker rows/, "the audit names the supplied-row boundary");
  assert.ok(audit.checks.lowCtrRows.length, "low-CTR opportunities exist");
  assert.ok(audit.checks.pageTwoRows.length, "page-two opportunities exist");
  assert.ok(audit.checks.zeroClickRows.length, "zero-click rows exist");
  assert.ok(audit.checks.decliningRows.length, "decline rows exist");
  assert.ok(audit.checks.cannibalizationGroups.length, "cannibalization groups exist");
  assert.ok(audit.checks.landingMismatchRows.length, "intent-match check exists");
  assert.deepEqual(
    audit.checks.missingLandingPageRows.map((row) => row.pageUrl),
    [`${SHOP}/guides/care`],
    "uncrawled landing-page check exists"
  );
  const repairTitles = audit.repairOpportunities.map((item) => `${item.title} ${item.proof}`).join("\n");
  assert.match(repairTitles, /Ranking pages do not clearly reflect query intent/, "intent-match repair exists");
  assert.match(repairTitles, /were not crawled in this proof run/, "uncrawled landing-page repair exists");
  const columns = createTestD1()
    .rows("PRAGMA table_info(keyword_rank_observations)")
    .map((column) => column.name);
  assert.ok(columns.includes("position") && columns.includes("previous_position"), "trend-history table exists");
});

test("README platform audit claim matches schema, faceted, archive, and plugin checks", () => {
  assert.match(liveSection, /WordPress and ecommerce platform audit for detected stores\/CMS pages/i);
  assert.match(liveSection, /Product schema, BreadcrumbList schema, faceted\/variant URLs, WordPress archive links, and plugin resource repair actions/i);
  const pluginScript = "https://store.example/wp-content/plugins/woocommerce/assets/js/frontend.js";
  const audit = buildPlatformSeoAudit({
    url: "https://store.example/",
    pages: [
      {
        url: "https://store.example/product/blue-widget",
        rendered: {
          finalUrl: "https://store.example/product/blue-widget",
          generator: "WordPress 6.5",
          title: "Blue widget",
          bodyText: "Blue widget. Add to cart. Regular price $20.",
          wordCount: 300,
          schemaTypes: [],
          links: [
            { href: "https://store.example/shop/?filter_color=blue", text: "Blue" },
            { href: "https://store.example/category/news/", text: "News" }
          ],
          scripts: [{ src: pluginScript }]
        },
        resourceWaterfall: { resources: [{ url: pluginScript, label: "frontend.js", type: "script" }] }
      }
    ]
  });
  assert.equal(audit.status, "ready");
  assert.deepEqual(
    audit.detectedPlatforms.map((platform) => platform.id).sort(),
    ["woocommerce", "wordpress"],
    "stores/CMS platforms are detected from rendered proof"
  );
  assert.equal(audit.checks.productSchema.status, "needs_repair", "Product schema checked");
  assert.equal(audit.checks.breadcrumbSchema.status, "needs_review", "BreadcrumbList schema checked");
  assert.equal(audit.summary.facetedLinks, 1, "faceted/variant URLs checked");
  assert.equal(audit.summary.wordpressArchiveLinks, 1, "WordPress archive links checked");
  assert.equal(audit.summary.wordpressPluginResources, 1, "plugin resource impact checked");
  assert.ok(audit.repairOpportunities.length > 0, "platform repair actions exist");
});

test("README false-positive guard and fix snippet claims match engine output", async () => {
  assert.match(liveSection, /False-positive guard section/i);
  const report = await fixtureAudit();
  assert.ok(
    report.findings.some((finding) => finding.type === "guard" && finding.severity === "good"),
    "guards are typed findings"
  );
  assert.ok(report.summary.guardedFalsePositives > 0, "guards are counted in the report summary");
  assert.match(liveSection, /Generated fix snippets for common SEO repairs/i);
  assert.doesNotMatch(
    liveSection,
    /Exact fix snippets/,
    "README must not call generated engine markup an exact snippet (PR #102 rule: engine snippets are proposed repair markup, never a quote observed on the page)"
  );
  assert.match(findingTitled(report, /^Missing or weak title on home/).snippet, /^<title>/, "title fix snippets exist");
  assert.match(
    findingTitled(report, /^Missing meta description on home/).snippet,
    /^<meta name="description"/,
    "description fix snippets exist"
  );
});

test("README developer brief claim matches priority, effort, proof, acceptance, and snippets", async () => {
  assert.match(liveSection, /Copyable developer repair brief/i);
  assert.match(liveSection, /with priority, effort, proof, acceptance checks, and snippets/i);
  const report = await fixtureAudit();
  const brief = buildRemediationBrief(report);
  assert.deepEqual(
    brief.priorityQueue.map((item) => item.priority),
    brief.priorityQueue.map((_, index) => index + 1),
    "brief orders repairs by priority"
  );
  for (const item of brief.priorityQueue) {
    assert.ok(item.estimatedEffort, "brief includes effort");
    assert.ok(item.proof, "brief includes proof");
    assert.ok(item.acceptanceChecks.length, "brief includes acceptance checks");
  }
  assert.match(report.repairBrief, /```html\n<title>/, "copyable brief includes fix snippets");
});

test("README repair queue claim matches persistent records with proof, status, and rerun state", async () => {
  assert.match(liveSection, /Persistent repair queue records for saved reports, with proof snapshots, acceptance checks, status, action mode, rerun state, and approval-safe agent action records/i);
  const beta = await privateBeta();
  const reportId = insertSavedReport(beta.db, savedReportFixture(), { inviteId: beta.inviteId });
  const created = await beta.call(`/api/reports/${reportId}/repair-actions`, {
    method: "POST",
    body: { issueId: "issue-1", actionMode: "cms_draft", proposedChange: "Draft the fixed title for review." }
  });
  assert.equal(created.status, 201);
  const [queueItem] = beta.db.rows("SELECT * FROM repair_queue_items WHERE report_id = ?", reportId);
  assert.equal(queueItem.proof, "No title found.", "queue items store proof snapshots");
  assert.equal(queueItem.rerun_status, "not_run", "queue items keep rerun state");
  const [action] = beta.db.rows("SELECT * FROM repair_agent_actions WHERE report_id = ?", reportId);
  assert.equal(action.approval_state, "drafted", "agent actions are stored as approval-safe drafts");
  assert.equal(action.execution_state, "not_started", "a drafted action has not been applied");
});

test("README repair agent board claim matches assignment, notes, drafts, and approval controls", async () => {
  assert.match(liveSection, /Report-level repair agent board with status filters, teammate assignment, notes, safe draft actions, approval\/ignore controls, and no external publishing side effects/i);
  const beta = await privateBeta();
  const reportId = insertSavedReport(beta.db, savedReportFixture(), { inviteId: beta.inviteId });
  const now = new Date().toISOString();
  beta.db.insert("team_members", {
    id: randomUUID(),
    owner_email: OWNER,
    member_email: "dev@example.com",
    role: "editor",
    status: "active",
    created_at: now,
    updated_at: now
  });
  const collaboration = await beta.call(`/api/reports/${reportId}/collaboration`, {
    method: "PATCH",
    body: {
      items: [
        { issueId: "issue-1", assigneeEmail: "dev@example.com", status: "in_progress", note: "Title copy pending." }
      ]
    }
  });
  assert.equal(collaboration.status, 200);
  const [row] = beta.db.rows("SELECT assignee_email, note FROM issue_collaboration WHERE report_id = ?", reportId);
  assert.deepEqual(
    row,
    { assignee_email: "dev@example.com", note: "Title copy pending." },
    "teammate assignment and notes exist"
  );

  const draft = await beta.call(`/api/reports/${reportId}/repair-actions`, {
    method: "POST",
    body: { issueId: "issue-1", actionMode: "cms_draft", proposedChange: "Draft the fixed title." }
  });
  const { action } = await draft.json();
  assert.equal(action.approvalState, "drafted", "safe draft actions exist");
  const approve = await beta.call(`/api/reports/${reportId}/repair-actions/${action.id}`, {
    method: "PATCH",
    body: { approvalState: "approved" }
  });
  assert.equal((await approve.json()).action.approvalState, "approved", "approval controls exist");
  const ignore = await beta.call(`/api/reports/${reportId}/repair-actions/${action.id}`, {
    method: "PATCH",
    body: { approvalState: "ignored" }
  });
  assert.equal((await ignore.json()).action.approvalState, "ignored", "ignore controls exist");
  const queue = await (await beta.call(`/api/reports/${reportId}/repair-queue`)).json();
  assert.ok(
    queue.items.every((item) => typeof item.status === "string"),
    "queue items carry the status the board filters on"
  );
  // The board's status filter UI is checked in a browser by test/spa.test.mjs.
});

function implementationPackInput(actionOverrides = {}) {
  return {
    report: { id: "report-1", url: "https://example.com/" },
    item: {
      id: "queue-1",
      reportId: "report-1",
      issueId: "issue-1",
      title: "Missing title",
      severity: "critical",
      pageUrl: "https://example.com/",
      proof: "Rendered title is missing.",
      fix: "Add a descriptive title.",
      acceptance: "Rendered title exists.",
      actionMode: "self_serve",
      status: "approved"
    },
    action: {
      id: "action-1",
      report_id: "report-1",
      queue_item_id: "queue-1",
      issue_id: "issue-1",
      action_mode: "self_serve",
      action_type: "metadata_copy",
      approval_state: "approved",
      execution_state: "not_started",
      rerun_state: "not_run",
      source_proof: "Rendered title is missing.",
      proposed_change: "Add title copy to the home page.",
      acceptance: "Rendered title exists.",
      ...actionOverrides
    }
  };
}

test("README implementation pack claim matches proof, handoff, acceptance, rollback, and rerun proof", () => {
  assert.match(liveSection, /Private implementation packs for owner-approved repair actions, with source proof, approved change text, mode-specific handoff steps, acceptance checks, rollback notes, and rerun-proof instructions/i);
  const pack = buildRepairImplementationPack(implementationPackInput());
  assert.equal(pack.ok, true);
  assert.match(pack.markdown, /## Source Proof\n[\s\S]*Rendered title is missing/, "source proof exists");
  assert.match(pack.markdown, /## Acceptance Check\n[\s\S]*Rendered title exists/, "acceptance checks exist");
  assert.match(pack.markdown, /## Rollback Note/, "rollback notes exist");
  assert.match(pack.markdown, /## Rerun Proof/, "rerun-proof instructions exist");
  const cms = buildRepairImplementationPack(
    implementationPackInput({ action_mode: "cms_draft", action_type: "cms_draft" })
  );
  assert.match(cms.markdown, /Create a draft edit in the CMS/, "mode-specific handoff steps exist");
  assert.doesNotMatch(pack.markdown, /Create a draft edit in the CMS/, "handoff steps differ by mode");
});

test("README account repair feed claim matches ranked open, drafted, applied, and regression items", () => {
  assert.match(liveSection, /Account-level repair agent feed that ranks open repairs, drafted actions awaiting approval, applied repairs needing rerun proof, and monitor regressions across recent reports/i);
  const item = (issueId, status, latestAction = null) => ({
    issueId,
    title: `Repair ${issueId}`,
    severity: "warning",
    status,
    rerunStatus: "not_run",
    priority: 1,
    latestAction
  });
  const summary = repairAccountSummaryFromItems(
    [
      {
        response: { id: "report-1", url: "https://example.com/" },
        report: {
          reportDelta: {
            summary: { newIssuesCount: 1 },
            newIssues: [{ title: "New broken link", severity: "critical" }]
          }
        },
        items: [
          item("open-1", "open"),
          item("drafted-1", "drafted", { approvalState: "drafted" }),
          item("applied-1", "applied", { approvalState: "approved", executionState: "applied" })
        ]
      }
    ],
    [{ lastReportId: "report-1" }]
  );
  assert.deepEqual(
    summary.nextItems.map((next) => next.nextActionId),
    ["review-monitor-regression", "approve-drafted-repair", "rerun-applied-repair", "start-proof-repair"],
    "items are ranked: regressions, drafts awaiting approval, applied awaiting rerun, then open repairs"
  );
  assert.equal(summary.counts.monitorRegressions, 1, "monitor regressions ranked");
  assert.equal(summary.counts.awaitingApproval, 1, "drafted actions awaiting approval counted");
  assert.equal(summary.counts.appliedAwaitingRerun, 1, "applied repairs needing rerun proof surfaced");
});

test("README repair proposal claim matches report-seeded, pre-purchase approvable records", async () => {
  // Proposals are no longer tied to a Fix Pack request at creation: a saved
  // report seeds them unattached, the owner can approve before paying, and
  // checkout is what attaches them to a fix request.
  assert.match(
    liveSection,
    /Repair proposal records seeded when a saved report is viewed, owner-approvable before purchase, and attached to a fix request when checkout starts/i
  );
  assert.doesNotMatch(
    liveSection,
    /Repair proposal records tied to Fix Pack requests/i,
    "the README may not claim proposals only exist for Fix Pack requests"
  );
  const beta = await privateBeta();
  const reportId = insertSavedReport(beta.db, savedReportFixture(), { inviteId: beta.inviteId });
  assert.equal((await beta.call(`/api/reports/${reportId}`)).status, 200);
  const proposals = beta.db.rows(
    "SELECT id, fix_request_id, approval_status FROM repair_proposals WHERE report_id = ?",
    reportId
  );
  assert.equal(proposals.length, 1, "saved report load seeds proposals");
  assert.ok(!proposals[0].fix_request_id, "seeded proposals are not attached to a fix request");
  const approve = await beta.call(`/api/reports/${reportId}/repair-proposals/${proposals[0].id}`, {
    method: "PATCH",
    body: { action: "approve" }
  });
  assert.equal(approve.status, 200, "unattached proposals stay owner-approvable before purchase");
  assert.equal(
    beta.db.rows("SELECT approval_status FROM repair_proposals WHERE id = ?", proposals[0].id)[0].approval_status,
    "approved"
  );
  // Checkout attaching the approved queue to a fix request: worker/routes/
  // billing.test.mjs ("Repair Sprint checkout can use a report-level
  // owner-approved proposal") asserts the proposal's fix_request_id is set.
  assert.match(liveSection, /final rerun proof references/i);
  assert.match(liveSection, /protected retention for paid proof/i);
  const db = createTestD1();
  const expired = isoFromNow(-DAY_MS);
  const paidReport = insertSavedReport(db, savedReportFixture(), { expiresAt: expired });
  const unpaidReport = insertSavedReport(db, savedReportFixture(), { expiresAt: expired });
  const now = new Date().toISOString();
  db.insert("fix_requests", {
    id: "fix-request-paid",
    report_id: paidReport,
    owner_email: OWNER,
    target_url: "https://example.com/",
    target_host: "example.com",
    status: "paid",
    created_at: now,
    updated_at: now
  });
  await cleanupExpiredRows({ WAITLIST_DB: db });
  const remaining = db.rows("SELECT id, expires_at FROM audit_reports");
  assert.deepEqual(
    remaining.map((row) => row.id),
    [paidReport],
    "paid Fix Pack reports keep protected retention"
  );
  assert.ok(!remaining.some((row) => row.id === unpaidReport), "unpaid expired reports are still cleaned up");
});

test("README Dodo var list does not claim an unwired product id is already in wrangler.jsonc", () => {
  assert.match(
    readme,
    /A product id for an offer whose Dodo product is not wired yet is added to `wrangler\.jsonc` at that point/i
  );
  assert.match(
    readme,
    /`DODO_SEOFIXKIT_PRODUCT_REPAIR_SPRINT_ID` \(added to `wrangler\.jsonc` when the Repair Sprint product is wired/i
  );
  assert.ok(wranglerConfig.vars.DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID, "the wired Fix Pack product id is present");
  assert.equal(
    wranglerConfig.vars.DODO_SEOFIXKIT_PRODUCT_REPAIR_SPRINT_ID,
    undefined,
    "the Repair Sprint product id is not wired yet, so the README may not list it as present"
  );
  // Deployed vars alone (no Repair Sprint product id) keep Repair Sprint
  // checkout closed.
  assert.equal(
    dodoRepairSprintCheckoutConfigStatus({ ...wranglerConfig.vars, DODO_SEOFIXKIT_API_KEY: "test-key" }).checkoutReady,
    false,
    "a missing Repair Sprint product id fails checkout closed"
  );
});

test("README React interface and Cloudflare Worker target claims match the build", () => {
  assert.match(liveSection, /Founder-friendly React interface/i);
  // The React app mounting into #root is checked in a browser by test/spa.test.mjs.
  assert.match(liveSection, /Cloudflare Worker target using Workers Static Assets and Browser Run/i);
  assert.equal(wranglerConfig.browser.binding, "BROWSER", "Browser Run binding configured");
  assert.equal(wranglerConfig.assets.binding, "ASSETS", "Workers Static Assets configured");
  assert.ok(wranglerConfig.assets.directory, "static assets directory configured");
});

test("README homepage, waitlist, and access claims match the Worker and D1", async () => {
  assert.match(liveSection, /Locked private-beta homepage with `\/api\/waitlist` and `\/api\/access\/request` backed by D1/i);
  assert.ok(workerRoutes("/api/waitlist", "POST"), "waitlist endpoint registered");
  assert.ok(workerRoutes("/api/access/request", "POST"), "access request endpoint registered");
  const beta = await privateBeta({
    env: { EMAIL: { send: async () => ({ ok: true }) }, SEOFIXKIT_EMAIL_FROM: "beta@seofixkit.com" }
  });
  assert.equal((await beta.call("/api/waitlist", { method: "POST", body: { email: "lead@example.com" } })).status, 200);
  assert.deepEqual(
    beta.db.rows("SELECT email FROM waitlist_leads"),
    [{ email: "lead@example.com" }],
    "waitlist writes to D1"
  );
  assert.equal(
    (await beta.call("/api/access/request", { method: "POST", body: { email: "new@example.com" } })).status,
    200
  );
  assert.deepEqual(
    beta.db.rows("SELECT owner_email, used_at FROM access_tokens"),
    [{ owner_email: "new@example.com", used_at: null }],
    "access tokens backed by D1"
  );
});

test("README beta workbench and session claims match D1-backed records", async () => {
  assert.match(
    liveSection,
    /Hidden `\/beta` private audit workbench protected by invite code login or a secure one-use email access link/i
  );
  const assets = {
    fetch: async () => new Response("<!doctype html><div id=root></div>", { headers: { "content-type": "text/html" } })
  };
  const shell = await workerApp.fetch(new Request(`${ORIGIN}/beta`), { ASSETS: assets }, testCtx());
  assert.equal(shell.headers.get("x-robots-tag"), "noindex, nofollow", "/beta serves with private headers");
  assert.equal(shell.headers.get("cache-control"), "no-store", "/beta is never cached");

  assert.match(liveSection, /Expiring beta sessions backed by D1 `beta_sessions`/i);
  const beta = await privateBeta();
  assert.equal((await beta.call("/api/beta/session")).status, 200, "a live session is accepted");
  beta.db.sqlite.prepare("UPDATE beta_sessions SET expires_at = ?").run(isoFromNow(-1000));
  const expired = await beta.call("/api/beta/session");
  assert.equal(expired.status, 401, "beta sessions expire");
  assert.match((await expired.json()).error, /expired/);

  assert.match(liveSection, /Explicit session access modes for invite, self-serve, and founder override sessions/i);
  assert.match(liveSection, /Admin-created beta invite codes backed by D1 `beta_invites`/i);
  assert.match(liveSection, /Single-use self-serve access tokens backed by D1 `access_tokens`/i);
  const sentLinks = [];
  const env = {
    WAITLIST_DB: createTestD1(),
    ADMIN_EXPORT_TOKEN: "admin-token-123",
    BETA_ACCESS_PASSWORD: "FounderPass2026",
    EMAIL: { send: async (message) => sentLinks.push(message) },
    SEOFIXKIT_EMAIL_FROM: "beta@seofixkit.com"
  };
  const post = (path, body, headers = {}) =>
    workerApp.fetch(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body)
      }),
      env,
      testCtx()
    );
  const invite = await post(
    "/admin/invites",
    { email: "invitee@example.com", code: "InviteCode2026" },
    { authorization: "Bearer admin-token-123" }
  );
  assert.equal(invite.status, 200, "admins create invite codes");
  const inviteLogin = await post("/api/beta/login", { email: "invitee@example.com", inviteCode: "InviteCode2026" });
  assert.equal((await inviteLogin.json()).accessMode, "invite", "invite mode exists");
  const founderLogin = await post("/api/beta/login", { email: "founder@example.com", password: "FounderPass2026" });
  assert.equal((await founderLogin.json()).accessMode, "founder-override", "founder-override mode exists");
  assert.equal((await post("/api/access/request", { email: "self@example.com" })).status, 200);
  const accessToken = new URL(
    JSON.stringify(sentLinks.at(-1)).match(/https:\/\/seofixkit\.com\/beta\?access=[^"\\ ]+/)[0]
  ).searchParams.get("access");
  const verify = await post("/api/access/verify", { token: accessToken });
  assert.equal((await verify.json()).accessMode, "self-serve", "self-serve mode exists");
  assert.equal((await post("/api/access/verify", { token: accessToken })).status, 401, "access tokens are single-use");
  assert.deepEqual(env.WAITLIST_DB.rows("SELECT owner_email, access_mode FROM beta_sessions ORDER BY owner_email"), [
    { owner_email: "founder@example.com", access_mode: "founder-override" },
    { owner_email: "invitee@example.com", access_mode: "invite" },
    { owner_email: "self@example.com", access_mode: "self-serve" }
  ]);
  const tables = env.WAITLIST_DB.rows("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
  for (const table of [
    "access_tokens",
    "beta_invites",
    "beta_sessions",
    "site_claims",
    "audit_jobs",
    "audit_schedules",
    "audit_reports"
  ]) {
    assert.ok(tables.includes(table), `${table} table exists`);
  }
});

test("README account summary, developer API, admin ops, and Fix Pack CTA claims match code", async () => {
  assert.match(liveSection, /Customer workspace summary API and dashboard at `\/api\/account\/summary`/i);
  assert.ok(workerRoutes("/api/account/summary", "GET"), "account summary route registered");
  // Built from repair items: worker/routes/account.test.mjs ("account summary
  // derives open repairs from recent reports before queue rows exist").
  assert.match(
    liveSection,
    /Self-serve Developer API keys, `\/v1\/audits` JSON endpoints, project-style verified sites, safe `repair_queue` issue status, separate approved-action implementation-pack and fixed-proof receipt markdown endpoints, and audit\/repair-action lifecycle webhooks/i
  );
  assert.ok(
    workerRoutes("/v1/audits/:id/repair-actions/:actionId/implementation.md", "GET"),
    "implementation-pack markdown endpoint exists"
  );
  assert.ok(
    workerRoutes("/v1/audits/:id/repair-actions/:actionId/proof.md", "GET"),
    "proof-receipt markdown endpoint exists"
  );
  const beta = await privateBeta();
  const developer = await (await beta.call("/api/developer")).json();
  assert.match(developer.docs.webhookEvents, /audit\.completed[\s\S]*repair_action\.fixed/, "lifecycle webhooks exist");
  assert.equal(developer.docs.projects, "GET /v1/projects", "project-style verified sites endpoint exists");
  // Webhook delivery: worker/lib/webhooks.test.mjs and worker/routes/
  // developer-api.test.mjs ("Developer API repair action webhooks deliver
  // lifecycle transitions without private draft payload").

  assert.match(liveSection, /`\/beta\/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests/i);
  const adminEnv = { WAITLIST_DB: createTestD1(), ADMIN_EXPORT_TOKEN: "admin-token-123" };
  const repeated = {
    url: "https://a.example/",
    findings: [
      { type: "issue", severity: "warning", title: "Missing meta description on home", pageUrl: "https://a.example/" }
    ]
  };
  insertSavedReport(adminEnv.WAITLIST_DB, repeated);
  insertSavedReport(adminEnv.WAITLIST_DB, { ...repeated, url: "https://b.example/" });
  const admin = await (
    await workerApp.fetch(
      new Request(`${ORIGIN}/admin/summary`, { headers: { authorization: "Bearer admin-token-123" } }),
      adminEnv,
      testCtx()
    )
  ).json();
  assert.ok(admin.issuePatterns.length > 0, "repeated issue patterns surfaced");
  assert.ok(Array.isArray(admin.fixQueue), "fix requests surfaced");

  assert.match(liveSection, /Dodo-backed SEO Fix Pack checkout CTA inside reports when real fixes exist/i);
  assert.equal(
    fixPackCheckoutDisabled({ hasPriorityFixes: true, pricingStatus: "available" }),
    false,
    "Fix Pack checkout opens when real fixes exist"
  );
  assert.equal(
    fixPackCheckoutDisabled({ hasPriorityFixes: false, pricingStatus: "available" }),
    true,
    "no Fix Pack checkout without real fixes"
  );
  assert.equal(
    buildRemediationBrief(await fixtureAudit()).support.fixPackEligible,
    true,
    "reports become Fix Pack eligible when real fixes exist"
  );
  assert.equal(
    buildRemediationBrief({ url: "https://clean.example/", findings: [] }).support.fixPackEligible,
    false,
    "a clean report is not Fix Pack eligible"
  );
  assert.match(liveSection, /Public `\/support`, `\/terms`, and `\/privacy` pages/i);
  for (const page of ["/support", "/terms", "/privacy"]) {
    assert.ok(workerRoutes(page, "GET"), `Worker must route ${page}`);
  }
});

test("README large-crawl staged-plan claim keeps scale readiness honest", async () => {
  assert.match(liveSection, /merge-readiness gates/i);
  const job = { frontierIngestionStatus: "complete" };
  const batches = [
    { id: "batch-1", status: "completed", plannedUrlCount: 1, renderedUrlCount: 1 },
    { id: "batch-2", status: "queued", plannedUrlCount: 1, renderedUrlCount: 0 }
  ];
  const frontier = [
    { id: "url-1", batchId: "batch-1", status: "rendered" },
    { id: "url-2", batchId: "batch-2", status: "queued" }
  ];
  const readiness = largeRenderedCrawlMergeReadiness(job, batches, frontier, [{ frontierId: "url-1" }]);
  assert.equal(readiness.ready, false, "merge readiness gated while batches are still queued");
  assert.ok(readiness.blockers.length > 0, "merge blockers are named");
  assert.match(liveSection, /scale-readiness repair actions/i);
  const { renderedCrawlScale } = await fixtureAudit();
  assert.ok(renderedCrawlScale.repairOpportunities.length > 0, "scale readiness repair actions exist");
  assert.match(liveSection, /never sold as completed 50K rendered validation/i);
  const surfaces = [
    ...(await Promise.all(PUBLIC_HTML_PATHS.map((path) => publicPage(path)))),
    llmsText(ORIGIN),
    homeMarkdown(ORIGIN)
  ].join("\n");
  const completed50kMentions = (surfaces.match(/completed 50K rendered validation/gi) || []).length;
  const negated50kMentions = (surfaces.match(/never sold as completed 50K rendered validation/gi) || []).length;
  assert.ok(negated50kMentions >= 1, "public surfaces state the staged 50K crawl boundary");
  assert.equal(
    completed50kMentions,
    negated50kMentions,
    "public surfaces only mention completed 50K rendered validation inside the never-sold-as negation"
  );
});

test("README sitemap inventory claim keeps rendered repair proof separate", async () => {
  assert.match(liveSection, /discovering up to 50,000 sitemap URLs while keeping rendered repair proof separate/i);
  const urls = Array.from(
    { length: CRAWLRAVEN_PUBLIC_CRAWL_PAGES + 10 },
    (_, index) => `<url><loc>https://big.example/p/${index}</loc></url>`
  ).join("");
  const inventory = await buildCrawlInventory("https://big.example/", {
    robots: { ok: true, body: "User-agent: *\nSitemap: https://big.example/sitemap.xml\n" },
    maxUrls: 100_000,
    fetcher: async () =>
      new Response(`<urlset>${urls}</urlset>`, { status: 200, headers: { "content-type": "application/xml" } }),
    privateAddressResolver: async () => false
  });
  assert.equal(inventory.summary.urlsDiscovered, 50000, "inventory cap is 50,000 URLs");
  assert.equal(inventory.summary.truncated, true, "inventory reports the cap was reached");
  const tables = createTestD1()
    .rows("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((row) => row.name);
  assert.ok(tables.includes("large_crawl_url_proofs"), "large-crawl proof stored separately");
});

test("README queued-job claim matches status polling before the private report loads", () => {
  assert.match(liveSection, /Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads/i);
  // The UI polling /api/audit/jobs/:id before loading the report is checked in a browser by test/spa.test.mjs.
});

test("README saved-report claim matches owner email and invite-bound ownership", async () => {
  assert.match(
    liveSection,
    /Saved private report URLs backed by D1 `audit_reports`, tied to the beta owner email and invite where available/i
  );
  const db = createTestD1();
  const access = { ownerEmail: OWNER, inviteId: "invite-1", accessMode: "invite", sessionHash: "session-hash" };
  const saved = await saveAuditReportWithContext(
    { url: "https://example.com/", origin: "https://example.com", score: 90, findings: [] },
    { WAITLIST_DB: db },
    access,
    ORIGIN
  );
  const [row] = db.rows("SELECT owner_email, owner_invite_id FROM audit_reports WHERE id = ?", saved.id);
  assert.deepEqual(
    row,
    { owner_email: OWNER, owner_invite_id: "invite-1" },
    "reports are stored with owner email and invite id"
  );

  const beta = await privateBeta();
  const lite = await beta.call("/api/audit", { method: "POST", body: { url: "https://queued.example/", maxPages: 1 } });
  assert.equal(lite.status, 202);
  assert.deepEqual(
    beta.db.rows("SELECT owner_invite_id FROM audit_jobs"),
    [{ owner_invite_id: beta.inviteId }],
    "queued audits carry the owner invite"
  );
  const otherInvite = insertSavedReport(beta.db, savedReportFixture(), { inviteId: "another-invite" });
  assert.equal(
    (await beta.call(`/api/reports/${otherInvite}`)).status,
    404,
    "a report bound to another invite stays private"
  );
});

test("README public support, terms, and privacy pages keep no-ranking-guarantee copy", async () => {
  assert.match(
    liveSection,
    /Public `\/support`, `\/terms`, and `\/privacy` pages with no ranking guarantees/i
  );
  assert.match(
    visibleText(await publicPage("/terms")),
    /No ranking, indexing, traffic, revenue, or search-engine outcome is promised/,
    "terms page carries no ranking promise"
  );
  assert.match(
    visibleText(await publicPage("/support")),
    /No ranking, traffic, or revenue promise is made/,
    "support page carries no ranking promise"
  );
  assert.match(
    visibleText(await publicPage("/packages")),
    /No ranking or traffic guarantee/,
    "the Fix Pack card carries no ranking guarantee"
  );
  // /privacy renders but carries no explicit no-guarantee line of its own; the
  // claim holds only in the sense that it makes no ranking promise.
  assert.doesNotMatch(
    visibleText(await publicPage("/privacy")),
    /guarantee[sd]? (?:higher |better )?rankings?/i,
    "privacy page makes no ranking promise"
  );
});

// Lane-1 audit refinement. A fresh spot-check of every 'What is live in this
// repo' bullet found eleven sub-claims inside already-pinned bullets that had
// no regression pin of their own. Each pin below ties the README wording to
// the behaviour that must keep backing it.

test("README inventory claim keeps robots.txt and sitemap discovery", async () => {
  assert.match(liveSection, /High-scale crawl inventory from robots\.txt and sitemaps/i);
  const { crawlInventory } = await fixtureAudit();
  assert.equal(crawlInventory.source, "robots-and-sitemaps", "inventory rows carry the robots/sitemap source");
  assert.ok(
    crawlInventory.sampleUrls.some((item) => item.url === `${SHOP}/orphan-guide`),
    "inventory seeds from the sitemap named in robots.txt"
  );
});

test("README large-crawl claim keeps stored frontier, proof, and retry state", () => {
  assert.match(liveSection, /stored frontier\/proof\/retry state/i);
  const tables = createTestD1()
    .rows("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((row) => row.name);
  assert.ok(tables.includes("large_crawl_frontier"), "large-crawl frontier table exists");
  assert.ok(tables.includes("large_crawl_url_proofs"), "large-crawl proof table exists");
  const retried = retryLargeRenderedCrawlFailures(
    { status: "failed" },
    [{ id: "batch-1", status: "failed", retryCount: 0 }],
    [{ id: "url-1", batchId: "batch-1", status: "failed", retryCount: 0 }]
  );
  assert.equal(retried.retryableBatchCount, 1, "large-crawl retry logic requeues failed batches");
  assert.equal(retried.frontierRows[0].status, "queued", "failed frontier URLs are requeued");
  assert.ok(workerRoutes("/api/large-crawls/:id/retry", "POST"), "large-crawl routes expose retries");
  assert.ok(workerRoutes("/v1/large-crawls/:id/retry", "POST"), "the API exposes retries");
});

test("README competitor claim keeps competitor-backed repair gaps in reports and briefs", async () => {
  assert.match(liveSection, /with competitor-backed repair gaps added to reports and briefs/i);
  const report = await fixtureAudit();
  assert.equal(report.competitorBenchmark.status, "ready", "reports embed competitor benchmark gaps");
  assert.ok(report.competitorBenchmark.repairOpportunities.length > 0, "competitor gaps become repair actions");
  assert.match(
    report.repairBrief,
    /## Competitor benchmark[\s\S]*### Competitor gap repairs/,
    "briefs include competitor-backed repair lines"
  );
});

test("README AI readiness claim keeps optional /llms.txt reachability checks", async () => {
  assert.match(liveSection, /optional `\/llms\.txt` reachability/i);
  const report = await fixtureAudit();
  const missing = report.aiAnswerReadiness.checks.discoveryFiles.llmsTxt;
  assert.equal(missing.ok, false, "llms.txt reachability is checked");
  assert.equal(missing.status, 404);
  const present = buildAiAnswerReadiness(report, {
    llmsTxt: { ok: true, status: 200, url: `${SHOP}/llms.txt`, contentLength: 24, bodySample: "# Shop Example" }
  });
  assert.equal(present.checks.discoveryFiles.llmsTxt.ok, true, "AI readiness accepts optional llms.txt proof");
});

test("README repair queue claim keeps acceptance checks, status, and action mode", async () => {
  assert.match(liveSection, /Persistent repair queue records for saved reports/i);
  const beta = await privateBeta();
  const fixture = savedReportFixture();
  fixture.findings[0].acceptance = "Rerun shows a unique title on home.";
  const reportId = insertSavedReport(beta.db, fixture, { inviteId: beta.inviteId });
  const saved = await beta.call(`/api/reports/${reportId}/repair-queue`, {
    method: "PATCH",
    body: { issueId: "issue-1", status: "in_progress", actionMode: "cms_draft" }
  });
  assert.equal(saved.status, 200);
  const [row] = beta.db.rows(
    "SELECT acceptance, status, action_mode FROM repair_queue_items WHERE report_id = ?",
    reportId
  );
  assert.equal(row.acceptance, "Rerun shows a unique title on home.", "queue records keep acceptance checks");
  assert.equal(row.status, "in_progress", "queue items store status");
  assert.equal(row.action_mode, "cms_draft", "queue items store action mode");
});

test("README repair board claim keeps no external publishing side effects", () => {
  assert.match(liveSection, /and no external publishing side effects/i);
  // The board's draft-only, publish-nothing behaviour is checked in a browser by test/spa.test.mjs.
});

test("README implementation pack claim keeps approved change text", () => {
  assert.match(liveSection, /with source proof, approved change text/i);
  const pack = buildRepairImplementationPack(implementationPackInput());
  assert.match(
    pack.markdown,
    /## Approved Change\n[\s\S]*Add title copy to the home page\./,
    "pack carries the approved change text"
  );
  assert.match(
    pack.markdown,
    /Apply only the approved change above\./,
    "pack instructs applying only the approved change"
  );
  const empty = buildRepairImplementationPack(implementationPackInput({ proposed_change: "" }));
  assert.equal(empty.ok, false);
  assert.match(
    empty.error,
    /Implementation pack needs an approved proposed change\./,
    "pack requires an approved change"
  );
  const drafted = buildRepairImplementationPack(implementationPackInput({ approval_state: "drafted" }));
  assert.equal(drafted.ok, false, "a drafted (unapproved) change gets no pack");
});

test("README proposal claim keeps execution modes, owner approval, and delivery state", async () => {
  assert.match(liveSection, /owner-approvable before purchase/i);
  assert.match(liveSection, /with execution modes, delivery state/i);
  const beta = await privateBeta();
  const reportId = insertSavedReport(beta.db, savedReportFixture(), { inviteId: beta.inviteId });
  await beta.call(`/api/reports/${reportId}`);
  const [proposal] = beta.db.rows(
    "SELECT id, execution_mode, approval_status, delivery_status FROM repair_proposals WHERE report_id = ?",
    reportId
  );
  assert.ok(proposal.execution_mode, "proposals store execution mode");
  assert.equal(proposal.delivery_status, "draft", "proposals store delivery state");
  await beta.call(`/api/reports/${reportId}/repair-proposals/${proposal.id}`, {
    method: "PATCH",
    body: { action: "dismiss" }
  });
  assert.equal(
    beta.db.rows("SELECT approval_status FROM repair_proposals WHERE id = ?", proposal.id)[0].approval_status,
    "dismissed",
    "approve endpoint updates owner approval"
  );
});

test("README schedule claim keeps dashboard add and pause controls", () => {
  assert.match(liveSection, /Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts/i);
  // The dashboard add/pause monitor controls are checked in a browser by test/spa.test.mjs.
});

test("README developer API claim keeps safe repair_queue issue status", async () => {
  assert.match(liveSection, /safe `repair_queue` issue status/i);
  const beta = await privateBeta();
  const developer = await (await beta.call("/api/developer")).json();
  assert.match(
    developer.issueFields.repair_queue,
    /Safe per-issue queue status\./,
    "API documents queue status as safe"
  );
  assert.match(
    developer.issueFields.repair_queue,
    /Draft text is only returned/,
    "draft change text stays owner-scoped"
  );
  // The issues endpoint really omits draft text: worker/routes/
  // developer-api.test.mjs ("Developer API overlays safe repair queue and
  // action status on issues") asserts the private draft copy is absent.
});

test("README retention claim keeps cleanup for expired reports, sessions, and quota buckets", async () => {
  assert.match(liveSection, /30-day report retention with cleanup for expired reports, sessions, and quota buckets/i);
  const db = createTestD1();
  const expired = isoFromNow(-DAY_MS);
  const expiredReport = insertSavedReport(db, savedReportFixture(), { expiresAt: expired });
  const liveReport = insertSavedReport(db, savedReportFixture());
  db.insert("beta_sessions", {
    token_hash: "expired",
    owner_email: OWNER,
    created_at: expired,
    expires_at: expired,
    last_seen_at: expired,
    access_mode: "invite"
  });
  db.insert("beta_sessions", {
    token_hash: "live",
    owner_email: OWNER,
    created_at: expired,
    expires_at: isoFromNow(DAY_MS),
    last_seen_at: expired,
    access_mode: "invite"
  });
  db.insert("audit_usage", {
    bucket: "audit:ip:old",
    count: 1,
    window_start: "old",
    updated_at: isoFromNow(-8 * DAY_MS)
  });
  db.insert("audit_usage", {
    bucket: "audit:ip:fresh",
    count: 1,
    window_start: "fresh",
    updated_at: new Date().toISOString()
  });
  await cleanupExpiredRows({ WAITLIST_DB: db });
  assert.deepEqual(
    db.rows("SELECT id FROM audit_reports").map((row) => row.id),
    [liveReport],
    "expired reports are cleaned"
  );
  assert.ok(!db.rows("SELECT id FROM audit_reports").some((row) => row.id === expiredReport));
  assert.deepEqual(
    db.rows("SELECT token_hash FROM beta_sessions"),
    [{ token_hash: "live" }],
    "expired sessions are cleaned"
  );
  assert.deepEqual(
    db.rows("SELECT bucket FROM audit_usage"),
    [{ bucket: "audit:ip:fresh" }],
    "quota buckets are cleaned"
  );
  assert.ok(wranglerConfig.triggers.crons.length > 0, "a scheduled trigger runs the cleanup");
});

// Lane-1 promise audit, current pass (2026-08-10). A fresh audit of every
// "What is live in this repo" bullet against the code, plus a live spot-check
// of /demo, /methodology, and /packages on https://seofixkit.com (all 15
// spot-check surfaces passed), confirmed the sub-claims below are backed by
// code today, but the sub-claims had no regression pin of their own. Each pin
// ties the README wording to the behaviour that must keep backing it.

test("README AI readiness claim keeps the proof-derived signal list", async () => {
  assert.match(
    liveSection,
    /derived from rendered content depth, helpful schema, canonical\/internal-link clarity, question-led structure, sitemap context/i
  );
  const report = await fixtureAudit();
  const { checks } = report.aiAnswerReadiness;
  assert.equal(checks.contentDepth.lowContentPages.length, 2, "rendered content depth is checked");
  assert.ok(findingTitled(report, /helpful structured data was not proven/), "helpful schema types are checked");
  assert.ok(checks.sourceClarity, "canonical and internal-link clarity are checked");
  assert.ok(findingTitled(report, /question-led sections are missing/), "question-led structure is checked");
  assert.equal(checks.discoveryFiles.sitemapReady, true, "sitemap context is checked");
  assert.equal(checks.discoveryFiles.sitemapUrlsDiscovered, 3);
});

test("README growth-opportunity claim keeps the verified-gap sources", async () => {
  assert.match(
    liveSection,
    /Draft-only growth opportunities from verified keyword, competitor, AI-readiness, and crawl gaps/i
  );
  const report = await fixtureAudit();
  const growth = buildGrowthOpportunities({
    ...report,
    keywordRankAudit: {
      status: "ready",
      checks: {
        lowCtrRows: [
          {
            query: "shop example widgets",
            pageUrl: `${SHOP}/`,
            pageLabel: "home",
            impressions: 1200,
            ctr: 0.01,
            position: 4.8
          }
        ],
        pageTwoRows: [],
        zeroClickRows: []
      }
    }
  });
  for (const sourceKind of ["keyword", "competitor", "ai_answer_readiness", "crawl"]) {
    assert.ok(
      growth.opportunities.some((item) => item.sourceKind === sourceKind),
      `growth briefs come from ${sourceKind} gaps`
    );
  }
  assert.match(
    growthOpportunitiesSummaryCopy(growth),
    /created from verified keyword, competitor, AI-readiness, or crawl gaps/,
    "the brief summary names the verified gap sources"
  );
});

test("README anonymous one-page check claim keeps browser proof, guards, rate windows, nothing stored, and handoff", async () => {
  assert.match(liveSection, /real browser rendering of one public page/i);
  assert.match(liveSection, /per-network and per-site rate limits/i);
  assert.match(liveSection, /no stored report/i);
  assert.match(liveSection, /handoff into private beta access/i);
  // Browser proof, static/rendered word counts, and guarded false positives
  // come from a real engine run in worker/routes/public-check.test.mjs ("public
  // check output is verbatim engine output for the public test page").
  const db = createTestD1();
  const browser = recordingBrowserBinding();
  const response = await withStubbedFetch(
    async () => new Response("", { status: 404 }),
    () =>
      workerApp.fetch(
        new Request(`${ORIGIN}/api/public-check`, {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.4" },
          body: JSON.stringify({ url: "https://93.184.216.34/" })
        }),
        { WAITLIST_DB: db, BROWSER: browser },
        testCtx()
      )
  );
  assert.equal(response.status, 503);
  assert.ok(browser.calls.length > 0, "the check renders the page in a real browser");
  const buckets = db.rows("SELECT bucket FROM audit_usage").map((row) => row.bucket.split(":").slice(0, 2).join(":"));
  assert.deepEqual(
    buckets.sort(),
    ["check:ip-day", "check:ip-hour", "check:target-day", "check:target-hour"],
    "per-network and per-site hourly and daily rate windows exist"
  );
  const tablesWithRows = db
    .rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .map((row) => row.name)
    .filter((table) => db.rows(`SELECT COUNT(*) AS count FROM ${table}`)[0].count > 0);
  assert.deepEqual(tablesWithRows, ["audit_usage"], "the check stores nothing beyond rate-limit counters");
  const page = visibleText(await publicPage("/check"));
  assert.match(page, /No report or URL from your check is stored/, "the page states nothing is stored");
  assert.match(page, /Actionable findings|guarded false positive/i, "findings and guards render when present");
  assert.match(
    page,
    /run in the private beta after secure email access/,
    "the page hands off into private beta access"
  );
  assert.match(
    buildPublicCheckResponse(await fixtureAudit()).nextStep,
    /The full repair workflow runs in the private beta/,
    "the check hands off into private beta access"
  );
});

test("README developer API claim keeps project-style verified sites", async () => {
  assert.match(liveSection, /project-style verified sites/i);
  const beta = await privateBeta();
  const now = new Date().toISOString();
  beta.db.insert("site_claims", {
    id: randomUUID(),
    owner_email: OWNER,
    host: "example.com",
    verification_token: "sfk-token",
    status: "verified",
    verification_method: "dns-txt",
    created_at: now,
    updated_at: now,
    verified_at: now
  });
  const created = await (await beta.call("/api/developer/tokens", { method: "POST", body: { label: "CI" } })).json();
  assert.ok(created.token.scopes.includes("projects:read"), "API keys carry a projects scope");
  const projects = await beta.call("/v1/projects", {
    headers: { authorization: `Bearer ${created.tokenSecret}`, "x-beta-session": "" }
  });
  assert.equal(projects.status, 200);
  const body = await projects.json();
  assert.deepEqual(
    body.projects.map((project) => project.host),
    ["example.com"],
    "verified sites serialize as projects"
  );
});

test("README repair-proof-receipt claim keeps original-issue, approved/applied-change, and same-host rerun links", () => {
  assert.match(
    liveSection,
    /connecting the original issue, approved\/applied change, and same-host rerun report/i
  );
  const receipt = buildRepairProofReceipt(proofReceiptInput());
  assert.equal(receipt.metadata.issueId, "issue-1", "receipts link the original issue");
  assert.match(receipt.markdown, /Add title copy to the home page/, "receipts carry the approved change");
  assert.match(
    buildRepairProofReceipt(proofReceiptInput({ action: { approval_state: "drafted" } })).error,
    /Approve/,
    "receipts require owner approval"
  );
  assert.match(
    buildRepairProofReceipt(proofReceiptInput({ action: { execution_state: "not_started" } })).error,
    /applied/,
    "receipts require the applied change"
  );
  assert.match(
    buildRepairProofReceipt(proofReceiptInput({ rerunReport: { url: "https://other.example/" } })).error,
    /Rerun proof report must cover the same host\./,
    "receipts require the same-host rerun report"
  );
});

test("README offer-catalog claim keeps scaffolding for every listed offer", () => {
  assert.match(
    liveSection,
    /Server-owned offer catalog and entitlement scaffolding for Proof Monitoring, Repair Sprint, SEO\/GEO Repair Agent, and Agency Workspace/i
  );
  const offers = offerCatalog({
    entitlements: [{ offer_key: "agency_workspace", status: "active", source: "admin" }]
  });
  for (const name of ["Proof Monitoring", "Repair Sprint", "SEO/GEO Repair Agent", "Agency Workspace"]) {
    const offer = offers.find((item) => item.name === name);
    assert.ok(offer, `offer catalog lists ${name}`);
    assert.ok(offer.entitlementStatus, `${name} carries entitlement state`);
  }
  assert.equal(
    offers.find((item) => item.name === "Agency Workspace").entitlementStatus,
    "active",
    "entitlements map onto catalog offers"
  );
});

test("README admin ops dashboard claim keeps waitlist, invites, audits, and admin-created invite codes", async () => {
  assert.match(
    liveSection,
    /`\/beta\/admin` ops dashboard for waitlist, invites, audits, repeated issue patterns, and fix requests/i
  );
  const db = createTestD1();
  const env = { WAITLIST_DB: db, ADMIN_EXPORT_TOKEN: "admin-token-123" };
  const admin = (path, init = {}) =>
    workerApp.fetch(
      new Request(`${ORIGIN}${path}`, {
        ...init,
        headers: { authorization: "Bearer admin-token-123", "content-type": "application/json" }
      }),
      env,
      testCtx()
    );
  const invite = await admin("/admin/invites", {
    method: "POST",
    body: JSON.stringify({ email: "invitee@example.com" })
  });
  assert.equal(invite.status, 200);
  assert.deepEqual(
    db.rows("SELECT owner_email FROM beta_invites"),
    [{ owner_email: "invitee@example.com" }],
    "invite codes are admin-created in D1"
  );
  const now = new Date().toISOString();
  db.insert("waitlist_leads", { email: "lead@example.com", source: "test", created_at: now, updated_at: now });
  insertSavedReport(db, savedReportFixture());
  db.insert("audit_jobs", {
    id: randomUUID(),
    owner_email: OWNER,
    access_mode: "invite",
    target_url: "https://example.com/",
    target_host: "example.com",
    max_pages: 1,
    status: "running",
    created_at: now,
    updated_at: now
  });
  const summary = await (await admin("/admin/summary")).json();
  assert.equal(summary.metrics.waitlist, 1, "dashboard surfaces waitlist counts");
  assert.equal(summary.metrics.invites, 1, "dashboard surfaces invite counts");
  assert.equal(summary.metrics.audits, 1, "dashboard surfaces audit counts");
  assert.match(JSON.stringify(summary.opsHealth), /"runningJobs":1/, "dashboard surfaces running audit jobs");
  assert.deepEqual(
    summary.invites.map((item) => item.ownerEmail),
    ["invitee@example.com"],
    "dashboard lists recent invites"
  );
});
// Lane-1 2026-08-15 promise-audit pass. The offline lock above and the live
// spot-check in scripts/live-promise-spot-check.mjs were both green on this
// date; these pins lock the remaining sub-claims that had no regression pin of
// their own, so the README cannot silently drift into overclaiming them.

test("README deep-health claim stays runtime/config/schema scoped and public-safe", async () => {
  assert.match(readme, /\/api\/deep-health/);
  assert.match(readme, /public-safe readiness check/);
  const db = createTestD1();
  const now = new Date().toISOString();
  db.insert("waitlist_leads", { email: "secret-lead@example.com", source: "test", created_at: now, updated_at: now });
  const response = await workerApp.fetch(new Request(`${ORIGIN}/api/deep-health`), { WAITLIST_DB: db }, testCtx());
  const body = await response.json();
  assert.equal(body.scope, "runtime_config_and_schema_readiness", "deep-health reports the documented scope");
  assert.doesNotMatch(JSON.stringify(body), /secret-lead@example\.com/, "deep-health must not expose table contents");
});

test("README packages page claim keeps the config-gated Proof Monitoring price and boundary", async () => {
  assert.match(liveSection, /Public `\/demo`, `\/methodology`, `\/packages`, and `\/proof` pages showing the proof loop, limits, package ladder, and a real before\/after repair receipt/i);
  const packages = visibleText(await publicPage("/packages"));
  assert.match(packages, /\$49-\$99\/mo target/, "Proof Monitoring shows a target price, not a live price");
  assert.match(packages, /Config-gated subscription/, "Proof Monitoring is labeled config-gated");
  assert.match(packages, /No ranking or traffic guarantee/, "packages keeps the no-ranking promise");
  // 2026-08-15 audit: the monitoring offer stays visible in private billing as
  // a config-gated card (shared/offers.js catalog + src/ offer panel);
  // only its checkout is gated. The public page must keep saying checkout is
  // gated, never that the offer "only appears" when configured.
  assert.match(
    packages,
    /Checkout only opens when the Dodo subscription product and webhook entitlement sync are configured; until then it stays a config-gated offer in private billing/,
    "packages must keep the config-gated checkout boundary"
  );
  assert.doesNotMatch(
    packages,
    /Only appears in private billing when the Dodo subscription product and webhook entitlement sync are configured/,
    "packages must not claim Proof Monitoring only appears in billing when configured"
  );
});

test("README anonymous-check claim keeps the deployed copy locked to the live spot-check", () => {
  const spotCheck = readFileSync(new URL("../scripts/live-promise-spot-check.mjs", import.meta.url), "utf8");
  for (const surface of [
    { path: "/check", copy: "Check One Page for SEO Proof" },
    { path: "/check", copy: "No account, no email, no stored report" },
    { path: "/demo", copy: "Do not fix what is not broken." },
    { path: "/demo", copy: "an exact snippet when the engine can generate one" },
    { path: "/methodology", copy: "Limits we state up front" },
    { path: "/packages", copy: "Package ladder" },
    { path: "/packages", copy: "$99.00 one-time" },
    { path: "/packages", copy: "Checkout only opens when the Dodo subscription product and webhook entitlement sync are configured" }
  ]) {
    assert.match(spotCheck, new RegExp(`path: "${surface.path}"`), `spot-check must still cover ${surface.path}`);
    assert.match(spotCheck, new RegExp(surface.copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `spot-check must still assert the ${surface.path} copy "${surface.copy}"`);
  }
});
