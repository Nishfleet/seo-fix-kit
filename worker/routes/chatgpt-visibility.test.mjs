import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { app } from "../index.js";
import { createTestD1 } from "../../test/support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const CTX = { waitUntil() {}, passThroughOnException() {} };
const HOST = "shop.example";
const SYNTHETIC = JSON.parse(
  fs.readFileSync(new URL("../../test/fixtures/chatgpt-llm-scraper-response.synthetic.json", import.meta.url), "utf8")
);

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

async function verifySite(db) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_claims (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
       VALUES (?, ?, ?, 'token', 'verified', 'meta', ?, ?, ?, NULL, NULL)`
    )
    .bind(`claim-${randomBytes(4).toString("hex")}`, OWNER, HOST, now, now, now)
    .run();
}

async function call(db, session, body, extraEnv = {}) {
  const response = await app.fetch(
    new Request(`${ORIGIN}/api/chatgpt-visibility`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sfk_beta_session=${session}` },
      body: JSON.stringify(body)
    }),
    { WAITLIST_DB: db, ...extraEnv },
    CTX
  );
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

test("the check needs a signed-in session and a verified site", async () => {
  const db = createTestD1();
  const unauthenticated = await call(db, "", { host: HOST });
  assert.equal(unauthenticated.status, 401);

  const session = signIn(db);
  const unverified = await call(
    db,
    session,
    { host: HOST },
    {
      DATAFORSEO_LOGIN: "login@example.com",
      DATAFORSEO_PASSWORD: "secret"
    }
  );
  assert.equal(unverified.status, 403);
  assert.equal(unverified.json.code, "SITE_VERIFICATION_REQUIRED");
});

test("without the DataForSEO secrets the check refuses before any spend", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const result = await call(db, session, { host: HOST });
  assert.equal(result.status, 503);
  assert.match(result.json.error, /DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD/);
  assert.equal(db.rows("SELECT COUNT(*) AS count FROM chatgpt_visibility_runs")[0].count, 0);
});

test("a verified site gets one free report and later calls return the stored report", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const requests = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), auth: init?.headers?.authorization, body: JSON.parse(init?.body || "[]") });
    return Response.json(JSON.parse(JSON.stringify(SYNTHETIC)));
  };
  let first;
  try {
    first = await call(
      db,
      session,
      { host: HOST, brand: "Shop", description: "Shop sells handmade lamps." },
      { DATAFORSEO_LOGIN: "login@example.com", DATAFORSEO_PASSWORD: "secret" }
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.json.cached, false);
  assert.equal(first.json.report.brand, "Shop");
  assert.equal(first.json.report.named, false);
  assert.equal(first.json.report.namedQuestions, 0);
  assert.ok(first.json.report.whoNamedInstead.includes("SEOFixKit"));
  assert.equal(first.json.report.totalCost, 0.02);
  assert.ok(first.json.markdown.includes("**Not yet.** ChatGPT did not name Shop in any of the 5 buyer questions"));
  assert.equal(requests.length, 5);
  assert.ok(
    requests.every((request) => request.url.includes("/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced"))
  );
  assert.ok(requests.every((request) => request.auth === `Basic ${btoa("login@example.com:secret")}`));
  assert.ok(requests.every((request) => request.body.length === 1));
  assert.ok(requests[4].body[0].keyword.startsWith("Is Shop a good choice for"));
  assert.equal(
    db.rows("SELECT COUNT(*) AS count FROM chatgpt_visibility_runs WHERE host = ? AND owner_email = ?", HOST, OWNER)[0]
      .count,
    1
  );

  const second = await call(
    db,
    session,
    { host: HOST, brand: "Shop" },
    {
      DATAFORSEO_LOGIN: "login@example.com",
      DATAFORSEO_PASSWORD: "secret"
    }
  );
  assert.equal(second.status, 200);
  assert.equal(second.json.cached, true);
  assert.equal(second.json.report.brand, "Shop");
  assert.equal(requests.length, 5, "a cached repeat call makes no new DataForSEO requests");
});

test("another verified site gets its own free report", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const otherHost = "studio.example";
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_claims (id, owner_email, host, verification_token, status, verification_method, created_at, updated_at, verified_at, last_checked_at, revoked_at)
       VALUES (?, ?, ?, 'token', 'verified', 'meta', ?, ?, ?, NULL, NULL)`
    )
    .bind("claim-other", OWNER, otherHost, now, now, now)
    .run();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(JSON.parse(JSON.stringify(SYNTHETIC)));
  let result;
  try {
    result = await call(
      db,
      session,
      { host: otherHost },
      { DATAFORSEO_LOGIN: "login@example.com", DATAFORSEO_PASSWORD: "secret" }
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.cached, false);
  const rows = db.rows("SELECT host FROM chatgpt_visibility_runs");
  assert.deepEqual(rows.map((row) => row.host).sort(), [otherHost]);
});

const ENV = { DATAFORSEO_LOGIN: "login@example.com", DATAFORSEO_PASSWORD: "secret" };

test("when every answer is unavailable nothing is stored and the free report is not used", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("down", { status: 500 });
  };
  try {
    const result = await call(db, session, { host: HOST }, ENV);
    assert.equal(result.status, 502);
    assert.equal(calls, 5);
    assert.equal(db.rows("SELECT COUNT(*) AS count FROM chatgpt_visibility_runs")[0].count, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("one failed question does not discard the other paid answers", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 3) return new Response("down", { status: 500 });
    return Response.json(JSON.parse(JSON.stringify(SYNTHETIC)));
  };
  try {
    const result = await call(db, session, { host: HOST, brand: "Shop" }, ENV);
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.equal(result.json.report.unavailableQuestions, 1);
    assert.equal(db.rows("SELECT COUNT(*) AS count FROM chatgpt_visibility_runs")[0].count, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a second request while a report is running spends nothing", async () => {
  const db = createTestD1();
  const session = signIn(db);
  await verifySite(db);
  const realFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  globalThis.fetch = async () => {
    calls += 1;
    await gate;
    return Response.json(JSON.parse(JSON.stringify(SYNTHETIC)));
  };
  try {
    const firstRun = call(db, session, { host: HOST, brand: "Shop" }, ENV);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await call(db, session, { host: HOST, brand: "Shop" }, ENV);
    assert.equal(second.status, 409);
    assert.equal(calls, 5, "only the first request made paid calls");
    release();
    assert.equal((await firstRun).status, 200);
  } finally {
    release();
    globalThis.fetch = realFetch;
  }
});
