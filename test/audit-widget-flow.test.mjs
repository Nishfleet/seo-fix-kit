import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { cleanupExpiredRows } from "../worker/lib/db.js";
import { widgetCheckHandler } from "../worker/routes/audit-widget.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "agency@example.com";
const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const ctx = { waitUntil() {}, passThroughOnException() {} };

function signIn(db, email = OWNER) {
  const token = randomBytes(32).toString("hex");
  db.insert("beta_sessions", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    owner_email: email,
    created_at: iso(0),
    expires_at: iso(-1),
    last_seen_at: iso(0),
    access_mode: "self-serve"
  });
  return token;
}

function payForFixPack(db, email = OWNER, status = "paid") {
  db.insert("fix_requests", {
    id: `fr-${email}`,
    report_id: "example-com-report01",
    owner_email: email,
    target_url: "https://agency.example/",
    target_host: "agency.example",
    status,
    created_at: iso(0),
    updated_at: iso(0)
  });
}

const call = (env, path, { method = "GET", session, body } = {}) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(session ? { cookie: `sfk_beta_session=${session}` } : {}),
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }),
    env,
    ctx
  );

const fakeReport = {
  url: "https://visitor.example/",
  score: 64,
  summary: { critical: 1, warnings: 2, notices: 1 },
  repairPlan: [
    { severity: "critical", title: "Noindex found on home", scoreGain: 12 },
    { severity: "warning", title: "Missing meta description on home", scoreGain: 5 },
    { severity: "warning", title: "Sitemap not found", scoreGain: 5 },
    { severity: "notice", title: "Robots.txt does not list your sitemap", scoreGain: 1 }
  ]
};

function visitorCheck(env, widgetId, body) {
  const handler = widgetCheckHandler({ audit: async () => fakeReport, isPrivateHost: async () => false });
  return handler(
    new Request(`${ORIGIN}/api/embed/${widgetId}/check`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.20" },
      body: JSON.stringify(body)
    }),
    env,
    { id: widgetId },
    ORIGIN
  );
}

