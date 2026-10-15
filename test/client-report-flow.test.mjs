import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
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
      { url: "https://example.com/pricing", score: 61, critical: 1, warnings: 0, notices: 0, title: "Pricing" }
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
  assert.match(html, /src="\/brand\/mark\.svg"/, "the default logo is the SEO Fix Kit mark");
  assert.doesNotMatch(html, /Gmail SEO/, "the agency name is never guessed from a webmail address");
  assert.doesNotMatch(html, /no per-page results/);
  assert.match(html, /https:\/\/example\.com\/pricing<\/td>\s*<td>61<\/td>\s*<td>1<\/td>/);
});
