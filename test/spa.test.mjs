import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";
import { buildRemediationBrief } from "../shared/remediation-brief.js";
import { deriveRepairQueueItems } from "../shared/repair-queue.js";
import { auditJobResponse, auditScheduleResponse, siteClaimResponse } from "../worker/lib/serializers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const LIVE_SECTION = README.split("## What is live in this repo")[1]?.split("## Run locally")[0] || "";
const OWNER = "owner@example.com";
const TIMEOUT = 10_000;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

let outDir;
let server;
let baseUrl;
let browser;

before(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "seofixkit-spa-"));
  await build({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.js"),
    logLevel: "silent",
    build: { outDir, emptyOutDir: true }
  });
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.join(outDir, path.normalize(pathname));
    const servable = file.startsWith(outDir) && fs.existsSync(file) && fs.statSync(file).isFile();
    const target = servable ? file : path.join(outDir, "index.html");
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(target)] || "application/octet-stream"
    });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

async function openApp(t, handlers = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(TIMEOUT);
  const requests = [];
  const routes = Object.entries(handlers).map(([key, handler]) => {
    const [method, pattern] = key.split(" ");
    const regex = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`);
    return { method, regex, handler };
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    const entry = { method: request.method(), path: url.pathname, body };
    requests.push(entry);
    for (const { method, regex, handler } of routes) {
      const match = method === entry.method && url.pathname.match(regex);
      if (!match) continue;
      const result = await handler({ ...entry, params: match.slice(1).map(decodeURIComponent) });
      const isWrapped = result && typeof result === "object" && "status" in result && "body" in result;
      return route.fulfill({
        status: isWrapped ? result.status : 200,
        contentType: "application/json",
        body: JSON.stringify(isWrapped ? result.body : result)
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found." })
    });
  });
  return { page, requests, pageErrors };
}

async function visible(locator) {
  await locator.waitFor({ state: "visible" });
  return locator;
}

async function until(check, message) {
  const deadline = Date.now() + TIMEOUT;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function isoFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function reportFixture(id = randomUUID()) {
  const url = "https://example.com/";
  const finding = (findingId, severity, title, fix) => ({
    id: findingId,
    type: "issue",
    severity,
    title,
    pageUrl: url,
    pageLabel: "home",
    evidence: `${title} proven in the rendered DOM.`,
    fix,
    source: "rendered"
  });
  const report = {
    id,
    url,
    score: 71,
    scannedAt: isoFromNow(-60_000),
    reportPath: `/beta/reports/${id}`,
    reportUrl: `https://seofixkit.com/beta/reports/${id}`,
    owner: { email: OWNER },
    retention: { expiresAt: isoFromNow(30 * 24 * 3600_000) },
    summary: { pagesScanned: 4, maxPages: 10, critical: 1, warnings: 2, notices: 1, guardedFalsePositives: 0 },
    findings: [
      finding("missing-title", "critical", "Missing title on home", "Add a unique, descriptive title."),
      finding("missing-meta", "warning", "Missing meta description", "Write a meta description."),
      finding("thin-content", "warning", "Thin content on home", "Expand the intro copy."),
      finding("missing-alt", "notice", "Images missing alt text", "Describe each image.")
    ],
    repairPlan: [],
    pages: []
  };
  report.remediationBrief = buildRemediationBrief(report);
  return report;
}

function repairQueueFixture(report) {
  const now = new Date().toISOString();
  const items = deriveRepairQueueItems(
    report,
    [
      { id: "q-meta", issue_id: "missing-meta", status: "fixed", updated_at: now },
      { id: "q-thin", issue_id: "thin-content", status: "ignored", updated_at: now },
      { id: "q-alt", issue_id: "missing-alt", status: "drafted", updated_at: now }
    ],
    [
      {
        id: "act-alt",
        issue_id: "missing-alt",
        approval_state: "drafted",
        execution_state: "not_started",
        action_mode: "cms_draft",
        proposed_change: "Add alt text to the hero image.",
        updated_at: now
      }
    ]
  );
  return { ok: true, reportId: report.id, items, unavailable: false, updatedAt: now };
}

function reportHandlers(report) {
  return {
    "GET /api/beta/session": () => ({ ok: true, status: "active", ownerEmail: OWNER, accessMode: "invite" }),
    "GET /api/reports/:id": ({ params }) =>
      params[0] === report.id ? report : { status: 404, body: { error: "Report not found." } },
    "GET /api/reports/:id/repair-queue": () => repairQueueFixture(report),
    "GET /api/reports/:id/collaboration": () => ({ ok: true, members: [], issues: [] }),
    "GET /api/branding": () => ({ ok: true, branding: {} }),
    "GET /api/reports/:id/shares": () => ({ ok: true, shares: [] }),
    "GET /api/report-domains": () => ({ ok: true, domains: [] })
  };
}

function accountSummary({ sites = [], schedules = [], jobs = [], reports = [] } = {}) {
  return {
    ok: true,
    owner: { email: OWNER, accessMode: "invite" },
    metrics: {
      reports: reports.length,
      fixRequests: 0,
      runningAudits: jobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      verifiedSites: sites.filter((site) => site.status === "verified").length,
      monitors: schedules.length,
      monitorLimit: 5
    },
    recentReports: reports,
    recentAuditJobs: jobs,
    sites,
    schedules,
    fixRequests: [],
    repairAgent: { counts: {}, nextItems: [] },
    monitoring: { limit: 5, status: "beta" },
    nextActions: []
  };
}

function dashboardHandlers() {
  let signedIn = false;
  return {
    "POST /api/beta/login": ({ body }) => {
      signedIn = true;
      return { ok: true, status: "unlocked", ownerEmail: body.email, accessMode: "invite" };
    },
    "GET /api/beta/session": () =>
      signedIn
        ? { ok: true, status: "active", ownerEmail: OWNER, accessMode: "invite" }
        : { status: 401, body: { error: "Sign in to continue." } },
    "GET /api/developer": () => ({ ok: true, tokens: [], webhooks: [] })
  };
}

function repairBoard(page) {
  return page.getByRole("heading", { name: /Assign, draft and track each fix/i }).locator("xpath=ancestor::section[1]");
}

async function signIn(page) {
  await page.goto(`${baseUrl}/beta`);
  await page.getByRole("button", { name: "Use an invite code" }).click();
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Invite code").fill("beta-invite");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await visible(page.getByLabel("Page or site URL"));
}

test("homepage leads with a URL check form and keeps the email access form", async (t) => {
  assert.match(
    README,
    /request a secure one-use email link or check one public page anonymously/i,
    "README promises both homepage entry paths"
  );
  const { page, requests } = await openApp(t, {
    "POST /api/access/request": () => ({
      ok: true,
      status: "sent",
      message: "Check your email for a secure access link."
    })
  });
  await page.goto(baseUrl);

  await visible(page.getByRole("heading", { level: 1, name: "An SEO audit that checks its own work." }));
  assert.ok(await page.locator("#root").getByRole("heading", { level: 1 }).count(), "app renders into #root");

  const emailInput = await visible(page.getByLabel("Email"));
  const cta = await visible(page.getByRole("banner").getByRole("link", { name: "Check a page" }));
  assert.equal(await cta.getAttribute("href"), "/check", "primary header CTA goes to the anonymous check");

  const heroForm = page.getByRole("search", { name: "Check a page" });
  assert.equal(await heroForm.getAttribute("action"), "/check");
  assert.equal(await heroForm.getAttribute("method"), "get");
  assert.equal(await heroForm.getByLabel("Page to check").getAttribute("name"), "url");
  const accountLink = heroForm.getByRole("link", { name: /create a free account/ });
  assert.equal(await accountLink.getAttribute("href"), "#get-started", "the hero points at the email form");

  await emailInput.fill("founder@example.com");
  await page.getByRole("button", { name: "Start free" }).click();
  await visible(page.getByText("Check your email for a secure access link."));
  const sent = requests.find((request) => request.path === "/api/access/request");
  assert.equal(sent.method, "POST");
  assert.equal(sent.body.email, "founder@example.com", "the form sends the typed email");
});

test("homepage FAQ shows the buyer questions, the anonymous /check path, and no-overclaim answers", async (t) => {
  const { page } = await openApp(t);
  await page.goto(baseUrl);

  const faq = page.locator("details").filter({ has: page.locator("summary") });
  for (const question of [
    "Do I need an account?",
    "What does the Fix Pack include?",
    "Do you check AI search?",
    "What doesn’t SEO Fix Kit do?"
  ]) {
    const summary = await visible(page.locator("summary", { hasText: question }));
    await summary.click();
  }
  assert.equal(await faq.count(), 4, "the FAQ lists the four buyer questions");

  await visible(page.locator("details p").filter({ hasText: "Not to check one page." }));

  const limits = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "What doesn’t SEO Fix Kit do?" }) });
  const answer = (await limits.innerText()).replace(/\s+/g, " ");
  assert.match(answer, /never changes your site or publishes content/);
  assert.match(answer, /guarantee rankings, traffic, indexing, AI citations or revenue/);
});

