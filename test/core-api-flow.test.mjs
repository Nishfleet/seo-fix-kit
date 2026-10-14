import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const OTHER = "rival@example.org";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function isoFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;

function fakeQueue() {
  const messages = [];
  return {
    messages,
    async send(message) {
      messages.push(structuredClone(message));
    }
  };
}

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, String(value));
    },
    async get(key) {
      if (!objects.has(key)) return null;
      const body = objects.get(key);
      return { text: async () => body, json: async () => JSON.parse(body) };
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    }
  };
}

function fakeEmail() {
  const sent = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    }
  };
}

function fakeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
    passThroughOnException() {}
  };
}

function createWorld() {
  const db = createTestD1();
  const queue = fakeQueue();
  const reports = fakeR2();
  const email = fakeEmail();
  const env = {
    WAITLIST_DB: db,
    AUDIT_QUEUE: queue,
    REPORTS: reports,
    EMAIL: email,
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
    ADMIN_EXPORT_TOKEN: "admin-token-not-used-here"
  };
  return { db, queue, reports, email, env };
}

async function call(world, path, { method = "GET", body, session, bearer, headers = {} } = {}) {
  const init = { method, headers: { "cf-connecting-ip": "203.0.113.7", ...headers } };
  if (session) init.headers.cookie = `sfk_beta_session=${session}`;
  if (bearer) init.headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const ctx = fakeCtx();
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, init), world.env, ctx);
  await Promise.all(ctx.pending);
  return response;
}

function signIn(world, ownerEmail, { accessMode = "self-serve" } = {}) {
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  world.db.insert("beta_sessions", {
    token_hash: sha256(token),
    owner_email: ownerEmail,
    created_at: now,
    expires_at: isoFromNow(DAY),
    last_seen_at: now,
    access_mode: accessMode
  });
  return token;
}

function claimSite(world, ownerEmail, host, { status = "verified" } = {}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  world.db.insert("site_claims", {
    id,
    owner_email: ownerEmail,
    host,
    verification_token: `sfk-secret-claim-token-${randomBytes(8).toString("hex")}`,
    status,
    verification_method: status === "verified" ? "dns" : null,
    created_at: now,
    updated_at: now,
    verified_at: status === "verified" ? now : null
  });
  return id;
}

function reportBody(id, url) {
  return {
    id,
    url,
    origin: new URL(url).origin,
    score: 72,
    summary: { pagesScanned: 1, maxPages: 1, critical: 1, warnings: 0, notices: 0, totalFindings: 1 },
    reportPath: `/beta/reports/${id}`,
    findings: [
      {
        id: "missing-title-home",
        severity: "critical",
        title: "Missing title on home",
        pageUrl: url,
        pageLabel: "home",
        evidence: "The rendered page has no <title> element.",
        fix: "Add a descriptive, unique title.",
        confidence: "verified",
        source: "rendered"
      }
    ],
    repairPlan: [],
    repairBrief: "# Repair brief\n\n- Add a title on home.\n",
    retention: { expiresAt: isoFromNow(30 * DAY), days: 30 }
  };
}

function seedReport(
  world,
  { id, ownerEmail, url = "https://shop.example.com/", expiresAt = isoFromNow(30 * DAY), inR2 = true }
) {
  const report = reportBody(id, url);
  const json = JSON.stringify(report);
  const key = `reports/${id}.json`;
  if (inR2) world.reports.objects.set(key, json);
  const now = new Date().toISOString();
  world.db.insert("audit_reports", {
    id,
    url,
    origin: new URL(url).origin,
    score: report.score,
    summary_json: JSON.stringify(report.summary),
    report_json: inR2 ? `r2:${key}` : json,
    created_at: now,
    updated_at: now,
    owner_email: ownerEmail,
    owner_session_hash: "seeded",
    target_host: new URL(url).hostname,
    expires_at: expiresAt
  });
  return report;
}

function seedCompletedJob(world, { ownerEmail, reportId, url = "https://shop.example.com/" }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  world.db.insert("audit_jobs", {
    id,
    owner_email: ownerEmail,
    access_mode: "self-serve",
    target_url: url,
    target_host: new URL(url).hostname,
    max_pages: 10,
    status: "completed",
    report_id: reportId,
    created_at: now,
    updated_at: now,
    started_at: now,
    completed_at: now,
    expires_at: isoFromNow(30 * DAY)
  });
  return id;
}

