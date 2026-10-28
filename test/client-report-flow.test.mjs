import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { buildWhiteLabelReportHtml, defaultBranding } from "../shared/white-label-report.js";
import { app } from "../worker/index.js";
import { whiteLabelPdfCacheVersion } from "../worker/routes/shares.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "nish@gmail.com";
const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const ctx = { waitUntil() {}, passThroughOnException() {} };

function signIn(db) {
  const token = randomBytes(32).toString("hex");
  db.insert("beta_sessions", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    owner_email: OWNER,
    created_at: iso(0),
    expires_at: iso(-1),
    last_seen_at: iso(0),
    access_mode: "self-serve"
  });
  return token;
}

function seed(db) {
  const report = {
    url: "https://example.com/",
    score: 72,
    summary: { pagesScanned: 2, critical: 1, warnings: 1, notices: 0, totalFindings: 2 },
    findings: [
      { severity: "critical", title: "Missing H1 on /pricing", evidence: "No rendered H1 found.", fix: "Add one H1." }
    ],
    pageSummaries: [
      { url: "https://example.com/", score: 88, critical: 0, warnings: 1, notices: 0, title: "Example", h1: "Hi" },
      {
        url: "https://example.com/pricing",
        status: 200,
        score: 61,
        critical: 1,
        warnings: 0,
        notices: 0,
        title: "Pricing"
      }
    ]
  };
  db.insert("audit_reports", {
    id: "example-com-0123456789ab",
    url: report.url,
    origin: "https://example.com",
    score: report.score,
    summary_json: JSON.stringify(report.summary),
    report_json: JSON.stringify(report),
    created_at: iso(0),
    updated_at: iso(0),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: "example.com",
    expires_at: iso(-29)
  });
}

const call = (db, path, { method = "GET", session, body } = {}) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(session ? { cookie: `sfk_beta_session=${session}` } : {}),
        ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" })
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    }),
    { WAITLIST_DB: db },
    ctx
  );

test("an unbranded client link carries SEO Fix Kit branding and every checked page", async () => {
  const db = createTestD1();
  seed(db);
  const session = signIn(db);

  const created = await call(db, "/api/reports/example-com-0123456789ab/share", { method: "POST", session });
  assert.equal(created.status, 200, await created.clone().text());
  const { share } = await created.json();

  const page = await call(db, share.sharePath);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /SEO Fix Kit/);
  assert.match(
    html,
    /src="https:\/\/seofixkit\.com\/brand\/mark\.svg"/,
    "the default logo is the SEO Fix Kit mark, absolute so PDFs load it"
  );
  assert.doesNotMatch(html, /Gmail SEO/, "the agency name is never guessed from a webmail address");
  assert.doesNotMatch(html, /no per-page results/);
  assert.match(html, /https:\/\/example\.com\/pricing<\/td>\s*<td>200<\/td>\s*<td>61<\/td>\s*<td>1<\/td>/);
});

test("custom branding is a Fix Pack feature: free owners stay on SEO Fix Kit branding", async () => {
  const db = createTestD1();
  seed(db);
  const session = signIn(db);
  const brand = { agencyName: "Bright Agency", brandColor: "#7c3aed", accentColor: "#0f9f6e" };

  const locked = await (await call(db, "/api/branding", { session })).json();
  assert.equal(locked.unlocked, false);
  const blocked = await call(db, "/api/branding", { method: "POST", session, body: brand });
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).code, "PAID_FEATURE_LOCKED");

  db.insert("fix_requests", {
    id: "fr-paid",
    report_id: "example-com-0123456789ab",
    owner_email: OWNER,
    target_url: "https://example.com/",
    target_host: "example.com",
    status: "paid",
    created_at: iso(0),
    updated_at: iso(0)
  });
  const saved = await call(db, "/api/branding", { method: "POST", session, body: brand });
  assert.equal(saved.status, 200, await saved.clone().text());
  const { share } = await (
    await call(db, "/api/reports/example-com-0123456789ab/share", { method: "POST", session })
  ).json();
  assert.match(await (await call(db, share.sharePath)).text(), /Bright Agency/);

  await db.prepare("UPDATE fix_requests SET status = 'refunded'").run();
  const after = await (await call(db, share.sharePath)).text();
  assert.doesNotMatch(after, /Bright Agency/, "a refunded Fix Pack drops the custom branding");
  assert.match(after, /SEO Fix Kit/);
});

test("the pages table lists every summary and keeps the HTTP status of older reports", () => {
  const pageSummaries = Array.from({ length: 35 }, (_, i) => ({ url: `https://example.com/p${i}`, score: 90 }));
  const many = buildWhiteLabelReportHtml({ report: { url: "https://example.com/", pageSummaries } });
  assert.match(many, /https:\/\/example\.com\/p34<\/td>/);

  const legacy = buildWhiteLabelReportHtml({
    report: { url: "https://example.com/", pages: [{ url: "https://example.com/gone", status: 404 }] }
  });
  assert.match(legacy, /https:\/\/example\.com\/gone<\/td>\s*<td>404<\/td>/);
});

