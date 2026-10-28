import assert from "node:assert/strict";
import test from "node:test";
import { auditScheduleResponse } from "../worker/lib/serializers.js";
import { runUptimeChecks as runChecks, uptimeAlertsIncluded } from "../worker/lib/uptime.js";
import { createTestD1 } from "./support/d1.mjs";

const OWNER = "owner@example.com";
const T0 = "2026-10-15T08:00:00.000Z";
const minutes = (n) => new Date(Date.parse(T0) + n * 60_000).toISOString();

const publicOnly = async () => false;
const runUptimeChecks = (env, options) => runChecks(env, { privateAddressResolver: publicOnly, ...options });

function insertSchedule(db, id, status = "active") {
  db.insert("audit_schedules", {
    id,
    owner_email: OWNER,
    access_mode: "self-serve",
    target_url: `https://${id}.example.com/`,
    target_host: `${id}.example.com`,
    status,
    next_run_at: T0,
    created_at: T0,
    updated_at: T0
  });
}

function payFixPack(db, status = "paid") {
  db.insert("fix_requests", {
    id: `fr-${status}`,
    report_id: "r1",
    owner_email: OWNER,
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status,
    paid_at: T0,
    created_at: T0,
    updated_at: T0
  });
}

function setup(status = "active", { paid = true } = {}) {
  const db = createTestD1();
  if (paid) payFixPack(db);
  db.insert("audit_schedules", {
    id: "s1",
    owner_email: OWNER,
    access_mode: "self-serve",
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status,
    next_run_at: T0,
    created_at: T0,
    updated_at: T0
  });
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
  const row = () => db.rows("SELECT * FROM audit_schedules WHERE id = 's1'")[0];
  return { db, env, sent, row };
}

const answers = (status) => async () => new Response("ok", { status });
const unreachable = async () => {
  throw new TypeError("fetch failed");
};

test("a site that stops answering twice in a row is marked down once, and recovery is emailed", async () => {
  const { env, sent, row } = setup();

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: answers(200), now: T0 }), ["up"]);
  assert.equal(row().uptime_status, "up");

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(5) }), []);

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(15) }), ["failing"]);
  assert.equal(sent.length, 0, "one failure is not enough to alert");

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: answers(503), now: minutes(30) }), ["down"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "www.example.com is down");
  assert.match(sent[0].text, /error 503/);
  assert.equal(row().uptime_down_since, minutes(15));

  const view = auditScheduleResponse(row());
  assert.equal(view.uptime.status, "down");
  assert.equal(view.uptime.downSince, minutes(15));

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(45) }), ["down"]);
  assert.equal(sent.length, 1, "no repeat alert while still down");

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: answers(200), now: minutes(60) }), ["up"]);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].subject, "www.example.com is back up");
  assert.match(sent[1].text, /about 45 minutes/);
  assert.equal(row().uptime_fail_count, 0);
  assert.equal(row().uptime_down_since, null);
});

test("a single blip, a 404 and paused monitors never trigger a down alert", async () => {
  const { env, sent, row } = setup();
  await runUptimeChecks(env, { fetchImpl: unreachable, now: T0 });
  await runUptimeChecks(env, { fetchImpl: answers(200), now: minutes(15) });
  await runUptimeChecks(env, { fetchImpl: answers(404), now: minutes(30) });
  await runUptimeChecks(env, { fetchImpl: answers(404), now: minutes(45) });
  assert.equal(row().uptime_status, "up");
  assert.equal(sent.length, 0);

  const paused = setup("paused");
  assert.deepEqual(await runUptimeChecks(paused.env, { fetchImpl: unreachable, now: T0 }), []);
});

test("owners who stopped audit emails are not emailed about downtime", async () => {
  const { db, env, sent, row } = setup();
  db.insert("email_preferences", {
    owner_email: OWNER,
    audit_emails: "off",
    unsubscribe_token: "tok",
    created_at: T0,
    updated_at: T0
  });
  await runUptimeChecks(env, { fetchImpl: unreachable, now: T0 });
  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(15) });
  assert.equal(row().uptime_status, "down");
  assert.equal(sent.length, 0);
});

