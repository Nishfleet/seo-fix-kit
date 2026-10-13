// Audit emails: a finished audit emails its owner a summary (report ready, or
// the weekly check's fixed/new/next), every email carries a one-click
// unsubscribe link, and the Alerts page toggle and that link both switch the
// same preference. Requests go through the Worker's real Hono app against an
// in-memory SQLite database; only the email binding is faked.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { autoEnableWeeklyCheck } from "../worker/routes/audits.js";
import { buildAuditEmail, sendAuditCompletedEmail, shouldEmailAudit, topFixes } from "../worker/lib/audit-emails.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const CTX = { waitUntil() {}, passThroughOnException() {} };

function emailEnv(db) {
  const sent = [];
  return {
    env: {
      WAITLIST_DB: db,
      SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
      EMAIL: {
        async send(payload) {
          sent.push(payload);
          return { messageId: `m-${sent.length}` };
        }
      }
    },
    sent
  };
}

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

const finding = (title, severity, pageUrl, fix = "") => ({ title, severity, pageUrl, fix });

const firstReport = {
  id: "r1",
  url: "https://www.example.com/",
  reportPath: "/beta/reports/r1",
  score: 72,
  summary: { pagesScanned: 10 },
  findings: [
    finding("Missing meta description", "warning", "https://www.example.com/a", "Add a 150-character summary."),
    finding("Missing meta description", "warning", "https://www.example.com/b"),
    finding("Page has no H1", "critical", "https://www.example.com/c", "Add one H1 that names the page."),
    finding("Image missing alt text", "notice", "https://www.example.com/d"),
    finding("Canonical present", "good", "https://www.example.com/")
  ],
  reportDelta: { status: "first_run" }
};

const weeklyReport = {
  ...firstReport,
  id: "r2",
  reportPath: "/beta/reports/r2",
  score: 81,
  reportDelta: {
    status: "ready",
    summary: { scoreDelta: 9, fixedIssuesCount: 2, newIssuesCount: 1, persistentIssuesCount: 3 },
    fixedIssues: [{ title: "Broken internal link" }, { title: "Duplicate title" }],
    newIssues: [{ title: "Image missing alt text" }]
  }
};

test("top fixes group a problem across pages and put the worst first", () => {
  const fixes = topFixes(firstReport);
  assert.deepEqual(
    fixes.map((fix) => [fix.title, fix.pageCount]),
    [
      ["Page has no H1", 1],
      ["Missing meta description", 2],
      ["Image missing alt text", 1]
    ]
  );
});

test("first report email leads with the score and what to fix first", () => {
  const email = buildAuditEmail({
    report: firstReport,
    job: { max_pages: 10 },
    unsubscribeUrl: `${ORIGIN}/email/unsubscribe/x`
  });
  assert.equal(email.subject, "Your example.com report is ready: score 72");
  assert.equal(email.tag, "audit-ready");
  assert.match(email.html, /Fix these first/);
  assert.match(email.html, /Page has no H1/);
  assert.match(email.html, /· 2 pages/);
  assert.match(email.html, /https:\/\/seofixkit\.com\/beta\/reports\/r1/);
  assert.match(email.text, /Stop audit emails: https:\/\/seofixkit\.com\/email\/unsubscribe\/x/);
  assert.equal(email.preheader, "First fix: Page has no H1");
});

test("weekly email celebrates fixes, flags new problems and names the next fix", () => {
  const email = buildAuditEmail({ report: weeklyReport, job: { schedule_id: "s1" } });
  assert.equal(email.subject, "example.com: 2 problems fixed, score 81");
  assert.equal(email.tag, "weekly-check");
  assert.match(email.html, /Nice work\. You fixed 2 problems on example\.com\./);
  assert.match(email.html, /Fixed since last check/);
  assert.match(email.html, /Broken internal link/);
  assert.match(email.html, /New since last check/);
  assert.match(email.html, /Fix next/);
  assert.match(email.html, /weekly checks are on for example\.com/);
  assert.match(email.text, /Score: 81 \(\+9 since last check\)/);
});

