import assert from "node:assert/strict";
import test from "node:test";
import { createTestD1 } from "./support/d1.mjs";
import { fixForMeQuotaChecks, runFixForMe } from "../worker/routes/fix-for-me.js";
import { FIX_FOR_ME_CONSENT_TEXT } from "../shared/fix-for-me.js";

function fakeQueue() {
  const messages = [];
  return {
    messages,
    send: async (message) => {
      messages.push(message);
    }
  };
}

function fixRequest(body, extraHeaders = {}) {
  return new Request("https://seofixkit.com/api/fix-for-me", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...extraHeaders },
    body: JSON.stringify(body)
  });
}

function envFor(db, extra = {}) {
  const queue = fakeQueue();
  return { env: { WAITLIST_DB: db, TINY_STUDIO_QUEUE: queue, ...extra }, queue };
}

test("a submitted request lands on the tinystudio-requests queue", async () => {
  const db = createTestD1();
  const { env, queue } = envFor(db);

  const response = await runFixForMe(
    fixRequest({ site: "example.com", email: "Owner@Example.com", reportId: "rep_abc12345678" }),
    env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "queued");
  assert.equal(payload.tinyStudioId, "");
  assert.ok(payload.confirmation);

  assert.equal(queue.messages.length, 1, "exactly one queue message");
  const message = queue.messages[0];
  assert.deepEqual(Object.keys(message).sort(), ["consentText", "email", "reportId", "site"]);
  assert.equal(message.site, "https://example.com/");
  assert.equal(message.email, "owner@example.com");
  assert.equal(message.reportId, "rep_abc12345678");
  assert.equal(message.consentText, FIX_FOR_ME_CONSENT_TEXT);

  const row = db.rows("SELECT * FROM fix_for_me_requests").at(-1);
  assert.equal(row.status, "pending");
  assert.equal(row.email, "owner@example.com");

  const event = db.rows("SELECT * FROM access_events WHERE step = 'fix_request_submitted'").at(-1);
  assert.ok(event, "the submission is counted in the funnel");
  assert.equal(event.owner_email, "owner@example.com");
});

test("the same reportId and email twice returns the first request and queues nothing new", async () => {
  const db = createTestD1();
  const { env, queue } = envFor(db);

  const first = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_dup000000001" }),
    env
  );
  assert.equal((await first.json()).status, "queued");

  const second = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_dup000000001" }),
    env
  );
  const secondPayload = await second.json();
  assert.equal(secondPayload.ok, true);
  assert.equal(secondPayload.alreadyRequested, true);
  assert.equal(queue.messages.length, 1, "no second queue message");
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM fix_for_me_requests")[0].n, 1);
});

test("private addresses and malformed input are refused before anything is stored or queued", async () => {
  const db = createTestD1();
  const { env, queue } = envFor(db);

  const bad = await runFixForMe(fixRequest({ site: "http://127.0.0.1/", email: "a@example.com" }), env);
  assert.equal(bad.status, 400);
  const badEmail = await runFixForMe(fixRequest({ site: "example.com", email: "not-an-email" }), env);
  assert.equal(badEmail.status, 400);
  const badBody = await runFixForMe(
    new Request("https://seofixkit.com/api/fix-for-me", { method: "POST", body: "not json" }),
    env
  );
  assert.equal(badBody.status, 400);
  assert.equal(queue.messages.length, 0);
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM fix_for_me_requests")[0].n, 0);
});

test("same abuse guards as the free check: per-network and per-site rate limits", async () => {
  const db = createTestD1();
  const { env, queue } = envFor(db);

  for (let i = 0; i < 2; i += 1) {
    const response = await runFixForMe(fixRequest({ site: "example.com", email: `a${i}@example.com` }), env);
    assert.equal(response.status, 200, `request ${i + 1} passes the per-site limit`);
  }
  const blockedSite = await runFixForMe(
    fixRequest({ site: "example.com", email: "a9@example.com" }, { "cf-connecting-ip": "203.0.113.77" }),
    env
  );
  assert.equal(blockedSite.status, 429, "the per-site limit applies across networks too");
  const otherSite = await runFixForMe(
    fixRequest({ site: "other.example", email: "b@example.com" }, { "cf-connecting-ip": "203.0.113.77" }),
    env
  );
  assert.equal(otherSite.status, 200, "another site is still allowed from the same network");

  const thirdSite = await runFixForMe(
    fixRequest({ site: "third.example", email: "c@example.com" }, { "cf-connecting-ip": "203.0.113.77" }),
    env
  );
  assert.equal(thirdSite.status, 200);
  const blockedNetwork = await runFixForMe(
    fixRequest({ site: "fourth.example", email: "d@example.com" }, { "cf-connecting-ip": "203.0.113.77" }),
    env
  );
  assert.equal(blockedNetwork.status, 429, "the per-network limit stops a fourth request this hour");
  assert.equal(queue.messages.length, 4, "refused requests never reach the queue");
});

test("the quota buckets hash the target host, never the email", async () => {
  const checks = await fixForMeQuotaChecks("iphash", "example.com");
  const buckets = checks.map((check) => check.bucket).join("|");
  assert.doesNotMatch(buckets, /@/);
  assert.match(buckets, /fix-request:ip-hour:/);
  assert.match(buckets, /fix-request:target-day:/);
});
