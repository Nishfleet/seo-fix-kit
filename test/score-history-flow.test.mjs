// Score history: every saved report adds a small row (page, score, problem
// count, date) that outlives the 30-day report, so the Overview's progress
// card can show months of change. Real Hono app, real SQLite D1.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { cleanupExpiredRows } from "../worker/lib/db.js";
import { saveAuditReportWithContext } from "../worker/lib/report-data.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

function signIn(db) {
  const token = randomBytes(32).toString("hex");
  db.insert("beta_sessions", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    owner_email: OWNER,
    created_at: iso(0),
    expires_at: iso(-1),
    last_seen_at: iso(0),
    access_mode: "self-serve"
  });
  return token;
}

const history = (db, reportId, score, findings, daysAgo) =>
  db.insert("score_history", {
    owner_email: OWNER,
    report_id: reportId,
    url: "https://example.com/",
    target_host: "example.com",
    score,
    total_findings: findings,
    created_at: iso(daysAgo)
  });

test("saving a report adds one score history row", async () => {
  const db = createTestD1();
  const report = {
    url: "https://example.com/",
    origin: "https://example.com",
    score: 77,
    summary: { pagesScanned: 3, totalFindings: 5 },
    findings: [],
    pages: []
  };
  const access = { ownerEmail: OWNER, sessionHash: "s", accessMode: "self-serve" };
  const saved = await saveAuditReportWithContext(report, { WAITLIST_DB: db }, access, ORIGIN);
  const rows = db.sqlite.prepare("SELECT report_id, score, total_findings, target_host FROM score_history").all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [{ report_id: saved.id, score: 77, total_findings: 5, target_host: "example.com" }]
  );
});

test("the progress card spans months, linking only to reports still kept", async () => {
  const db = createTestD1();
  const session = signIn(db);
  history(db, "old-1", 40, 20, 120);
  history(db, "old-2", 55, 14, 60);
  history(db, "new-1", 81, 6, 2);
  db.insert("audit_reports", {
    id: "new-1",
    url: "https://example.com/",
    origin: "https://example.com",
    score: 81,
    summary_json: JSON.stringify({ totalFindings: 6 }),
    report_json: "{}",
    created_at: iso(2),
    updated_at: iso(2),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: "example.com",
    expires_at: iso(-28)
  });

  const response = await app.fetch(
    new Request(`${ORIGIN}/api/account/summary`, { headers: { cookie: `sfk_beta_session=${session}` } }),
    { WAITLIST_DB: db },
    { waitUntil() {}, passThroughOnException() {} }
  );
  const [site] = (await response.json()).progress;
  assert.equal(site.checks, 3);
  assert.equal(site.scoreChange, 41);
  assert.equal(site.issuesChange, -14);
  assert.equal(site.reportPath, "/beta/reports/new-1");
  assert.deepEqual(
    site.points.map((point) => point.reportPath),
    ["", "", "/beta/reports/new-1"]
  );
});

test("the cron drops score history older than 12 months", async () => {
  const db = createTestD1();
  history(db, "ancient", 30, 30, 400);
  history(db, "recent", 70, 8, 200);
  await cleanupExpiredRows({ WAITLIST_DB: db });
  const ids = db.sqlite
    .prepare("SELECT report_id FROM score_history")
    .all()
    .map((row) => row.report_id);
  assert.deepEqual(ids, ["recent"]);
});
