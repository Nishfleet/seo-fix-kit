import assert from "node:assert/strict";
import test from "node:test";
import { createTestD1 } from "../../test/support/d1.mjs";
import { buildOpsDigestEmail } from "../../shared/fulfillment.js";
import { growthFunnelWeek, growthFunnelWeekBounds, growthFunnelWeeks } from "./growth-funnel.js";

const NOW = "2026-11-18T10:00:00.000Z";

function seed(db) {
  for (const [funnelKey, createdAt] of [
    ["fk-week-1", "2026-11-10T08:00:00.000Z"],
    ["fk-week-1", "2026-11-10T09:00:00.000Z"],
    ["fk-week-2", "2026-11-11T08:00:00.000Z"],
    ["", "2026-11-11T08:00:00.000Z"],
    ["fk-earlier-week", "2026-11-03T08:00:00.000Z"],
    ["fk-no-step", "2026-11-10T08:00:00.000Z"]
  ]) {
    db.insert("access_events", {
      step: funnelKey === "fk-no-step" ? "audit_started" : "beta_view",
      funnel_key: funnelKey,
      created_at: createdAt
    });
  }
  for (const [bucket, count, windowStart] of [
    ["check:ip-hour:2026-11-10T08:hash-a", 3, "2026-11-10T08"],
    ["check:ip-hour:2026-11-10T09:hash-b", 2, "2026-11-10T09"],
    ["check:ip-hour:2026-11-04T08:hash-c", 4, "2026-11-04T08"],
    ["check:ip-day:2026-11-10:hash-a", 5, "2026-11-10"],
    ["check:target-hour:2026-11-10T08:target", 1, "2026-11-10T08"],
    ["audit:ip-hour:2026-11-10T08:hash-a", 9, "2026-11-10T08"]
  ]) {
    db.insert("audit_usage", { bucket, count, window_start: windowStart, updated_at: "2026-11-10T09:00:00.000Z" });
  }
  for (const [tokenHash, ownerEmail, accessMode, createdAt] of [
    ["session-1", "buyer-one@example.com", "self-serve", "2026-11-10T08:00:00.000Z"],
    ["session-1b", "buyer-one@example.com", "self-serve", "2026-11-11T08:00:00.000Z"],
    ["session-2", "buyer-two@example.com", "invite", "2026-11-10T09:00:00.000Z"],
    ["session-owner", "owner@seofixkit.com", "founder-override", "2026-11-10T10:00:00.000Z"],
    ["session-earlier", "buyer-three@example.com", "self-serve", "2026-11-04T08:00:00.000Z"]
  ]) {
    db.insert("beta_sessions", {
      token_hash: tokenHash,
      owner_email: ownerEmail,
      access_mode: accessMode,
      created_at: createdAt,
      last_seen_at: createdAt,
      expires_at: "2026-11-24T08:00:00.000Z"
    });
  }
  for (const [id, ownerEmail, createdAt] of [
    ["report-1", "buyer-one@example.com", "2026-11-10T12:00:00.000Z"],
    ["report-2", "buyer-two@example.com", "2026-11-11T12:00:00.000Z"],
    ["report-owner", "owner@seofixkit.com", "2026-11-10T13:00:00.000Z"],
    ["report-earlier", "buyer-three@example.com", "2026-11-05T12:00:00.000Z"]
  ]) {
    db.insert("audit_reports", {
      id,
      url: `https://site-${id}.example.com/`,
      origin: `https://site-${id}.example.com`,
      owner_email: ownerEmail,
      target_host: `site-${id}.example.com`,
      report_json: "{}",
      summary_json: "{}",
      score: 70,
      created_at: createdAt,
      updated_at: createdAt
    });
  }
  const fixRequest = (id, overrides = {}) =>
    db.insert("fix_requests", {
      id,
      report_id: `report-${id}`,
      owner_email: "buyer-one@example.com",
      target_url: "https://www.example.com/",
      target_host: "www.example.com",
      status: "new",
      is_test: 0,
      created_at: "2026-11-10T08:00:00.000Z",
      updated_at: "2026-11-10T08:00:00.000Z",
      ...overrides
    });
  fixRequest("fr-checkout-1", { checkout_created_at: "2026-11-10T14:00:00.000Z" });
  fixRequest("fr-checkout-test", { checkout_created_at: "2026-11-10T14:00:00.000Z", is_test: 1 });
  fixRequest("fr-checkout-earlier", { checkout_created_at: "2026-11-04T14:00:00.000Z" });
  fixRequest("fr-paid-1", { paid_at: "2026-11-10T15:00:00.000Z", status: "paid" });
  fixRequest("fr-paid-test", { paid_at: "2026-11-10T15:00:00.000Z", status: "paid", is_test: 1 });
  fixRequest("fr-paid-earlier", { paid_at: "2026-11-04T15:00:00.000Z", status: "paid" });
}