async function createApiKey(world, session, label = "CI key") {
  const response = await call(world, "/api/developer/tokens", { method: "POST", session, body: { label } });
  assert.equal(response.status, 200);
  return response.json();
}

test("GET /api/health reports liveness and which bindings are present", async () => {
  const world = createWorld();
  const response = await call(world, "/api/health");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "seo-fix-kit");
  assert.equal(body.waitlistDb, true);
  assert.equal(body.browserRun, false);
  assert.equal(body.emailNotifications, true);
  assert.equal(typeof body.version, "string");
});

test("GET /api/deep-health checks the real schema without exposing table contents", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "shop.example.com");
  seedReport(world, { id: "shop-example-com-deep-health-0001", ownerEmail: OWNER });
  const { tokenSecret } = await createApiKey(world, session);

  const response = await call(world, "/api/deep-health");
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const raw = await response.text();
  const body = JSON.parse(raw);
  assert.equal(body.ok, false);
  assert.equal(body.status, "degraded");
  assert.equal(body.bindings.waitlistDb, true);
  assert.equal(body.bindings.auditQueue, true);
  assert.equal(body.bindings.reportStorage, true);
  assert.equal(body.bindings.browserRun, false);
  assert.equal(body.schema.ok, true);
  assert.equal(body.schema.criticalOk, true);
  assert.deepEqual(body.schema.failed, []);
  assert.ok(body.schema.checks.length > 0);
  assert.equal(body.capabilities.developerApi, true);

  for (const secret of [
    OWNER,
    "shop.example.com",
    "shop-example-com-deep-health-0001",
    tokenSecret,
    sha256(tokenSecret),
    "sfk-secret-claim-token"
  ]) {
    assert.ok(!raw.includes(secret), `deep-health leaked ${secret}`);
  }

  const head = await call(world, "/api/deep-health", { method: "HEAD" });
  assert.equal(head.status, 503);
  assert.equal(await head.text(), "");

  const post = await call(world, "/api/deep-health", { method: "POST" });
  assert.equal(post.status, 405);
});

test("a verified owner queues an audit, it is persisted and enqueued, and the owner can poll it", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "shop.example.com");

  const response = await call(world, "/api/audit", {
    method: "POST",
    session,
    body: { url: "shop.example.com", maxPages: 10 }
  });
  assert.equal(response.status, 202);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "queued");
  assert.equal(body.job.status, "queued");
  assert.equal(body.job.targetUrl, "https://shop.example.com/");
  assert.equal(body.job.maxPages, 10);
  assert.equal(body.statusUrl, `/api/audit/jobs/${body.jobId}`);

  const rows = world.db.rows("SELECT * FROM audit_jobs");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, body.jobId);
  assert.equal(rows[0].owner_email, OWNER);
  assert.equal(rows[0].target_host, "shop.example.com");
  assert.equal(rows[0].status, "queued");
  assert.equal(rows[0].max_pages, 10);
  assert.ok(rows[0].expires_at > new Date().toISOString());

  assert.deepEqual(world.queue.messages, [{ kind: "audit-job", jobId: body.jobId, appOrigin: ORIGIN }]);

  const poll = await call(world, body.statusUrl, { session });
  assert.equal(poll.status, 200);
  const polled = await poll.json();
  assert.equal(polled.job.id, body.jobId);
  assert.equal(polled.job.status, "queued");

  world.db.rows(
    "UPDATE audit_jobs SET status = 'running', started_at = ? WHERE id = ? RETURNING id",
    new Date().toISOString(),
    body.jobId
  );
  const running = await (await call(world, body.statusUrl, { session })).json();
  assert.equal(running.job.status, "running");

  const again = await call(world, "/api/audit", {
    method: "POST",
    session,
    body: { url: "https://shop.example.com/", maxPages: 10 }
  });
  assert.equal(again.status, 202);
  const againBody = await again.json();
  assert.equal(againBody.deduped, true);
  assert.equal(againBody.jobId, body.jobId);
  assert.equal(world.db.rows("SELECT id FROM audit_jobs").length, 1);
  assert.equal(world.queue.messages.length, 1);
});

