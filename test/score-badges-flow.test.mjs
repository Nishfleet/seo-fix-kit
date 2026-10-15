import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { scoreCardHtml, scoreCardVersion } from "../worker/routes/badges.js";
import { app } from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
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

function seed(db) {
  db.insert("audit_reports", {
    id: "rep-1",
    url: "https://example.com/",
    origin: "https://example.com",
    score: 91,
    summary_json: "{}",
    report_json: "{}",
    created_at: iso(1),
    updated_at: iso(1),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: "example.com",
    expires_at: iso(-29)
  });
  [
    ["old", 64, 18, 60],
    ["mid", 78, 9, 30],
    ["rep-1", 91, 3, 1]
  ].forEach(([reportId, score, findings, daysAgo]) =>
    db.insert("score_history", {
      owner_email: OWNER,
      report_id: reportId,
      url: "https://example.com/",
      target_host: "example.com",
      score,
      total_findings: findings,
      created_at: iso(daysAgo)
    })
  );
}

const call = (db, path, { method = "GET", session, env = {} } = {}) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(session ? { cookie: `sfk_beta_session=${session}` } : {}),
        ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" })
      }
    }),
    { WAITLIST_DB: db, ...env },
    ctx
  );

test("an owner turns on a badge that shows their latest score and progress publicly", async () => {
  const db = createTestD1();
  seed(db);
  const session = signIn(db);

  const before = await (await call(db, "/api/reports/rep-1/badge", { session })).json();
  assert.equal(before.badge, null);

  const created = await (await call(db, "/api/reports/rep-1/badge", { method: "POST", session })).json();
  assert.equal(created.host, "example.com");
  assert.match(created.badge.imageUrl, /^https:\/\/seofixkit\.com\/badge\/[a-f0-9]{20}\.svg$/);
  assert.match(created.badge.html, /<a href="https:\/\/seofixkit\.com\/score\/[a-f0-9]{20}"><img src=/);

  const again = await (await call(db, "/api/reports/rep-1/badge", { method: "POST", session })).json();
  assert.equal(again.badge.id, created.badge.id, "one badge per site");

  const svg = await call(db, `/badge/${created.badge.id}.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
  assert.equal(svg.headers.get("access-control-allow-origin"), "*");
  assert.match(await svg.text(), /SEO Fix Kit score: 91\/100/);

  const page = await call(db, `/score/${created.badge.id}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<h1>example\.com<\/h1>/);
  assert.match(html, /<strong>91<\/strong>/);
  assert.match(html, /\+27 since/);
  assert.match(html, /noindex, follow/);
  assert.match(html, /Check your site free/);
  assert.match(html, new RegExp(`og:image" content="${ORIGIN}/score/${created.badge.id}/card\\.png\\?v=[a-z0-9]+"`));
  assert.match(html, /x\.com\/intent\/post\?text=example\.com%20went%20up%2027%20points%20to%2091%2F100/);
  assert.match(html, /linkedin\.com\/sharing\/share-offsite/);
});

test("the score share card is cached per score and falls back to the site image without a browser", async () => {
  const db = createTestD1();
  seed(db);
  const session = signIn(db);
  const { badge } = await (await call(db, "/api/reports/rep-1/badge", { method: "POST", session })).json();

  const fallback = await call(db, `/score/${badge.id}/card.png`);
  assert.equal(fallback.status, 302);
  assert.equal(fallback.headers.get("location"), `${ORIGIN}/og-image.png`);

  const stored = new Map();
  const deleted = [];
  const REPORTS = {
    async get(key) {
      return stored.get(key) || null;
    },
    async delete(key) {
      deleted.push(key);
    }
  };
  const key = `score-cards/${badge.id}.png`;
  stored.set(key, { body: "OLD", customMetadata: { version: "stale" } });
  assert.equal(
    (await call(db, `/score/${badge.id}/card.png`, { env: { REPORTS } })).status,
    302,
    "a card from older history is never served"
  );

  const page = await (await call(db, `/score/${badge.id}`)).text();
  const version = page.match(/card\.png\?v=([a-z0-9]+)"/)[1];
  stored.set(key, { body: "PNG", customMetadata: { version } });
  const cached = await call(db, `/score/${badge.id}/card.png`, { env: { REPORTS } });
  assert.equal(cached.status, 200);
  assert.equal(cached.headers.get("content-type"), "image/png");
  assert.equal(await cached.text(), "PNG");

  const broken = {
    async get() {
      throw new Error("R2 down");
    }
  };
  assert.equal(
    (await call(db, `/score/${badge.id}/card.png`, { env: { REPORTS: broken } })).status,
    302,
    "a storage error falls back to the site image"
  );

  assert.notEqual(
    scoreCardVersion([
      { score: 64, created_at: "a" },
      { score: 91, created_at: "b" }
    ]),
    scoreCardVersion([{ score: 91, created_at: "b" }]),
    "dropping an expired check changes the version"
  );

  await call(db, `/api/badges/${badge.id}`, { method: "DELETE", session, env: { REPORTS } });
  assert.deepEqual(deleted, [key], "turning a badge off removes its card");

  assert.equal((await call(db, "/score/00000000000000000000/card.png")).status, 404);

  const card = scoreCardHtml({
    host: "example.com",
    points: [
      { score: 64, created_at: iso(60) },
      { score: 91, created_at: iso(1) }
    ]
  });
  assert.match(card, /<span class="score">91<\/span>/);
  assert.match(card, /\+27 points/);
  assert.match(card, /seofixkit\.com/);
});

test("badges stay private to their owner and stop working once turned off", async () => {
  const db = createTestD1();
  seed(db);
  const owner = signIn(db);
  const stranger = signIn(db, "someone@example.com");

  assert.equal((await call(db, "/api/reports/rep-1/badge", { method: "POST", session: stranger })).status, 404);
  assert.equal((await call(db, "/api/reports/rep-1/badge", { method: "POST" })).status, 401);

  const { badge } = await (await call(db, "/api/reports/rep-1/badge", { method: "POST", session: owner })).json();
  assert.equal((await call(db, `/api/badges/${badge.id}`, { method: "DELETE", session: stranger })).status, 404);
  assert.equal((await call(db, `/api/badges/${badge.id}`, { method: "DELETE", session: owner })).status, 200);

  assert.equal((await call(db, `/score/${badge.id}`)).status, 404);
  const svg = await call(db, `/badge/${badge.id}.svg`);
  assert.equal(svg.status, 404);
  assert.match(await svg.text(), /pending/);

  const back = await (await call(db, "/api/reports/rep-1/badge", { method: "POST", session: owner })).json();
  assert.equal(back.badge.id, badge.id, "turning it back on keeps the same embed code");
});