test("a valid session opens the workspace even when the browser lost its stored sign-in hint", async (t) => {
  const { page } = await openApp(t, {
    "GET /api/beta/session": () => ({ ok: true, status: "active", ownerEmail: OWNER, accessMode: "invite" }),
    "GET /api/account/summary": () => accountSummary(),
    "GET /api/developer": () => ({ ok: true, tokens: [], webhooks: [] })
  });
  await page.goto(`${baseUrl}/beta`);
  await visible(page.getByRole("heading", { name: "Overview" }));
  assert.equal(await page.getByRole("button", { name: "Email me a sign-in link" }).count(), 0);
});

test("the Reports page lists every saved report, older ones on request", async (t) => {
  const report = (index) => ({
    id: `report-${index}`,
    url: `https://example.com/page-${index}`,
    targetHost: "example.com",
    score: 80,
    pagesScanned: 1,
    totalFindings: 0,
    reportPath: `/beta/reports/report-${index}`,
    createdAt: isoFromNow(-index * 60_000),
    expiresAt: isoFromNow(29 * 24 * 3600_000)
  });
  const { page, requests } = await openApp(t, {
    "GET /api/beta/session": () => ({ ok: true, status: "active", ownerEmail: OWNER, accessMode: "invite" }),
    "GET /api/account/summary": () => accountSummary(),
    "GET /api/reports": ({ path }) => ({ ok: true, reports: [report(1), report(2)], nextCursor: "c1", path }),
    "GET /api/developer": () => ({ ok: true, tokens: [], webhooks: [] })
  });
  await page.route("**/api/reports?cursor=*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reports: [report(3)], nextCursor: "" })
    })
  );
  await page.goto(`${baseUrl}/beta/reports`);
  await visible(page.locator('a[href="/beta/reports/report-2"]').first());
  await page.getByRole("button", { name: "Show older reports" }).click();
  await visible(page.locator('a[href="/beta/reports/report-3"]').first());
  assert.equal(await page.getByRole("button", { name: "Show older reports" }).count(), 0);
  assert.ok(requests.some((request) => request.path === "/api/reports"));
});

