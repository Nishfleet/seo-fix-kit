import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { deliverApiWebhooks } from "../worker/lib/webhooks.js";
import { isSlackWebhookUrl, slackMessage } from "../worker/lib/slack.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const SLACK_URL = "https://hooks.slack.com/services/T000/B000/XXXX";

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

function fakeSlack(t, { status = 200 } = {}) {
  const posts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith("https://cloudflare-dns.com/")) {
      return Response.json({ Answer: [{ type: 1, data: "54.1.2.3" }] });
    }
    posts.push({ url: href, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(status === 200 ? "ok" : "no_service", { status });
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  return posts;
}

async function addWebhook(db, session, url) {
  const response = await app.fetch(
    new Request(`${ORIGIN}/api/developer/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `sfk_beta_session=${session}`,
        "cf-connecting-ip": "203.0.113.7"
      },
      body: JSON.stringify({ url })
    }),
    { WAITLIST_DB: db, SEOFIXKIT_API_WEBHOOK_SECRET: "test-webhook-seed" },
    { waitUntil() {}, passThroughOnException() {} }
  );
  return { status: response.status, body: await response.json() };
}

test("recognises only real Slack incoming webhook URLs", () => {
  assert.equal(isSlackWebhookUrl(SLACK_URL), true);
  assert.equal(isSlackWebhookUrl("https://hooks.slack.com.evil.example/services/x"), false);
  assert.equal(isSlackWebhookUrl("http://hooks.slack.com/services/x"), false);
  assert.equal(isSlackWebhookUrl("https://example.com/hook"), false);
});

test("adding a Slack webhook posts a hello and subscribes it to alerts", async (t) => {
  const db = createTestD1();
  const posts = fakeSlack(t);
  const { status, body } = await addWebhook(db, signIn(db), SLACK_URL);
  assert.equal(status, 200);
  assert.equal(body.webhook.kind, "slack");
  assert.equal(body.signingSecret, undefined, "Slack webhooks have no signing secret to show");
  assert.deepEqual(body.webhook.events, [
    "audit.completed",
    "audit.failed",
    "repair_action.fixed",
    "repair_action.regressed"
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, SLACK_URL);
  assert.match(posts[0].body.text, /connected to this channel/);
  assert.equal(posts[0].headers["x-seofixkit-signature"], undefined);
});

test("a Slack URL that Slack rejects is not saved", async (t) => {
  const db = createTestD1();
  fakeSlack(t, { status: 404 });
  const { status, body } = await addWebhook(db, signIn(db), SLACK_URL);
  assert.equal(status, 400);
  assert.match(body.error, /Slack didn’t accept this URL \(HTTP 404\)/);
  const rows = await db.prepare("SELECT COUNT(*) AS count FROM api_webhooks").first();
  assert.equal(rows.count, 0);
});

test("an audit with new problems reaches Slack as a readable alert", async (t) => {
  const db = createTestD1();
  const posts = fakeSlack(t);
  await addWebhook(db, signIn(db), SLACK_URL);
  posts.length = 0;
  await deliverApiWebhooks({ WAITLIST_DB: db }, OWNER, "audit.completed", {
    audit: { audit_id: "a1", url: "https://www.acme.example/" },
    report: {
      id: "r1",
      url: "https://www.acme.example/",
      score: 81,
      summary: { critical: 2, warnings: 1 },
      report_delta: {
        status: "ready",
        summary: { fixedIssuesCount: 3, newIssuesCount: 2, persistentIssuesCount: 1, scoreDelta: -4 }
      }
    }
  });
  assert.equal(posts.length, 1);
  const message = posts[0].body;
  assert.equal(message.text, "New problems found on acme.example: score 81");
  assert.equal(message.blocks[0].text.text, "New SEO problems on acme.example");
  assert.match(message.blocks[1].text.text, /\*Score 81\* · 2 critical problems · 1 warning/);
  assert.match(message.blocks[1].text.text, /3 fixed, 2 new, 1 still open \(-4 since last run\)/);
  assert.match(message.blocks[2].elements[0].text, /<https:\/\/seofixkit\.com\/beta\/reports\/r1\|Open the report>/);
  const event = await db.prepare("SELECT status, payload_json FROM api_webhook_events").first();
  assert.equal(event.status, "delivered");
  assert.equal(JSON.parse(event.payload_json).event, "audit.completed", "the stored event stays the raw JSON");
});

test("repair alerts escape Slack markup in issue titles", () => {
  const message = slackMessage("repair_action.regressed", {
    repair_action: { issue_title: "Title <b> & <!channel>", page_label: "home", report_path: "/beta/reports/r9" },
    report: { url: "https://acme.example/" }
  });
  assert.equal(message.blocks[0].text.text, "A fixed problem is back on acme.example");
  assert.equal(message.blocks[1].text.text, "*Title &lt;b&gt; &amp; &lt;!channel&gt;*\nhome");
});