test("an owner turns on the widget, a visitor checks a site, and the owner gets the lead", async () => {
  const db = createTestD1();
  const sent = [];
  const env = { WAITLIST_DB: db, EMAIL: { send: async (message) => sent.push(message) } };
  const session = signIn(db);
  payForFixPack(db);
  db.insert("report_branding", {
    owner_email: OWNER,
    agency_name: "Bright Agency",
    brand_color: "#7c3aed",
    accent_color: "#0f9f6e",
    created_at: iso(0),
    updated_at: iso(0)
  });

  assert.equal((await (await call(env, "/api/widget", { session })).json()).widget, null);
  const created = await (await call(env, "/api/widget", { method: "POST", session, body: {} })).json();
  const { id, embedCode } = created.widget;
  assert.match(id, /^[a-f0-9]{20}$/);
  assert.match(embedCode, new RegExp(`<iframe src="${ORIGIN}/embed/${id}"`));

  const page = await call(env, `/embed/${id}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-frame-options"), null, "the widget can be framed on the owner's site");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors \*/);
  const html = await page.text();
  assert.match(html, /--brand: #7c3aed/);
  assert.match(html, /Bright Agency · Powered by/);

  const response = await visitorCheck(env, id, {
    url: "visitor.example",
    email: "Owner@Visitor.example",
    timeToSubmitMs: 5000
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.score, 64);
  assert.equal(result.problems.length, 3);
  assert.deepEqual(result.issues, { critical: 1, warnings: 2, notices: 1 });

  const { leads } = await (await call(env, "/api/widget", { session })).json();
  assert.equal(leads.length, 1);
  assert.deepEqual(
    { email: leads[0].email, url: leads[0].url, score: leads[0].score, problems: leads[0].problems },
    { email: "owner@visitor.example", url: "https://visitor.example/", score: 64, problems: 4 }
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, OWNER);
  assert.equal(sent[0].subject, "New lead: visitor.example scored 64/100");
  assert.match(sent[0].text, /owner@visitor\.example just checked/);
});

test("bots, bad input and turned-off widgets never reach the audit or store a lead", async () => {
  const db = createTestD1();
  const env = { WAITLIST_DB: db };
  const session = signIn(db);
  payForFixPack(db);
  const { widget } = await (await call(env, "/api/widget", { method: "POST", session, body: {} })).json();

  const bot = await visitorCheck(env, widget.id, { url: "visitor.example", email: "a@b.co", company: "x" });
  assert.equal(bot.status, 400);
  const fast = await visitorCheck(env, widget.id, { url: "visitor.example", email: "a@b.co", timeToSubmitMs: 300 });
  assert.equal(fast.status, 400);
  const badEmail = await visitorCheck(env, widget.id, { url: "visitor.example", email: "nope", timeToSubmitMs: 5000 });
  assert.equal(badEmail.status, 400);
  const badUrl = await visitorCheck(env, widget.id, {
    url: "http://localhost/",
    email: "a@b.co",
    timeToSubmitMs: 5000
  });
  assert.equal(badUrl.status, 400);

  await call(env, "/api/widget", { method: "DELETE", session, body: {} });
  assert.equal((await call(env, `/embed/${widget.id}`)).status, 404);
  const off = await visitorCheck(env, widget.id, { url: "visitor.example", email: "a@b.co", timeToSubmitMs: 5000 });
  assert.equal(off.status, 404);
  assert.equal(db.rows("SELECT * FROM widget_leads").length, 0);

  const back = await (await call(env, "/api/widget", { method: "POST", session, body: {} })).json();
  assert.equal(back.widget.id, widget.id, "turning it back on keeps the same embed code");
  assert.equal((await call(env, "/api/widget", { method: "POST", body: {} })).status, 401);
});

test("the cron drops widget leads older than 12 months", async () => {
  const db = createTestD1();
  const lead = (email, daysAgo) =>
    db.insert("widget_leads", {
      widget_id: "w",
      owner_email: OWNER,
      email,
      url: "https://a.example/",
      score: 50,
      problems: 1,
      created_at: iso(daysAgo)
    });
  lead("old@a.example", 400);
  lead("new@a.example", 10);
  await cleanupExpiredRows({ WAITLIST_DB: db });
  assert.deepEqual(
    db.rows("SELECT email FROM widget_leads").map((row) => row.email),
    ["new@a.example"]
  );
});

test("the widget is a Fix Pack feature and stops when the Fix Pack is refunded", async () => {
  const db = createTestD1();
  const env = { WAITLIST_DB: db };
  const session = signIn(db);

  const locked = await (await call(env, "/api/widget", { session })).json();
  assert.equal(locked.unlocked, false);
  const blocked = await call(env, "/api/widget", { method: "POST", session });
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).code, "PAID_FEATURE_LOCKED");

  payForFixPack(db);
  const created = await (await call(env, "/api/widget", { method: "POST", session })).json();
  assert.equal(created.unlocked, true);
  assert.ok(created.widget.id);
  assert.equal((await call(env, `/embed/${created.widget.id}`)).status, 200);

  await db.prepare("UPDATE fix_requests SET status = 'refunded'").run();
  assert.equal((await call(env, `/embed/${created.widget.id}`)).status, 404);
  const check = await visitorCheck(env, created.widget.id, { url: "https://visitor.example/", email: "v@example.com" });
  assert.equal(check.status, 404);
});

test("a test payment never unlocks a paid feature", async () => {
  const db = createTestD1();
  const env = { WAITLIST_DB: db };
  const session = signIn(db);

  payForFixPack(db);
  await db.prepare("UPDATE fix_requests SET is_test = 1").run();

  const blocked = await call(env, "/api/widget", { method: "POST", session });
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).code, "PAID_FEATURE_LOCKED");
  assert.equal((await (await call(env, "/api/widget", { session })).json()).unlocked, false);
});
