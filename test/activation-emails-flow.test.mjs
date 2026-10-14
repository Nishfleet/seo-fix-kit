import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { buildFirstAuditNudge, isNudgeableEmail, sendFirstAuditNudges } from "../worker/lib/activation-emails.js";
import { createTestD1 } from "./support/d1.mjs";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const CTX = { waitUntil() {}, passThroughOnException() {} };
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function setup() {
  const db = createTestD1();
  const sent = [];
  const env = {
    WAITLIST_DB: db,
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
    EMAIL: {
      async send(payload) {
        sent.push(payload);
        return { messageId: `m-${sent.length}` };
      }
    }
  };
  return { db, env, sent };
}

function signedIn(db, email, hours) {
  db.insert("beta_sessions", {
    token_hash: randomBytes(16).toString("hex"),
    owner_email: email,
    created_at: hoursAgo(hours),
    expires_at: new Date(NOW.getTime() + 86_400_000).toISOString(),
    last_seen_at: hoursAgo(hours),
    access_mode: "self-serve"
  });
}

test("a day after signing in without an audit, the owner gets one nudge", async () => {
  const { db, env, sent } = setup();
  signedIn(db, "new@acme.co", 26);
  signedIn(db, "new@acme.co", 2);

  assert.deepEqual(await sendFirstAuditNudges(env, { now: NOW }), ["new@acme.co"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "new@acme.co");
  assert.equal(sent[0].subject, "Your first SEO check takes about a minute");
  assert.match(sent[0].text, /Run my first audit: https:\/\/seofixkit\.com\/beta#new-audit/);
  assert.match(sent[0].text, /Stop these emails: https:\/\/seofixkit\.com\/email\/unsubscribe\/[a-f0-9]{48}/);

  assert.deepEqual(await sendFirstAuditNudges(env, { now: new Date(NOW.getTime() + 900_000) }), []);
  assert.equal(sent.length, 1);
});

test("no nudge too soon, too late, after an audit, after unsubscribing, or to test addresses", async () => {
  const { db, env, sent } = setup();
  signedIn(db, "fresh@acme.co", 3);
  signedIn(db, "stale@acme.co", 24 * 8);
  signedIn(db, "audited@acme.co", 30);
  signedIn(db, "queued@acme.co", 30);
  signedIn(db, "stopped@acme.co", 30);
  signedIn(db, "smoke@example.com", 30);
  db.insert("audit_reports", {
    id: "r1",
    url: "https://acme.co/",
    origin: "https://acme.co",
    score: 80,
    summary_json: "{}",
    report_json: "{}",
    created_at: hoursAgo(29),
    updated_at: hoursAgo(29),
    owner_email: "audited@acme.co",
    target_host: "acme.co",
    expires_at: new Date(NOW.getTime() + 86_400_000).toISOString()
  });
  db.insert("audit_jobs", {
    id: "j1",
    owner_email: "queued@acme.co",
    target_url: "https://acme.co/",
    target_host: "acme.co",
    created_at: hoursAgo(29),
    updated_at: hoursAgo(29)
  });
  db.insert("email_preferences", {
    owner_email: "stopped@acme.co",
    audit_emails: "off",
    unsubscribe_token: "a".repeat(48),
    created_at: hoursAgo(40),
    updated_at: hoursAgo(40)
  });

  assert.deepEqual(await sendFirstAuditNudges(env, { now: NOW }), []);
  assert.equal(sent.length, 0);
});

test("the nudge's unsubscribe link stops it like any audit email", async () => {
  const { db, env, sent } = setup();
  signedIn(db, "new@acme.co", 26);
  await sendFirstAuditNudges(env, { now: NOW });
  const link = new URL(sent[0].text.match(/Stop these emails: (\S+)/)[1]);
  const response = await app.fetch(new Request(`https://seofixkit.com${link.pathname}`, { method: "POST" }), env, CTX);
  assert.equal(response.status, 200);
  const row = db.sqlite.prepare("SELECT audit_emails FROM email_preferences WHERE owner_email = ?").get("new@acme.co");
  assert.equal(row.audit_emails, "off");
});

test("the nudge email names what the first audit gives back", () => {
  const email = buildFirstAuditNudge({ appOrigin: "https://seofixkit.com", unsubscribeUrl: "https://x/u" });
  assert.match(email.html, /Run my first audit/);
  assert.match(email.text, /The 3 fixes to do first/);
  assert.equal(email.tag, "first-audit-nudge");
  assert.equal(isNudgeableEmail("person@company.com"), true);
  assert.equal(isNudgeableEmail("qa@example.com"), false);
  assert.equal(isNudgeableEmail("bot@site.test"), false);
});