test("an older saved report recomputes its projected score from distinct top fixes", async () => {
  const db = createTestD1();
  const session = signIn(db);
  const findings = [
    { title: "Missing meta description on home", severity: "warning" },
    { title: "Missing meta description on /about", severity: "warning" },
    { title: "Noindex found on /pricing", severity: "critical" },
    { title: "Missing H1 on /blog", severity: "critical" }
  ];
  const report = {
    url: "https://example.com/",
    score: 70,
    findings,
    repairPlan: findings.map((finding) => ({ title: finding.title })),
    projectedScore: { fixes: 3, from: 70, to: 88 }
  };
  db.insert("audit_reports", {
    id: "example-com-legacyproj01",
    url: report.url,
    origin: "https://example.com",
    score: 70,
    summary_json: "{}",
    report_json: JSON.stringify(report),
    created_at: iso(0),
    updated_at: iso(0),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: "example.com",
    expires_at: iso(-29)
  });
  const response = await call(db, "/api/reports/example-com-legacyproj01", { session });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual((body.report || body).projectedScore, { fixes: 3, from: 70, to: 100 });
});

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      const object = objects.get(key);
      return object ? { body: object.body, customMetadata: object.customMetadata } : null;
    },
    async put(key, body, options = {}) {
      objects.set(key, { body, customMetadata: options.customMetadata || {} });
    }
  };
}

function pdfRequest(env, path, { ip = "203.0.113.7", session } = {}) {
  return app.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: { "cf-connecting-ip": ip, ...(session ? { cookie: `sfk_beta_session=${session}` } : {}) }
    }),
    env,
    ctx
  );
}

async function sharedReport(db) {
  seed(db);
  const session = signIn(db);
  const created = await call(db, "/api/reports/example-com-0123456789ab/share", { method: "POST", session });
  const { share } = await created.json();
  const row = db.rows("SELECT * FROM report_share_links WHERE id = ?", share.id)[0];
  const report = JSON.parse(db.rows("SELECT report_json FROM audit_reports")[0].report_json);
  const pdfArgs = {
    report,
    branding: defaultBranding(),
    share: {
      id: row.id,
      reportId: row.report_id,
      ownerEmail: row.owner_email,
      clientName: row.client_name || "",
      status: row.status,
      passwordHint: row.password_hint || "",
      expiresAt: row.expires_at || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastViewedAt: row.last_viewed_at || ""
    },
    origin: ORIGIN
  };
  return { session, share, report, pdfArgs };
}

test("the public share PDF is served from the R2 cache without launching a browser", async () => {
  const db = createTestD1();
  const { share, pdfArgs } = await sharedReport(db);
  const REPORTS = fakeR2();
  const cachedPdf = new TextEncoder().encode("%PDF-1.7 cached");
  REPORTS.objects.set(`report-pdfs/shares/${share.id}.pdf`, {
    body: cachedPdf,
    customMetadata: { version: await whiteLabelPdfCacheVersion(pdfArgs) }
  });
  const env = { WAITLIST_DB: db, REPORTS };

  for (let i = 0; i < 15; i += 1) {
    const response = await pdfRequest(env, `/r/${share.id}.pdf`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(await response.text(), "%PDF-1.7 cached");
  }
  assert.equal(db.rows("SELECT * FROM audit_usage WHERE bucket LIKE 'report-pdf:%'").length, 0, "hits are free");
});

test("public share PDF cache misses are rate limited per IP, and a changed report misses the cache", async () => {
  const db = createTestD1();
  const { share, pdfArgs } = await sharedReport(db);
  const REPORTS = fakeR2();
  REPORTS.objects.set(`report-pdfs/shares/${share.id}.pdf`, {
    body: new TextEncoder().encode("%PDF stale"),
    customMetadata: {
      version: await whiteLabelPdfCacheVersion({ ...pdfArgs, report: { ...pdfArgs.report, score: 1 } })
    }
  });
  const env = { WAITLIST_DB: db, REPORTS };
  const statuses = [];
  for (let i = 0; i < 11; i += 1) statuses.push((await pdfRequest(env, `/r/${share.id}.pdf`)).status);
  assert.deepEqual(statuses, [...Array(10).fill(503), 429], "stale cache is a miss; the 11th miss is refused");
  assert.equal((await pdfRequest(env, `/r/${share.id}.pdf`, { ip: "198.51.100.9" })).status, 503, "per IP");
});

test("the owner PDF export is cached in R2 too", async () => {
  const db = createTestD1();
  const { session, report } = await sharedReport(db);
  const REPORTS = fakeR2();
  REPORTS.objects.set("report-pdfs/owner/example-com-0123456789ab.pdf", {
    body: new TextEncoder().encode("%PDF owner"),
    customMetadata: {
      version: await whiteLabelPdfCacheVersion({
        report,
        branding: defaultBranding(),
        share: { id: "", clientName: "example.com" },
        origin: ORIGIN,
        includeDraftBriefs: true
      })
    }
  });
  const env = { WAITLIST_DB: db, REPORTS };
  const hit = await pdfRequest(env, "/api/reports/example-com-0123456789ab/client.pdf", { session });
  assert.equal(hit.status, 200, await hit.clone().text());
  assert.equal(await hit.text(), "%PDF owner");

  const miss = await pdfRequest(env, "/api/reports/example-com-0123456789ab/client.pdf?clientName=Acme", { session });
  assert.equal(miss.status, 503, "a different client name is a different PDF");
});