test("audit job polling is private to the job's owner and requires a session", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const rivalSession = signIn(world, OTHER);
  claimSite(world, OWNER, "shop.example.com");
  const created = await (
    await call(world, "/api/audit", { method: "POST", session, body: { url: "https://shop.example.com/" } })
  ).json();

  const rival = await call(world, `/api/audit/jobs/${created.jobId}`, { session: rivalSession });
  assert.equal(rival.status, 404);
  assert.equal((await rival.json()).job, undefined);

  const anonymous = await call(world, `/api/audit/jobs/${created.jobId}`);
  assert.equal(anonymous.status, 401);

  const unknown = await call(world, `/api/audit/jobs/${crypto.randomUUID()}`, { session });
  assert.equal(unknown.status, 404);
});

test("queueing an audit requires a signed-in session", async () => {
  const world = createWorld();
  const response = await call(world, "/api/audit", { method: "POST", body: { url: "https://shop.example.com/" } });
  assert.equal(response.status, 401);
  assert.equal(world.db.rows("SELECT id FROM audit_jobs").length, 0);
  assert.equal(world.queue.messages.length, 0);
});

test("a non-Lite audit of an unverified host is refused with verification instructions", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "pending.example.com", { status: "pending" });
  claimSite(world, OTHER, "theirs.example.com");

  for (const url of ["https://unclaimed.example.com/", "https://pending.example.com/", "https://theirs.example.com/"]) {
    const response = await call(world, "/api/audit", { method: "POST", session, body: { url, maxPages: 10 } });
    assert.equal(response.status, 403, url);
    const body = await response.json();
    assert.equal(body.code, "SITE_VERIFICATION_REQUIRED");
    assert.match(body.error, /Verify .+ to run a full audit/);
    assert.equal(body.site.filePath, "/.well-known/seofixkit.txt");
  }

  const withExtras = await call(world, "/api/audit", {
    method: "POST",
    session,
    body: { url: "https://unclaimed.example.com/", maxPages: 1, competitorUrls: ["https://competitor.example.net/"] }
  });
  assert.equal(withExtras.status, 403);

  assert.equal(world.db.rows("SELECT id FROM audit_jobs").length, 0);
  assert.equal(world.queue.messages.length, 0);
});

test("a verified apex claim also authorizes the www host", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "shop.example.com");
  const response = await call(world, "/api/audit", {
    method: "POST",
    session,
    body: { url: "https://www.shop.example.com/" }
  });
  assert.equal(response.status, 202);
  assert.equal(world.db.rows("SELECT target_host FROM audit_jobs")[0].target_host, "www.shop.example.com");
});

test("a homepage-only 1-page Lite check runs without verification and is capped at 3 per day", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);

  const hosts = ["lite-one.example.com", "lite-two.example.com", "lite-three.example.com"];
  for (const host of hosts) {
    const response = await call(world, "/api/audit", {
      method: "POST",
      session,
      body: { url: `https://${host}/`, maxPages: 1 }
    });
    assert.equal(response.status, 202, host);
    const body = await response.json();
    assert.equal(body.job.maxPages, 1);
  }
  const jobs = world.db.rows("SELECT target_host, max_pages, status FROM audit_jobs ORDER BY target_host");
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((job) => job.max_pages === 1 && job.status === "queued"));
  assert.equal(world.queue.messages.length, 3);

  const secondSession = signIn(world, OWNER);
  const fourth = await call(world, "/api/audit", {
    method: "POST",
    session: secondSession,
    body: { url: "https://lite-four.example.com/", maxPages: 1 }
  });
  assert.equal(fourth.status, 429);
  const fourthBody = await fourth.json();
  assert.match(fourthBody.error, /Daily Lite check limit reached/);
  assert.ok(Date.parse(fourthBody.resetAt) > Date.now());
  assert.equal(world.db.rows("SELECT id FROM audit_jobs").length, 3);
  assert.equal(world.queue.messages.length, 3);

  const rivalSession = signIn(world, OTHER);
  const rival = await call(world, "/api/audit", {
    method: "POST",
    session: rivalSession,
    body: { url: "https://lite-four.example.com/", maxPages: 1 }
  });
  assert.equal(rival.status, 202);
});