test("a one-use sign-in link signs in once, cleans the address bar, and opens the dashboard", async (t) => {
  const { page, requests } = await openApp(t, {
    "POST /api/access/verify": () => ({ ok: true, status: "unlocked", ownerEmail: OWNER }),
    "GET /api/beta/session": () => ({ ok: true, status: "active", ownerEmail: OWNER, accessMode: "invite" }),
    "GET /api/account/summary": () => accountSummary(),
    "GET /api/developer": () => ({ ok: true, tokens: [], webhooks: [] })
  });
  await page.goto(`${baseUrl}/beta?access=one-use-token&email=${encodeURIComponent(OWNER)}`);
  await visible(page.getByRole("heading", { name: "Overview" }));
  const url = new URL(page.url());
  assert.equal(url.pathname, "/beta");
  assert.equal(url.search, "", "the token and email are removed from the address bar");
  const verifies = requests.filter((request) => request.path === "/api/access/verify");
  assert.equal(verifies.length, 1, "the one-use token is spent exactly once");
  assert.equal(verifies[0].body.token, "one-use-token");
});

test("an expired sign-in link shows the reason on the sign-in screen", async (t) => {
  const { page } = await openApp(t, {
    "POST /api/access/verify": () => ({ status: 401, body: { error: "This sign-in link has expired." } })
  });
  await page.goto(`${baseUrl}/beta?access=old-token`);
  await visible(page.getByText("This sign-in link has expired."));
  await visible(page.getByRole("button", { name: "Email me a sign-in link" }));
});

