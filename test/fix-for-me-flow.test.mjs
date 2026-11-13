import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createTestD1 } from "./support/d1.mjs";
import { fixForMeQuotaChecks, retryPendingFixForMe, runFixForMe } from "../worker/routes/fix-for-me.js";
import { FIX_FOR_ME_CONSENT_TEXT, TINY_STUDIO_REQUEST_URL } from "../shared/fix-for-me.js";

const SECRET = "shared-test-secret";
const TINY_URL = TINY_STUDIO_REQUEST_URL;

function fakeTinyStudio(responder) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const target = String(url);
    if (!target.startsWith(TINY_URL)) return realFetch(url, init);
    calls.push({ url: target, init });
    return responder(calls.length, { url: target, init });
  };
  return { calls, fetcher };
}

const okTiny = () => fakeTinyStudio(() => new Response(JSON.stringify({ id: "ts_1" }), { status: 202 }));

function fixRequest(body, extraHeaders = {}) {
  return new Request("https://seofixkit.com/api/fix-for-me", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...extraHeaders },
    body: JSON.stringify(body)
  });
}

function envFor(db, extra = {}) {
  return { WAITLIST_DB: db, SEOFIXKIT_REQUEST_SECRET: SECRET, ...extra };
}

let realFetch;

function stubFetch(t, fetcher) {
  realFetch = realFetch || globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = fetcher;
}

test("a submitted request is signed and lands in TinyStudio's queue", async (t) => {
  const db = createTestD1();
  const tiny = okTiny();
  stubFetch(t, tiny.fetcher);

  const response = await runFixForMe(
    fixRequest({ site: "example.com", email: "Owner@Example.com", reportId: "rep_abc12345678" }),
    envFor(db)
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "sent");
  assert.equal(payload.tinyStudioId, "ts_1");
  assert.ok(payload.confirmation);

  const call = tiny.calls[0];
  assert.equal(call.url, TINY_URL);
  assert.equal(call.init.method, "POST");
  const rawBody = call.init.body;
  const body = JSON.parse(rawBody);
  assert.equal(body.site, "https://example.com/");
  assert.equal(body.email, "owner@example.com");
  assert.equal(body.reportId, "rep_abc12345678");
  assert.equal(body.consentText, FIX_FOR_ME_CONSENT_TEXT);

  const timestamp = call.init.headers["X-TinyStudio-Timestamp"];
  assert.match(String(timestamp), /^\d+$/, "timestamp is unix seconds");
  assert.ok(Number(timestamp) <= Date.now() / 1000 + 5, "timestamp is not in the future");
  const expected = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  assert.equal(call.init.headers["X-TinyStudio-Signature"], `sha256=${expected}`);

  const row = db.rows("SELECT * FROM fix_for_me_requests").at(-1);
  assert.equal(row.status, "sent");
  assert.equal(row.tiny_studio_id, "ts_1");
  assert.equal(row.email, "owner@example.com");

  const event = db.rows("SELECT * FROM access_events WHERE step = 'fix_request_submitted'").at(-1);
  assert.ok(event, "the submission is counted in the funnel");
  assert.equal(event.owner_email, "owner@example.com");
});

test("the same reportId and email twice returns the first request and queues nothing new", async (t) => {
  const db = createTestD1();
  const tiny = okTiny();
  stubFetch(t, tiny.fetcher);

  const first = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_dup000000001" }),
    envFor(db)
  );
  assert.equal((await first.json()).status, "sent");

  const second = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_dup000000001" }),
    envFor(db)
  );
  const secondPayload = await second.json();
  assert.equal(secondPayload.ok, true);
  assert.equal(secondPayload.alreadyRequested, true);
  assert.equal(secondPayload.tinyStudioId, "ts_1");
  assert.equal(tiny.calls.length, 1, "no second call to TinyStudio");
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM fix_for_me_requests")[0].n, 1);
});

test("when TinyStudio does not answer the request is kept and retried, never dropped", async (t) => {
  const db = createTestD1();
  const tiny = fakeTinyStudio((n) =>
    n === 1 ? new Response("boom", { status: 500 }) : new Response(JSON.stringify({ id: "ts_late" }), { status: 202 })
  );
  stubFetch(t, tiny.fetcher);

  const first = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_retry0000001" }),
    envFor(db)
  );
  const payload = await first.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "pending", "no false success: TinyStudio did not answer");
  assert.equal(payload.tinyStudioId, "");
  const queued = db.rows("SELECT * FROM fix_for_me_requests WHERE report_id = 'rep_retry0000001'")[0];
  assert.equal(queued.status, "pending");

  const tooSoon = await retryPendingFixForMe(envFor(db));
  assert.equal(tooSoon.retried, 0);

  db.sqlite.exec(
    `UPDATE fix_for_me_requests SET last_attempt_at = '${new Date(Date.now() - 11 * 60 * 1000).toISOString()}'`
  );
  const retried = await retryPendingFixForMe(envFor(db));
  assert.equal(retried.retried, 1);
  assert.equal(retried.sent, 1);
  assert.equal(tiny.calls.length, 2, "a second, later delivery attempt was made");
  const delivered = db.rows("SELECT * FROM fix_for_me_requests WHERE report_id = 'rep_retry0000001'")[0];
  assert.equal(delivered.status, "sent");
  assert.equal(delivered.tiny_studio_id, "ts_late");
});

test("without the shared secret the request is kept for retry, not lost", async (t) => {
  const db = createTestD1();
  const tiny = okTiny();
  stubFetch(t, tiny.fetcher);

  const response = await runFixForMe(
    fixRequest({ site: "example.com", email: "a@example.com", reportId: "rep_nosecret00001" }),
    envFor(db, { SEOFIXKIT_REQUEST_SECRET: "" })
  );
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "pending");
  assert.equal(tiny.calls.length, 0, "nothing unsigned leaves the Worker");
  assert.equal(
    db.rows("SELECT status FROM fix_for_me_requests WHERE report_id = 'rep_nosecret00001'")[0].status,
    "pending"
  );
});

test("private addresses and malformed input are refused before anything is stored", async (t) => {
  const db = createTestD1();
  const tiny = okTiny();
  stubFetch(t, tiny.fetcher);

  const bad = await runFixForMe(fixRequest({ site: "http://127.0.0.1/", email: "a@example.com" }), envFor(db));
  assert.equal(bad.status, 400);
  const badEmail = await runFixForMe(fixRequest({ site: "example.com", email: "not-an-email" }), envFor(db));
  assert.equal(badEmail.status, 400);
  const badBody = await runFixForMe(
    new Request("https://seofixkit.com/api/fix-for-me", { method: "POST", body: "not json" }),
    envFor(db)
  );
  assert.equal(badBody.status, 400);
  assert.equal(tiny.calls.length, 0);
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM fix_for_me_requests")[0].n, 0);
});

test("same abuse guards as the free check: per-network and per-site rate limits", async (t) => {
  const db = createTestD1();
  const tiny = okTiny();
  stubFetch(t, tiny.fetcher);
  const env = envFor(db);

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
  assert.equal(tiny.calls.length, 4, "refused requests never reach TinyStudio");
});

test("the quota buckets hash the target host, never the email", async () => {
  const checks = await fixForMeQuotaChecks("iphash", "example.com");
  const buckets = checks.map((check) => check.bucket).join("|");
  assert.doesNotMatch(buckets, /@/);
  assert.match(buckets, /fix-request:ip-hour:/);
  assert.match(buckets, /fix-request:target-day:/);
});
