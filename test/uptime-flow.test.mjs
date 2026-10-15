import assert from "node:assert/strict";
import test from "node:test";
import { auditScheduleResponse } from "../worker/lib/serializers.js";
import { runUptimeChecks } from "../worker/lib/uptime.js";
import { createTestD1 } from "./support/d1.mjs";

const OWNER = "owner@example.com";
const T0 = "2026-10-15T08:00:00.000Z";
const minutes = (n) => new Date(Date.parse(T0) + n * 60_000).toISOString();

function setup(status = "active") {
  const db = createTestD1();
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

  // Checked too recently: skipped.
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

  assert.deepEqual(await runUptimeChecks(env, { fetchImpl: answers(200), now: minutes(135) }), ["up"]);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].subject, "www.example.com is back up");
  assert.match(sent[1].text, /about 2 hours/);
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