test("GET /api/reports/:id returns the owner's saved report from R2 and inline storage", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  seedReport(world, { id: "shop-example-com-r2-report-0001", ownerEmail: OWNER });
  seedReport(world, { id: "shop-example-com-inline-report-02", ownerEmail: OWNER, inR2: false });

  for (const id of ["shop-example-com-r2-report-0001", "shop-example-com-inline-report-02"]) {
    const response = await call(world, `/api/reports/${id}`, { session });
    assert.equal(response.status, 200, id);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const report = await response.json();
    assert.equal(report.id, id);
    assert.equal(report.url, "https://shop.example.com/");
    assert.equal(report.score, 72);
    assert.equal(report.reportUrl, `${ORIGIN}/beta/reports/${id}`);
    assert.equal(report.findings[0].id, "missing-title-home");
    assert.equal(report.remediationBrief.reportId, id);
  }
});

test("another owner cannot read a saved report, and anonymous requests are rejected", async () => {
  const world = createWorld();
  signIn(world, OWNER);
  const rivalSession = signIn(world, OTHER);
  const id = "shop-example-com-private-report-1";
  seedReport(world, { id, ownerEmail: OWNER });

  for (const path of [
    `/api/reports/${id}`,
    `/api/reports/${id}/remediation-brief.json`,
    `/api/reports/${id}/brief.md`
  ]) {
    const rival = await call(world, path, { session: rivalSession });
    assert.ok([403, 404].includes(rival.status), `${path} -> ${rival.status}`);
    const text = await rival.text();
    assert.ok(!text.includes("Missing title on home"), `${path} leaked report content`);

    const anonymous = await call(world, path);
    assert.equal(anonymous.status, 401, path);
  }

  const missing = await call(world, "/api/reports/no-such-report-exists-here", { session: rivalSession });
  assert.equal(missing.status, 404);
});

test("an expired report is gone: 404 for the owner and its rows and blob are deleted", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const id = "shop-example-com-expired-report-1";
  seedReport(world, { id, ownerEmail: OWNER, expiresAt: isoFromNow(-60_000) });
  seedCompletedJob(world, { ownerEmail: OWNER, reportId: id });

  const response = await call(world, `/api/reports/${id}`, { session });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "This report expired. Run a new audit to get a fresh report.");
  assert.equal(world.db.rows("SELECT id FROM audit_reports WHERE id = ?", id).length, 0);
  assert.equal(world.db.rows("SELECT id FROM audit_jobs WHERE report_id = ?", id).length, 0);
  assert.equal(world.reports.objects.has(`reports/${id}.json`), false);

  const brief = await call(world, `/api/reports/${id}/remediation-brief.json`, { session });
  assert.equal(brief.status, 404);
});

test("GET /api/reports/:id/remediation-brief.json returns a brief built from the stored report", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const id = "shop-example-com-brief-report-01";
  seedReport(world, { id, ownerEmail: OWNER });

  const response = await call(world, `/api/reports/${id}/remediation-brief.json`, { session });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const brief = await response.json();
  assert.equal(brief.reportId, id);
  assert.equal(brief.url, "https://shop.example.com/");
  assert.equal(brief.host, "shop.example.com");
  assert.equal(brief.mode, "owner_review_required");
  assert.equal(brief.summary.score, 72);
  assert.equal(brief.summary.critical, 1);
  assert.equal(brief.summary.priorityRepairs, 1);
  assert.equal(brief.priorityQueue.length, 1);
  assert.match(JSON.stringify(brief.priorityQueue[0]), /Missing title on home/);
  assert.equal(brief.support.fixPackEligible, true);

  const markdown = await call(world, `/api/reports/${id}/brief.md`, { session });
  assert.equal(markdown.status, 200);
  assert.match(markdown.headers.get("content-type") || "", /text\/markdown/);
  assert.match(await markdown.text(), /Add a title on home/);
});