test("a down alert that fails to send is retried on the next check", async () => {
  const { env, sent, row } = setup();
  let failNext = true;
  const send = env.EMAIL.send;
  env.EMAIL.send = async (payload) => {
    if (failNext) {
      failNext = false;
      throw new Error("provider down");
    }
    return send(payload);
  };
  await runUptimeChecks(env, { fetchImpl: unreachable, now: T0 });
  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(15) });
  assert.equal(row().uptime_status, "down");
  assert.equal(sent.length, 0);
  assert.equal(row().uptime_alerted, null);
  assert.equal(row().uptime_down_since, T0);

  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(30) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "www.example.com is down");
  assert.equal(row().uptime_alerted, "down");
});

test("pausing weekly checks while a check is running sends nothing and leaves the row alone", async () => {
  const { db, env, sent, row } = setup();
  await runUptimeChecks(env, { fetchImpl: unreachable, now: T0 });
  const pauseThenFail = async () => {
    db.sqlite.prepare("UPDATE audit_schedules SET status = 'paused' WHERE id = 's1'").run();
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: pauseThenFail, now: minutes(15) }), ["skipped"]);
  assert.equal(sent.length, 0);
  assert.equal(row().uptime_fail_count, 1);
});

test("a redirect to a private address is never followed and never counts as down", async () => {
  const { env, sent, row } = setup();
  const calls = [];
  const redirectInside = async (url) => {
    calls.push(url);
    return new Response("", { status: 302, headers: { location: "http://10.0.0.5/admin" } });
  };
  for (const at of [T0, minutes(15), minutes(30)]) {
    assert.deepEqual(await runUptimeChecks(env, { fetchImpl: redirectInside, now: at }), ["skipped"]);
  }
  assert.deepEqual(calls, ["https://www.example.com/", "https://www.example.com/", "https://www.example.com/"]);
  assert.equal(row().uptime_status, null);
  assert.equal(sent.length, 0);
});

test("more than one batch of due sites is checked in the same tick", async () => {
  const { db, env } = setup();
  for (let index = 0; index < 30; index += 1) insertSchedule(db, `site${index}`);
  const outcomes = await runUptimeChecks(env, { fetchImpl: answers(200), now: T0 });
  assert.equal(outcomes.length, 31);
  assert.equal(db.rows("SELECT id FROM audit_schedules WHERE uptime_checked_at IS NULL").length, 0);
});

test("downtime alerts are a paid perk: no Fix Pack, or a refunded one, means no pings", async () => {
  const unpaid = setup("active", { paid: false });
  const calls = [];
  const spy = async (url) => {
    calls.push(url);
    return new Response("ok");
  };
  assert.equal(await uptimeAlertsIncluded(unpaid.env, OWNER), false);
  assert.deepEqual(await runUptimeChecks(unpaid.env, { fetchImpl: spy, now: T0 }), []);

  payFixPack(unpaid.db, "refunded");
  assert.equal(await uptimeAlertsIncluded(unpaid.env, OWNER), false);
  assert.deepEqual(await runUptimeChecks(unpaid.env, { fetchImpl: spy, now: T0 }), []);
  assert.equal(calls.length, 0);

  const paid = setup();
  assert.equal(await uptimeAlertsIncluded(paid.env, OWNER), true);
  assert.deepEqual(await runUptimeChecks(paid.env, { fetchImpl: spy, now: T0 }), ["up"]);
});

test("a test payment never unlocks downtime alerts", async () => {
  const { db, env } = setup("active", { paid: false });
  db.insert("fix_requests", {
    id: "fr-test",
    report_id: "r1",
    owner_email: OWNER,
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status: "paid",
    paid_at: T0,
    is_test: 1,
    created_at: T0,
    updated_at: T0
  });
  assert.equal(await uptimeAlertsIncluded(env, OWNER), false);
});

test("after a gap in checking, a new outage is alerted even if the old one never cleared", async () => {
  const { env, sent, row } = setup();
  await runUptimeChecks(env, { fetchImpl: unreachable, now: T0 });
  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(15) });
  assert.equal(sent.length, 1);
  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(24 * 60) });
  assert.equal(row().uptime_alerted, null);
  await runUptimeChecks(env, { fetchImpl: unreachable, now: minutes(24 * 60 + 15) });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].subject, "www.example.com is down");
});