test("week bounds land on UTC Mondays and label the covered days", () => {
  const bounds = growthFunnelWeekBounds(NOW, 1);
  assert.equal(bounds.weekStart, "2026-11-09T00:00:00.000Z");
  assert.equal(bounds.weekEnd, "2026-11-16T00:00:00.000Z");
  assert.equal(bounds.label, "2026-11-09 to 2026-11-15");
  const current = growthFunnelWeekBounds(NOW, 0);
  assert.equal(current.weekStart, "2026-11-16T00:00:00.000Z");
});

test("weekly funnel counts the six steps and excludes owner and test rows", async () => {
  const db = createTestD1();
  seed(db);
  const env = { WAITLIST_DB: db };

  const week = await growthFunnelWeek(env, growthFunnelWeekBounds(NOW, 1));
  assert.deepEqual(week.steps, {
    visits: 2,
    checks: 5,
    accounts: 2,
    audits: 2,
    checkouts: 1,
    paid: 1
  });

  const earlierWeek = await growthFunnelWeek(env, growthFunnelWeekBounds(NOW, 2));
  assert.deepEqual(earlierWeek.steps, {
    visits: 1,
    checks: 4,
    accounts: 1,
    audits: 1,
    checkouts: 1,
    paid: 1
  });
});

test("the weeks list is newest first with the running week first", async () => {
  const db = createTestD1();
  seed(db);
  const weeks = await growthFunnelWeeks({ WAITLIST_DB: db }, { weeks: 3, now: NOW });
  assert.equal(weeks.length, 3);
  assert.equal(weeks[0].weekStart, "2026-11-16T00:00:00.000Z");
  assert.deepEqual(weeks[0].steps, { visits: 0, checks: 0, accounts: 0, audits: 0, checkouts: 0, paid: 0 });
  assert.equal(weeks[1].weekStart, "2026-11-09T00:00:00.000Z");
  assert.equal(weeks[2].weekStart, "2026-11-02T00:00:00.000Z");
  assert.deepEqual(weeks[2].steps, { visits: 1, checks: 4, accounts: 1, audits: 1, checkouts: 1, paid: 1 });
});

test("a missing database degrades to zeroed weeks instead of throwing", async () => {
  const weeks = await growthFunnelWeeks({}, { weeks: 1, now: NOW });
  assert.deepEqual(weeks[0].steps, { visits: 0, checks: 0, accounts: 0, audits: 0, checkouts: 0, paid: 0 });
  assert.equal(weeks[0].weekStart, "2026-11-16T00:00:00.000Z");
});

test("the ops digest carries the previous week's six funnel numbers", async () => {
  const email = buildOpsDigestEmail({
    appOrigin: "https://seofixkit.com",
    snapshot: {
      openPaid: 1,
      inProgress: 0,
      overdue: 0,
      deliveredToday: 0,
      webhookErrors: 0,
      emailErrors: 0,
      runningJobs: 0,
      queuedJobs: 0,
      failedJobs24h: 0,
      overdueSchedules: 0,
      growthFunnel: {
        weekStart: "2026-11-09T00:00:00.000Z",
        weekEnd: "2026-11-16T00:00:00.000Z",
        label: "2026-11-09 to 2026-11-15",
        steps: { visits: 2, checks: 5, accounts: 2, audits: 2, checkouts: 1, paid: 1 }
      }
    }
  });
  const expected =
    "Last week (2026-11-09 to 2026-11-15): visits 2, free page checks 5, accounts 2, site audits 2, checkouts started 1, Fix Packs paid 1";
  assert.ok(email.text.includes(expected), `text missing the weekly funnel line:\n${email.text}`);
  assert.ok(email.html.includes("Last week (2026-11-09 to 2026-11-15)"));
  assert.ok(email.html.includes("Fix Packs paid 1"));
  const withoutGrowth = buildOpsDigestEmail({
    appOrigin: "https://seofixkit.com",
    snapshot: { openPaid: 0, inProgress: 0, overdue: 0, deliveredToday: 0, webhookErrors: 0, emailErrors: 0 }
  });
  assert.ok(!withoutGrowth.text.includes("Last week ("), "digest without funnel data must omit the line");
});