test("an API key created from a session drives /v1/projects and /v1/audits", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "shop.example.com");

  const created = await createApiKey(world, session, "Deploy bot");
  assert.equal(created.ok, true);
  assert.match(created.tokenSecret, /\S{24,}/);
  assert.equal(created.token.label, "Deploy bot");
  assert.equal(created.token.status, "active");
  const stored = world.db.rows("SELECT * FROM api_tokens");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].owner_email, OWNER);
  assert.equal(stored[0].token_hash, sha256(created.tokenSecret));
  assert.ok(!JSON.stringify(stored).includes(created.tokenSecret));
  const summary = await (await call(world, "/api/developer", { session })).json();
  assert.equal(summary.tokens.length, 1);
  assert.ok(!JSON.stringify(summary).includes(created.tokenSecret));

  const bearer = created.tokenSecret;

  const projects = await call(world, "/v1/projects", { bearer });
  assert.equal(projects.status, 200);
  const projectsBody = await projects.json();
  assert.deepEqual(
    projectsBody.projects.map((project) => [project.host, project.status]),
    [["shop.example.com", "verified"]]
  );

  const newProject = await call(world, "/v1/projects", { method: "POST", bearer, body: { host: "blog.example.com" } });
  assert.equal(newProject.status, 201);
  const newProjectBody = await newProject.json();
  assert.equal(newProjectBody.project.host, "blog.example.com");
  assert.equal(newProjectBody.project.status, "pending");
  assert.match(newProjectBody.project.verification.dnsValue, /^seofixkit-site-verification=sfk-/);
  const claimRows = world.db.rows("SELECT host, status FROM site_claims WHERE owner_email = ? ORDER BY host", OWNER);
  assert.deepEqual(claimRows, [
    { host: "blog.example.com", status: "pending" },
    { host: "shop.example.com", status: "verified" }
  ]);

  const audit = await call(world, "/v1/audits", {
    method: "POST",
    bearer,
    body: { url: "https://shop.example.com/", max_pages: 5 }
  });
  assert.equal(audit.status, 202);
  const auditBody = await audit.json();
  assert.equal(auditBody.audit.status, "queued");
  assert.equal(auditBody.audit.url, "https://shop.example.com/");
  assert.equal(auditBody.audit.max_pages, 5);
  assert.equal(auditBody.status_url, `/v1/audits/${auditBody.audit_id}`);
  const jobRows = world.db.rows("SELECT id, owner_email, access_mode, status FROM audit_jobs");
  assert.deepEqual(jobRows, [{ id: auditBody.audit_id, owner_email: OWNER, access_mode: "api", status: "queued" }]);
  assert.deepEqual(world.queue.messages, [{ kind: "audit-job", jobId: auditBody.audit_id, appOrigin: ORIGIN }]);

  const unverified = await call(world, "/v1/audits", {
    method: "POST",
    bearer,
    body: { url: "https://blog.example.com/" }
  });
  assert.equal(unverified.status, 403);
  assert.equal((await unverified.json()).code, "SITE_VERIFICATION_REQUIRED");
  assert.equal(world.queue.messages.length, 1);

  const list = await (await call(world, "/v1/audits", { bearer })).json();
  assert.deepEqual(
    list.audits.map((item) => item.audit_id),
    [auditBody.audit_id]
  );
  const single = await call(world, `/v1/audits/${auditBody.audit_id}`, { bearer });
  assert.equal(single.status, 200);
  assert.equal((await single.json()).audit.status, "queued");

  const pendingReport = await call(world, `/v1/audits/${auditBody.audit_id}/report`, { bearer });
  assert.equal(pendingReport.status, 409);

  assert.ok(world.db.rows("SELECT last_used_at FROM api_tokens")[0].last_used_at);
});

test("the developer API reads completed audit reports for the key's owner", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const { tokenSecret: bearer } = await createApiKey(world, session);
  const reportId = "shop-example-com-api-report-0001";
  seedReport(world, { id: reportId, ownerEmail: OWNER });
  const auditId = seedCompletedJob(world, { ownerEmail: OWNER, reportId });

  const audit = await (await call(world, `/v1/audits/${auditId}`, { bearer })).json();
  assert.equal(audit.audit.status, "complete");
  assert.equal(audit.audit.report_id, reportId);

  const report = await call(world, `/v1/audits/${auditId}/report`, { bearer });
  assert.equal(report.status, 200);
  const reportBodyJson = await report.json();
  assert.equal(reportBodyJson.report.id, reportId);
  assert.equal(reportBodyJson.report.score, 72);

  const issues = await call(world, `/v1/audits/${auditId}/issues`, { bearer });
  assert.equal(issues.status, 200);
  const issuesBody = await issues.json();
  assert.equal(issuesBody.total, 1);
  assert.equal(issuesBody.reportId, reportId);
});