test("a weekly check with no change still reports in, without alarm", () => {
  const steady = {
    ...weeklyReport,
    reportDelta: {
      status: "ready",
      summary: { scoreDelta: 0, fixedIssuesCount: 0, newIssuesCount: 0, persistentIssuesCount: 4 }
    }
  };
  const email = buildAuditEmail({ report: steady, job: { schedule_id: "s1" } });
  assert.equal(email.subject, "example.com: weekly check done, score 81");
  assert.doesNotMatch(email.html, /Fixed since last check/);
});

test("only emails audits a person is waiting on", () => {
  const owner = { owner_email: OWNER };
  assert.equal(shouldEmailAudit({ ...owner, schedule_id: "s1" }, weeklyReport), true);
  assert.equal(shouldEmailAudit({ ...owner, max_pages: 10 }, weeklyReport), true);
  assert.equal(shouldEmailAudit({ ...owner, max_pages: 1 }, firstReport), true, "first look at a site");
  assert.equal(shouldEmailAudit({ ...owner, max_pages: 1 }, weeklyReport), false, "quick homepage rerun");
  assert.equal(shouldEmailAudit({ ...owner, access_mode: "api", max_pages: 10 }, firstReport), false);
  assert.equal(shouldEmailAudit({ owner_email: "founder", max_pages: 10 }, firstReport), false);
});

test("a finished audit sends one email, and the unsubscribe link stops the next", async () => {
  const db = createTestD1();
  const { env, sent } = emailEnv(db);
  const job = { owner_email: OWNER, schedule_id: "s1", max_pages: 10 };

  const first = await sendAuditCompletedEmail(env, { job, report: weeklyReport, appOrigin: ORIGIN });
  assert.deepEqual(first, { sent: true, tag: "weekly-check" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, OWNER);
  const link = sent[0].text.match(/Stop audit emails: (\S+)/)[1];
  assert.match(link, /^https:\/\/seofixkit\.com\/email\/unsubscribe\/[a-f0-9]{48}$/);

  // Opening the link only asks; a mail scanner's GET must not unsubscribe.
  const page = await app.fetch(new Request(link), env, CTX);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
  const pageHtml = await page.text();
  assert.match(pageHtml, /Stop audit emails\?/);
  assert.match(pageHtml, /ow•+@example\.com/, "the address is masked");
  assert.doesNotMatch(pageHtml, /owner@example\.com/);
  assert.equal((await sendAuditCompletedEmail(env, { job, report: weeklyReport, appOrigin: ORIGIN })).sent, true);

  const confirmed = await app.fetch(new Request(link, { method: "POST" }), env, CTX);
  assert.equal(confirmed.status, 200);
  assert.match(await confirmed.text(), /You’re unsubscribed/);

  const after = await sendAuditCompletedEmail(env, { job, report: weeklyReport, appOrigin: ORIGIN });
  assert.deepEqual(after, { sent: false, reason: "unsubscribed" });
  assert.equal(sent.length, 2);
});

test("an unknown unsubscribe token shows a helpful 404", async () => {
  const db = createTestD1();
  const { env } = emailEnv(db);
  const response = await app.fetch(new Request(`${ORIGIN}/email/unsubscribe/${"a".repeat(48)}`), env, CTX);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /This link doesn’t work/);
});

test("the Alerts page toggle reads and saves the same preference", async () => {
  const db = createTestD1();
  const { env, sent } = emailEnv(db);
  const session = signIn(db);
  const call = (method, body) =>
    app.fetch(
      new Request(`${ORIGIN}/api/account/email-preferences`, {
        method,
        headers: { "content-type": "application/json", cookie: `sfk_beta_session=${session}` },
        ...(body ? { body: JSON.stringify(body) } : {})
      }),
      env,
      CTX
    );

  assert.deepEqual(await (await call("GET")).json(), { ok: true, auditEmails: true });
  const bad = await call("POST", { auditEmails: "nope" });
  assert.equal(bad.status, 400);
  assert.deepEqual(await (await call("POST", { auditEmails: false })).json(), { ok: true, auditEmails: false });
  assert.deepEqual(await (await call("GET")).json(), { ok: true, auditEmails: false });

  const job = { owner_email: OWNER, max_pages: 10 };
  assert.equal((await sendAuditCompletedEmail(env, { job, report: firstReport })).reason, "unsubscribed");
  await call("POST", { auditEmails: true });
  assert.equal((await sendAuditCompletedEmail(env, { job, report: firstReport })).sent, true);
  assert.equal(sent.length, 1);

  const signedOut = await app.fetch(new Request(`${ORIGIN}/api/account/email-preferences`), env, CTX);
  assert.equal(signedOut.status, 401);
});