test("a queued audit polls /api/audit/jobs/:id until completed before the private report loads", async (t) => {
  assert.match(
    LIVE_SECTION,
    /Queued audit jobs backed by D1 `audit_jobs`, with status polling before the private report loads/i
  );
  const report = reportFixture();
  const jobId = randomUUID();
  const jobRow = {
    id: jobId,
    status: "queued",
    target_url: report.url,
    target_host: "example.com",
    max_pages: 10,
    created_at: new Date().toISOString()
  };
  const jobStatuses = ["queued", "completed"];
  const { page, requests } = await openApp(t, {
    ...reportHandlers(report),
    ...dashboardHandlers(),
    "GET /api/account/summary": () => accountSummary(),
    "POST /api/audit": () => ({
      status: 202,
      body: {
        ok: true,
        mode: "queued",
        job: auditJobResponse(jobRow),
        jobId,
        statusUrl: `/api/audit/jobs/${jobId}`
      }
    }),
    "GET /api/audit/jobs/:id": () => {
      const status = jobStatuses.shift() || "completed";
      const row = status === "completed" ? { ...jobRow, status, report_id: report.id } : jobRow;
      return { ok: true, job: auditJobResponse(row) };
    }
  });
  await signIn(page);

  await page.getByLabel("Page or site URL").fill(report.url);
  await page.getByRole("button", { name: "Run audit" }).click();
  await visible(page.getByText("Audit queued. Waiting to start…"));
  await visible(page.getByRole("heading", { name: "example.com", level: 1 }));
  assert.equal(new URL(page.url()).pathname, `/beta/reports/${report.id}`, "address bar moves to the private report");

  const apiCalls = requests.map((request) => `${request.method} ${request.path}`);
  const polls = apiCalls.flatMap((call, index) => (call === `GET /api/audit/jobs/${jobId}` ? [index] : []));
  const reportLoad = apiCalls.indexOf(`GET /api/reports/${report.id}`);
  assert.ok(apiCalls.indexOf("POST /api/audit") < polls[0], "polling starts after the audit is queued");
  assert.equal(polls.length, 2, "the job is polled until it reports completed");
  assert.ok(reportLoad > polls.at(-1), "the private report loads only after the completed poll");
});

test("the dashboard adds a weekly monitor for a verified host and pauses it", async (t) => {
  assert.match(
    LIVE_SECTION,
    /Weekly self-serve audit monitors backed by D1 `audit_schedules`, with dashboard controls to add or pause monitors for verified hosts/i
  );
  const site = siteClaimResponse({
    id: randomUUID(),
    host: "example.com",
    status: "verified",
    verification_method: "dns",
    verification_token: "token-1"
  });
  let schedules = [];
  const { page, requests } = await openApp(t, {
    ...dashboardHandlers(),
    "GET /api/account/summary": () => accountSummary({ sites: [site], schedules }),
    "POST /api/audit/schedules": ({ body }) => {
      const schedule = auditScheduleResponse({
        id: randomUUID(),
        target_url: body.url,
        target_host: new URL(body.url).hostname,
        interval_days: body.intervalDays,
        max_pages: body.maxPages,
        next_run_at: isoFromNow(7 * 24 * 3600_000)
      });
      schedules = [schedule];
      return { ok: true, schedule };
    },
    "DELETE /api/audit/schedules/:id": ({ params }) => {
      schedules = schedules.filter((schedule) => schedule.id !== params[0]);
      return { ok: true, status: "paused", id: params[0] };
    }
  });
  await signIn(page);
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Sites", exact: true }).click();

  await (await visible(page.getByRole("button", { name: "Turn on weekly checks" }))).click();
  await visible(page.getByText("example.com will be checked weekly."));
  const add = requests.find((request) => request.method === "POST" && request.path === "/api/audit/schedules");
  assert.equal(add.body.url, "https://example.com/", "monitor targets the verified host");
  assert.equal(add.body.intervalDays, 7, "monitor is weekly");

  const [schedule] = schedules;
  await (await visible(page.getByRole("button", { name: "Pause weekly checks" }))).click();
  await visible(page.getByText("Weekly checks paused."));
  await until(
    () =>
      requests.some((request) => request.method === "DELETE" && request.path === `/api/audit/schedules/${schedule.id}`),
    "pausing sends DELETE for that monitor"
  );
  await visible(page.getByRole("button", { name: "Turn on weekly checks" }));
});

test("a loaded report shows the remediation brief panel with a JSON download", async (t) => {
  const report = reportFixture();
  const { page } = await openApp(t, reportHandlers(report));
  await page.goto(`${baseUrl}/beta/reports/${report.id}#repair`);

  const panel = await visible(page.getByRole("region", { name: "Repair brief" }));
  await visible(panel.getByRole("heading", { name: "Hand it off" }));
  const download = await visible(panel.getByRole("link", { name: "Download brief (JSON)" }));
  assert.equal(await download.getAttribute("href"), `/api/reports/${report.id}/remediation-brief.json`);
});