test("requests without a valid, active API key are rejected", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  claimSite(world, OWNER, "shop.example.com");
  const created = await createApiKey(world, session);

  for (const [path, method] of [
    ["/v1/projects", "GET"],
    ["/v1/audits", "GET"],
    ["/v1/audits", "POST"]
  ]) {
    const missing = await call(world, path, {
      method,
      body: method === "POST" ? { url: "https://shop.example.com/" } : undefined
    });
    assert.equal(missing.status, 401, `${method} ${path} without key`);
    assert.equal((await missing.json()).error, "API key required. Send it as Authorization: Bearer YOUR_API_KEY.");

    const wrong = await call(world, path, { method, bearer: `${created.tokenSecret}x` });
    assert.equal(wrong.status, 401, `${method} ${path} with wrong key`);

    const cookieOnly = await call(world, path, { method, session });
    assert.equal(cookieOnly.status, 401, `${method} ${path} with session cookie`);
  }

  const ok = await call(world, "/v1/projects", { bearer: created.tokenSecret });
  assert.equal(ok.status, 200);
  const revoke = await call(world, `/api/developer/tokens/${created.token.id}`, { method: "DELETE", session });
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).status, "revoked");
  assert.equal(world.db.rows("SELECT status FROM api_tokens")[0].status, "revoked");

  const afterRevoke = await call(world, "/v1/audits", {
    method: "POST",
    bearer: created.tokenSecret,
    body: { url: "https://shop.example.com/" }
  });
  assert.equal(afterRevoke.status, 401);
  assert.equal(
    (await afterRevoke.json()).error,
    "API key is invalid or revoked. Create a new key in your SEO Fix Kit account."
  );
  assert.equal(world.db.rows("SELECT id FROM audit_jobs").length, 0);
  assert.equal(world.queue.messages.length, 0);

  const summary = await (await call(world, "/api/developer", { session })).json();
  assert.equal(summary.tokens.length, 0);
});

test("one owner's API key cannot read or change another owner's data", async () => {
  const world = createWorld();
  const ownerSession = signIn(world, OWNER);
  const rivalSession = signIn(world, OTHER);
  claimSite(world, OWNER, "shop.example.com");
  const ownerKey = await createApiKey(world, ownerSession);
  const rivalKey = await createApiKey(world, rivalSession);

  const reportId = "shop-example-com-owner-only-0001";
  seedReport(world, { id: reportId, ownerEmail: OWNER });
  const completedId = seedCompletedJob(world, { ownerEmail: OWNER, reportId });
  const queued = await (
    await call(world, "/v1/audits", {
      method: "POST",
      bearer: ownerKey.tokenSecret,
      body: { url: "https://shop.example.com/" }
    })
  ).json();

  const rival = rivalKey.tokenSecret;
  assert.deepEqual((await (await call(world, "/v1/projects", { bearer: rival })).json()).projects, []);
  assert.deepEqual((await (await call(world, "/v1/audits", { bearer: rival })).json()).audits, []);
  for (const path of [
    `/v1/audits/${queued.audit_id}`,
    `/v1/audits/${completedId}`,
    `/v1/audits/${completedId}/report`,
    `/v1/audits/${completedId}/issues`,
    `/v1/audits/${reportId}/report`
  ]) {
    const response = await call(world, path, { bearer: rival });
    assert.ok([403, 404, 409].includes(response.status), `${path} -> ${response.status}`);
    const text = await response.text();
    assert.ok(!text.includes("Missing title on home"), `${path} leaked report content`);
    assert.ok(!text.includes(OWNER), `${path} leaked owner email`);
  }

  const audit = await call(world, "/v1/audits", {
    method: "POST",
    bearer: rival,
    body: { url: "https://shop.example.com/" }
  });
  assert.equal(audit.status, 403);

  const del = await call(world, `/v1/audits/${completedId}`, { method: "DELETE", bearer: rival });
  assert.ok([403, 404].includes(del.status), `DELETE -> ${del.status}`);
  assert.equal(world.db.rows("SELECT id FROM audit_jobs WHERE id = ?", completedId).length, 1);
  assert.equal(world.db.rows("SELECT id FROM audit_reports WHERE id = ?", reportId).length, 1);

  const revoke = await call(world, `/api/developer/tokens/${ownerKey.token.id}`, {
    method: "DELETE",
    session: rivalSession
  });
  assert.equal(revoke.status, 404);
  assert.equal(world.db.rows("SELECT status FROM api_tokens WHERE id = ?", ownerKey.token.id)[0].status, "active");
  assert.equal((await call(world, "/v1/projects", { bearer: ownerKey.tokenSecret })).status, 200);
});