test("a broken email binding never fails the audit", async () => {
  const db = createTestD1();
  const { env } = emailEnv(db);
  env.EMAIL.send = async () => {
    throw new Error("binding down");
  };
  const realError = console.error;
  console.error = () => {};
  try {
    const result = await sendAuditCompletedEmail(env, {
      job: { owner_email: OWNER, max_pages: 10 },
      report: firstReport
    });
    assert.deepEqual(result, { sent: false, reason: "error" });
  } finally {
    console.error = realError;
  }
});

const DONE_AT = "2026-10-13T10:00:00.000Z";
const manualJob = (overrides = {}) => ({
  owner_email: OWNER,
  owner_session_hash: "",
  owner_invite_id: "",
  access_mode: "self-serve",
  target_url: "https://www.example.com/",
  target_host: "www.example.com",
  max_pages: 10,
  schedule_id: "",
  ...overrides
});

function schedules(db) {
  return db.sqlite
    .prepare("SELECT target_url, max_pages, interval_days, status, next_run_at FROM audit_schedules")
    .all();
}

test("a first audit of a verified site turns weekly checks on at the same depth", async () => {
  const db = createTestD1();
  db.insert("site_claims", {
    id: "c1",
    owner_email: OWNER,
    host: "example.com",
    verification_token: "t",
    status: "verified",
    created_at: DONE_AT,
    updated_at: DONE_AT,
    verified_at: DONE_AT
  });
  const schedule = await autoEnableWeeklyCheck({ WAITLIST_DB: db }, manualJob(), DONE_AT);
  assert.equal(schedule.next_run_at, "2026-10-20T10:00:00.000Z");
  assert.deepEqual(
    schedules(db).map((row) => ({ ...row })),
    [
      {
        target_url: "https://www.example.com/",
        max_pages: 10,
        interval_days: 7,
        status: "active",
        next_run_at: "2026-10-20T10:00:00.000Z"
      }
    ]
  );

  // A second audit (another page, or a rerun) leaves the schedule alone.
  assert.equal(
    await autoEnableWeeklyCheck(
      { WAITLIST_DB: db },
      manualJob({ target_url: "https://www.example.com/pricing" }),
      DONE_AT
    ),
    null
  );
  assert.equal(schedules(db).length, 1);
});

test("an unverified site gets the one-page weekly check it could already run", async () => {
  const db = createTestD1();
  const schedule = await autoEnableWeeklyCheck({ WAITLIST_DB: db }, manualJob({ max_pages: 1 }), DONE_AT);
  assert.equal(schedule.max_pages, 1);
  assert.equal(schedules(db)[0].max_pages, 1);
});

test("weekly checks never come back after the owner paused them, and API audits never start them", async () => {
  const db = createTestD1();
  db.insert("audit_schedules", {
    id: "s-old",
    owner_email: OWNER,
    access_mode: "self-serve",
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status: "paused",
    next_run_at: DONE_AT,
    created_at: DONE_AT,
    updated_at: DONE_AT,
    paused_at: DONE_AT
  });
  assert.equal(await autoEnableWeeklyCheck({ WAITLIST_DB: db }, manualJob(), DONE_AT), null);
  assert.equal(
    await autoEnableWeeklyCheck({ WAITLIST_DB: createTestD1() }, manualJob({ access_mode: "api" }), DONE_AT),
    null
  );
  assert.equal(
    await autoEnableWeeklyCheck({ WAITLIST_DB: createTestD1() }, manualJob({ schedule_id: "s1" }), DONE_AT),
    null
  );
});

test("the report-ready email says weekly checks are now on and when the next one runs", () => {
  const email = buildAuditEmail({
    report: firstReport,
    job: { max_pages: 10 },
    autoSchedule: { next_run_at: "2026-10-20T10:00:00.000Z" }
  });
  assert.match(email.html, /Weekly checks are now on\. We’ll check example\.com again on Tuesday, October 20/);
  assert.match(email.html, /\/beta\/sites/);
  assert.match(email.text, /Change this: https:\/\/seofixkit\.com\/beta\/sites/);
  assert.doesNotMatch(buildAuditEmail({ report: firstReport, job: {} }).html, /Weekly checks are now on/);
});