test("report tabs switch sections by click and arrow key and remember the tab in the address", async (t) => {
  const report = reportFixture();
  const { page } = await openApp(t, reportHandlers(report));
  await page.goto(`${baseUrl}/beta/reports/${report.id}`);

  const problems = page.getByRole("tab", { name: /Problems/ });
  assert.equal(await (await visible(problems)).getAttribute("aria-selected"), "true", "Problems opens first");
  await visible(page.getByRole("heading", { name: /All problems/ }));

  await page.getByRole("tab", { name: /Pages/ }).click();
  await visible(page.getByRole("heading", { name: "Every page we checked" }));
  assert.equal(await page.getByRole("heading", { name: /All problems/ }).isVisible(), false);
  assert.equal(new URL(page.url()).hash, "#pages");

  await page.keyboard.press("ArrowRight");
  const share = page.getByRole("tab", { name: "Share" });
  await visible(page.getByRole("tabpanel", { name: "Share" }));
  assert.equal(await share.getAttribute("aria-selected"), "true", "ArrowRight from Pages moves to Share");
  assert.equal(new URL(page.url()).hash, "#share");
});

test("the repair board status filter shows only items in the chosen status", async (t) => {
  assert.match(LIVE_SECTION, /Report-level repair agent board with status filters/i);
  const report = reportFixture();
  const { page } = await openApp(t, reportHandlers(report));
  await page.goto(`${baseUrl}/beta/reports/${report.id}#repair`);

  const board = repairBoard(page);
  const filter = await visible(board.getByLabel("View"));
  const shows = async (expected, message) => {
    let seen = [];
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
      seen = (await board.locator("details h3").allInnerTexts()).sort();
      if (JSON.stringify(seen) === JSON.stringify([...expected].sort())) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.deepEqual(seen, [...expected].sort(), message);
  };

  await shows(["Images missing alt text", "Missing title on home"], "Active hides fixed and ignored items");
  await filter.selectOption({ label: "Fixed" });
  await shows(["Missing meta description"], "Fixed shows only fixed items");
  await filter.selectOption({ label: "Ignored" });
  await shows(["Thin content on home"], "Ignored shows only ignored items");
  await filter.selectOption({ label: "Drafted" });
  await shows(["Images missing alt text"], "Drafted shows only drafted items");
  await filter.selectOption({ label: "Regressed" });
  await visible(board.getByText("No fixes with this status."));
  await filter.selectOption({ label: "All" });
  await shows(
    ["Images missing alt text", "Missing meta description", "Missing title on home", "Thin content on home"],
    "All shows every item"
  );
});

test("repair board drafts are saved for review and publish nothing", async (t) => {
  assert.match(LIVE_SECTION, /and no external publishing side effects/i);
  const report = reportFixture();
  const { page, requests } = await openApp(t, {
    ...reportHandlers(report),
    "POST /api/reports/:id/repair-actions": () => ({ ok: true, queue: repairQueueFixture(report) })
  });
  await page.goto(`${baseUrl}/beta/reports/${report.id}#repair`);

  const card = await visible(
    repairBoard(page)
      .locator("details")
      .filter({ has: page.getByRole("heading", { name: "Missing title on home" }) })
  );
  await card.getByRole("heading", { name: "Missing title on home" }).click();
  await visible(card.getByText("Drafts are saved for review. Nothing changes on your site."));

  const before = requests.length;
  await card.getByRole("button", { name: "Draft change" }).click();
  await visible(page.getByText("Draft saved for review."));
  const writes = requests.slice(before).filter((request) => request.method !== "GET");
  assert.deepEqual(
    writes.map((request) => `${request.method} ${request.path}`),
    [`POST /api/reports/${report.id}/repair-actions`],
    "drafting only stores a draft on this report"
  );
  assert.equal(writes[0].body.issueId, "missing-title");
});

test("a report whose repair queue has items with no agent action still renders", async (t) => {
  const report = reportFixture();
  const { page, pageErrors } = await openApp(t, reportHandlers(report));
  page.setDefaultTimeout(3_000);
  await page.goto(`${baseUrl}/beta/reports/${report.id}#repair`);
  await visible(repairBoard(page).getByText("Repair queue ready."));
  assert.deepEqual(pageErrors, []);
});