test("GET /api/reports pages through every unexpired report of the signed-in owner", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const ids = Array.from({ length: 30 }, (_, index) => `shop-example-com-list-${String(index).padStart(3, "0")}`);
  for (const id of ids) seedReport(world, { id, ownerEmail: OWNER });
  seedReport(world, { id: "shop-example-com-list-expired", ownerEmail: OWNER, expiresAt: isoFromNow(-60_000) });
  seedReport(world, { id: "rival-example-org-list-001", ownerEmail: OTHER, url: "https://rival.example.org/" });

  const first = await call(world, "/api/reports", { session });
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control") || "", /no-store/);
  const page1 = await first.json();
  assert.equal(page1.reports.length, 25);
  assert.ok(page1.nextCursor, "a second page is offered");

  const page2 = await (
    await call(world, `/api/reports?cursor=${encodeURIComponent(page1.nextCursor)}`, { session })
  ).json();
  assert.equal(page2.reports.length, 5);
  assert.equal(page2.nextCursor, "", "the last page offers no cursor");

  const listed = [...page1.reports, ...page2.reports].map((report) => report.id);
  assert.deepEqual([...listed].sort(), [...ids].sort(), "every live report appears exactly once");
  assert.equal(page1.reports[0].reportPath, `/beta/reports/${page1.reports[0].id}`);

  assert.equal((await call(world, "/api/reports")).status, 401);
});

test("GET /api/account/summary returns only the signed-in owner's data", async () => {
  const world = createWorld();
  const session = signIn(world, OWNER);
  const rivalSession = signIn(world, OTHER);
  claimSite(world, OWNER, "shop.example.com");
  claimSite(world, OWNER, "blog.example.com", { status: "pending" });
  claimSite(world, OTHER, "rival.example.org");
  seedReport(world, { id: "shop-example-com-account-rep-001", ownerEmail: OWNER });
  seedReport(world, { id: "shop-example-com-account-old-001", ownerEmail: OWNER, expiresAt: isoFromNow(-60_000) });
  seedReport(world, { id: "rival-example-org-account-r-001", ownerEmail: OTHER, url: "https://rival.example.org/" });
  const queued = await (
    await call(world, "/api/audit", { method: "POST", session, body: { url: "https://shop.example.com/" } })
  ).json();

  const response = await call(world, "/api/account/summary", { session });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.owner, { email: OWNER, accessMode: "self-serve" });
  assert.deepEqual(
    body.recentReports.map((report) => report.id),
    ["shop-example-com-account-rep-001"]
  );
  assert.equal(body.recentReports[0].score, 72);
  assert.equal(body.recentReports[0].totalFindings, 1);
  assert.deepEqual(
    body.recentAuditJobs.map((job) => [job.id, job.status]),
    [[queued.jobId, "queued"]]
  );
  assert.deepEqual(body.sites.map((site) => site.host).sort(), ["blog.example.com", "shop.example.com"]);
  assert.equal(body.metrics.reports, 1);
  assert.equal(body.metrics.verifiedSites, 1);
  assert.equal(body.metrics.runningAudits, 1);
  assert.equal(body.nextActions[0].id, "audit-running");
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes("rival"), "summary leaked another owner's data");

  const rival = await (await call(world, "/api/account/summary", { session: rivalSession })).json();
  assert.equal(rival.owner.email, OTHER);
  assert.deepEqual(
    rival.recentReports.map((report) => report.id),
    ["rival-example-org-account-r-001"]
  );
  assert.deepEqual(rival.recentAuditJobs, []);
  assert.ok(!JSON.stringify(rival).includes("shop.example.com"));

  const anonymous = await call(world, "/api/account/summary");
  assert.equal(anonymous.status, 401);

  const expiredSession = signIn(world, OWNER);
  world.db.rows(
    "UPDATE beta_sessions SET expires_at = ? WHERE token_hash = ? RETURNING token_hash",
    isoFromNow(-1000),
    sha256(expiredSession)
  );
  const expired = await call(world, "/api/account/summary", { session: expiredSession });
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie") || "", /sfk_beta_session=;/);
});
