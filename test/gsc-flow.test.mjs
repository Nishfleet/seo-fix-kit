import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const CTX = { waitUntil() {}, passThroughOnException() {} };
const ENV = {
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GSC_TOKEN_SECRET: "test-token-secret"
};

function signIn(db) {
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  db.insert("beta_sessions", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    owner_email: OWNER,
    created_at: now,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_seen_at: now,
    access_mode: "self-serve"
  });
  return token;
}

function verifySiteClaim(db, host) {
  db.insert("site_claims", {
    id: crypto.randomUUID(),
    owner_email: OWNER,
    host,
    verification_token: "sfk-test",
    status: "verified",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verified_at: new Date().toISOString()
  });
}

function seedReport(db) {
  const report = {
    url: "https://shop.example/",
    score: 61,
    summary: { pagesScanned: 2, critical: 1, warnings: 1, notices: 0, totalFindings: 2 },
    findings: [
      {
        id: "issue-thin",
        severity: "critical",
        title: "Thin content on /blog/draft",
        pageUrl: "https://shop.example/blog/draft",
        evidence: "Only 40 words.",
        fix: "Add the real content."
      },
      {
        id: "issue-pricing",
        severity: "notice",
        title: "Duplicate title on /pricing",
        pageUrl: "https://shop.example/pricing",
        evidence: "Same title twice.",
        fix: "Rewrite it."
      },
      {
        id: "issue-home",
        severity: "warning",
        title: "Thin content on /",
        pageUrl: "https://shop.example/",
        evidence: "40 words.",
        fix: "Expand it."
      }
    ],
    repairPlan: []
  };
  db.insert("audit_reports", {
    id: "shop-example-report",
    url: report.url,
    origin: "https://shop.example",
    score: report.score,
    summary_json: JSON.stringify(report.summary),
    report_json: JSON.stringify(report),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: "shop.example",
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()
  });
}

function fakeGoogle({ searchRows }) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    let href = String(url);
    let body = init.body;
    let headers = init.headers;
    if (typeof url !== "string" && url?.url) {
      href = url.url;
      body = url.body ? await url.clone().text() : undefined;
      headers = Object.fromEntries(url.headers);
    }
    calls.push(href);
    if (href.startsWith("https://oauth2.googleapis.com/token")) {
      const form = new URLSearchParams(body || "");
      assert.equal(form.get("client_id"), null, "arctic sends the client secret as a Basic auth header");
      assert.match(headers.authorization || "", /^Basic /);
      const grant = form.get("grant_type");
      return Response.json({
        access_token: `at-${grant}`,
        refresh_token: grant === "authorization_code" ? "rt-1" : undefined,
        token_type: "Bearer",
        expires_in: 3600
      });
    }
    if (href.startsWith("https://www.googleapis.com/webmasters/v3/sites")) {
      return Response.json({
        siteEntry: [
          { siteUrl: "sc-domain:shop.example", permissionLevel: "siteOwner" },
          { siteUrl: "https://other.example/", permissionLevel: "siteFullUser" }
        ]
      });
    }
    if (href.includes("searchAnalytics/query")) {
      assert.ok(href.includes("sc-domain%3Ashop.example"), "the verified property is queried");
      const payload = JSON.parse(body || "{}");
      assert.deepEqual(payload.dimensions, ["page"]);
      assert.ok(new Date(payload.startDate) < new Date(payload.endDate), "90 days back");
      return Response.json({ rows: searchRows });
    }
    return new Response("not found", { status: 404 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = realFetch;
    }
  };
}

async function call(db, env, session, path, { method = "GET", body } = {}) {
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(session ? { cookie: `sfk_beta_session=${session}` } : {}),
        ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" })
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    }),
    { WAITLIST_DB: db, ...env },
    CTX
  );
  return response;
}

test("without the Google OAuth client the connection reports as not configured", async () => {
  const db = createTestD1();
  const session = signIn(db);
  const response = await call(db, {}, session, "/api/gsc/connection");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, connected: false, configured: false });

  const connect = await call(db, {}, session, "/api/gsc/connect", { method: "POST" });
  assert.equal(connect.status, 503);
});

test("connect, sync, reorder the repair queue, then disconnect", async (t) => {
  const db = createTestD1();
  const session = signIn(db);
  verifySiteClaim(db, "shop.example");
  seedReport(db);
  const google = fakeGoogle({
    searchRows: [
      { keys: ["https://shop.example/pricing"], clicks: 400, impressions: 9000 },
      { keys: ["https://shop.example/"], clicks: 1200, impressions: 20000 }
    ]
  });
  t.after(google.restore);

  const started = await call(db, ENV, session, "/api/gsc/connect", { method: "POST" });
  assert.equal(started.status, 200);
  const { authorizeUrl } = await started.json();
  const authorize = new URL(authorizeUrl);
  assert.equal(authorize.origin, "https://accounts.google.com");
  assert.equal(authorize.searchParams.get("scope"), "https://www.googleapis.com/auth/webmasters.readonly");
  assert.equal(authorize.searchParams.get("access_type"), "offline");
  assert.equal(authorize.searchParams.get("redirect_uri"), `${ORIGIN}/api/gsc/callback`);
  assert.ok(authorize.searchParams.get("code_challenge"), "PKCE is on by default");
  const state = authorize.searchParams.get("state");

  const callback = await call(db, ENV, session, `/api/gsc/callback?code=auth-code&state=${state}`);
  assert.equal(callback.status, 302, await callback.clone().text());
  assert.equal(new URL(callback.headers.get("location")).pathname, "/beta");
  assert.match(callback.headers.get("location"), /gsc=connected/);

  const connection = await (await call(db, ENV, session, "/api/gsc/connection")).json();
  assert.equal(connection.connected, true);
  assert.equal(connection.siteUrl, "sc-domain:shop.example");
  const stored = db.rows("SELECT refresh_token_enc FROM gsc_connections WHERE owner_email = ?", OWNER)[0];
  assert.ok(stored.refresh_token_enc.startsWith("v1."), "the refresh token is stored encrypted");
  assert.doesNotMatch(stored.refresh_token_enc, /rt-1/, "the token is never stored in plaintext");

  const synced = await (await call(db, ENV, session, "/api/gsc/sync", { method: "POST" })).json();
  assert.equal(synced.ok, true);
  assert.equal(synced.siteUrl, "sc-domain:shop.example");
  assert.equal(synced.summary.pages, 2);
  assert.equal(synced.summary.clicks, 1600);

  const queue = await (await call(db, ENV, session, "/api/reports/shop-example-report/repair-queue")).json();
  assert.equal(queue.ok, true);
  assert.match(
    JSON.stringify(queue.items.map((item) => item.issueId)),
    /"issue-home".*"issue-pricing".*"issue-thin"/,
    "faults on pages with Google traffic are ranked first"
  );
  assert.match(queue.items[0].trafficReason, /1200 clicks/);
  assert.equal(queue.items[0].priority, 1);

  const disconnected = await call(db, ENV, session, "/api/gsc/disconnect", { method: "POST" });
  assert.equal(disconnected.status, 200);
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM gsc_connections WHERE owner_email = ?", OWNER)[0].n, 0);
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM gsc_page_data WHERE owner_email = ?", OWNER)[0].n, 0);

  const after = await (await call(db, ENV, session, "/api/gsc/connection")).json();
  assert.equal(after.connected, false);
});
