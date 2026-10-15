import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { withScoreGains } from "../shared/audit-engine.js";
import { buildFixKitFiles, fixKitManifest, groupedFixes } from "../shared/fix-kit-files.js";
import { crc32, zipFiles } from "../shared/zip.js";
import { app } from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const DAY = 86_400_000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const ctx = { waitUntil() {}, passThroughOnException() {} };

function fixture() {
  const report = JSON.parse(fs.readFileSync(new URL("../e2e/fixtures/report.json", import.meta.url), "utf8"));
  report.repairPlan = withScoreGains(report.repairPlan, report.findings);
  return report;
}

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

function seed(db, report) {
  db.insert("audit_reports", {
    id: "acme-report-0001",
    url: report.url,
    origin: report.origin,
    score: report.score,
    summary_json: "{}",
    report_json: JSON.stringify(report),
    created_at: iso(1),
    updated_at: iso(1),
    owner_email: OWNER,
    owner_session_hash: "s",
    target_host: new URL(report.url).hostname,
    expires_at: iso(-29)
  });
}

const call = (db, path, session) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, { headers: session ? { cookie: `sfk_beta_session=${session}` } : {} }),
    { WAITLIST_DB: db },
    ctx
  );

test("zip writer produces a valid archive with correct checksums", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = zipFiles([{ path: "a/b.txt", content: "hello" }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 22 + 10, true), 1);
});

test("fix kit groups each problem once and makes the site files", () => {
  const report = fixture();
  const groups = groupedFixes(report);
  assert.deepEqual(
    groups.map((group) => [group.title, group.pages.length, group.scoreGain]),
    [
      ["Missing meta description", 2, 16],
      ["Missing H1", 1, 12]
    ]
  );
  const files = buildFixKitFiles(report);
  const paths = files.map((file) => file.path);
  assert.equal(paths[0], "README.md");
  for (const path of ["FIXES.md", "fixes.csv", "AI-PROMPT.md", "sitemap.xml", "code/home.html"]) {
    assert.ok(paths.includes(path), path);
  }
  const csv = files.find((file) => file.path === "fixes.csv").content;
  assert.match(csv.split("\n")[1], /^1,Critical,Missing meta description,16,/);
  assert.match(
    files.find((file) => file.path === "sitemap.xml").content,
    /<loc>https:\/\/acme-widgets\.example\/<\/loc>/
  );
  assert.match(files.find((file) => file.path === "code/home.html").content, /<meta name="description"/);
  const manifest = fixKitManifest(report);
  assert.equal(manifest.problems, 2);
  assert.equal(manifest.codeFiles, 3);
  assert.ok(!manifest.files.some((path) => path.startsWith("code/")));
});

test("robots additions unblock blocked answer bots and add the sitemap", () => {
  const report = fixture();
  report.crawlerAccess = {
    sitemaps: [],
    blockedSearch: [],
    blockedAnswerBots: [{ agent: "PerplexityBot", product: "Perplexity", rule: "Disallow: /" }]
  };
  const robots = buildFixKitFiles(report).find((file) => file.path === "robots-additions.txt");
  assert.match(robots.content, /User-agent: PerplexityBot\nAllow: \//);
  assert.match(robots.content, /Sitemap: https:\/\/acme-widgets\.example\/sitemap\.xml/);
});

test("fix files are locked until the Fix Pack is paid, then download as a zip", async () => {
  const db = createTestD1();
  seed(db, fixture());
  const session = signIn(db);

  assert.equal((await call(db, "/api/reports/acme-report-0001/fix-kit")).status, 401);

  const locked = await (await call(db, "/api/reports/acme-report-0001/fix-kit", session)).json();
  assert.equal(locked.unlocked, false);
  assert.equal(locked.manifest.problems, 2);
  const blocked = await call(db, "/api/reports/acme-report-0001/fix-kit.zip", session);
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).code, "FIX_KIT_LOCKED");

  db.insert("fix_requests", {
    id: "fr-1",
    report_id: "acme-report-0001",
    owner_email: OWNER,
    target_url: "https://acme-widgets.example/",
    target_host: "acme-widgets.example",
    status: "paid",
    created_at: iso(0),
    updated_at: iso(0)
  });
  assert.equal((await (await call(db, "/api/reports/acme-report-0001/fix-kit", session)).json()).unlocked, true);
  const zip = await call(db, "/api/reports/acme-report-0001/fix-kit.zip", session);
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.match(zip.headers.get("content-disposition"), /seo-fix-kit-acme-widgets-example\.zip/);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.match(new TextDecoder().decode(bytes.slice(30, 80)), /^seo-fix-kit-acme-widgets-example\/README\.md/);

  const other = signIn(db, "someone@example.com");
  assert.equal((await call(db, "/api/reports/acme-report-0001/fix-kit.zip", other)).status, 404);

  await db.prepare("UPDATE fix_requests SET status = 'refunded' WHERE id = ?").bind("fr-1").run();
  assert.equal((await call(db, "/api/reports/acme-report-0001/fix-kit.zip", session)).status, 402);
});
