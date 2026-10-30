import assert from "node:assert/strict";
import test from "node:test";
import { D1_MAX_CONCURRENCY } from "../worker/lib/bounded.js";
import { runScheduledTasks, scheduledTasks } from "../worker/lib/scheduled.js";
import { createTestD1 } from "./support/d1.mjs";
const OWNER = "owner@example.com";
const OTHER_OWNER = "buyer@example.com";
const T0 = "2026-10-15T08:00:00.000Z";
const minutes = (n) => new Date(Date.parse(T0) + n * 60_000).toISOString();
const hours = (n) => new Date(Date.parse(T0) + n * 3_600_000).toISOString();
const days = (n) => new Date(Date.parse(T0) - n * 86_400_000).toISOString();

const MAX_IN_FLIGHT = 8;
const MAX_BATCH = 7;
const MIN_UPTIME_STATEMENTS = 100;

function instrument(db) {
  const stats = {
    statements: 0,
    batches: 0,
    largestBatch: 0,
    inFlight: 0,
    peakInFlight: 0
  };
  const originalPrepare = db.prepare.bind(db);
  const originalBatch = db.batch.bind(db);
  const counted = (promise) => {
    stats.statements += 1;
    stats.inFlight += 1;
    stats.peakInFlight = Math.max(stats.peakInFlight, stats.inFlight);
    return promise.finally(() => {
      stats.inFlight = Math.max(0, stats.inFlight - 1);
    });
  };
  const wrapStatement = (statement) =>
    new Proxy(statement, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (property === "bind") return (...values) => wrapStatement(target.bind(...values));
        if (property === "first" || property === "all" || property === "run" || property === "raw") {
          return (...args) => counted(value.apply(target, args));
        }
        return value.bind(target);
      }
    });
  db.prepare = (sql) => wrapStatement(originalPrepare(sql));
  db.batch = async (statements) => {
    stats.batches += 1;
    stats.statements += statements.length;
    stats.largestBatch = Math.max(stats.largestBatch, statements.length);
    stats.inFlight += 1;
    stats.peakInFlight = Math.max(stats.peakInFlight, stats.inFlight);
    try {
      return await originalBatch(statements);
    } finally {
      stats.inFlight = Math.max(0, stats.inFlight - 1);
    }
  };
  return {
    reset() {
      stats.statements = 0;
      stats.batches = 0;
      stats.largestBatch = 0;
      stats.inFlight = 0;
      stats.peakInFlight = 0;
    },
    stats
  };
}

function seed(db, { dueUptimeSchedules = 0, dueAuditSchedules = 0, expiredReports = 0, largeCrawlJobs = 0 } = {}) {
  db.insert("fix_requests", {
    id: "fr-1",
    report_id: "report-live",
    owner_email: OWNER,
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status: "paid",
    paid_at: T0,
    is_test: 0,
    created_at: T0,
    updated_at: T0
  });
  for (let index = 0; index < expiredReports; index += 1) {
    db.insert("audit_reports", {
      id: `report-expired-${index}`,
      url: `https://site${index}.example.com/`,
      origin: `https://site${index}.example.com`,
      owner_email: OTHER_OWNER,
      target_host: `site${index}.example.com`,
      report_json: "{}",
      summary_json: "{}",
      score: 70,
      expires_at: days(1),
      created_at: days(30),
      updated_at: days(30)
    });
  }
  db.insert("audit_reports", {
    id: "report-live",
    url: "https://www.example.com/",
    origin: "https://www.example.com",
    owner_email: OWNER,
    target_host: "www.example.com",
    report_json: "{}",
    summary_json: "{}",
    score: 70,
    expires_at: hours(24 * 30),
    created_at: T0,
    updated_at: T0
  });
  db.insert("audit_jobs", {
    id: "job-running-stale",
    owner_email: OWNER,
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status: "running",
    started_at: minutes(-40),
    max_pages: 10,
    created_at: minutes(-50),
    updated_at: minutes(-40)
  });
  db.insert("audit_jobs", {
    id: "job-queued-stale",
    owner_email: OWNER,
    target_url: "https://www.example.com/",
    target_host: "www.example.com",
    status: "queued",
    max_pages: 10,
    created_at: minutes(-40),
    updated_at: minutes(-40)
  });
  for (let index = 0; index < 60; index += 1) {
    db.insert("audit_jobs", {
      id: `job-${index}`,
      owner_email: OTHER_OWNER,
      target_url: `https://site${index}.example.com/`,
      target_host: `site${index}.example.com`,
      status: "delivered",
      started_at: minutes(-120),
      completed_at: minutes(-119),
      max_pages: 10,
      created_at: minutes(-130),
      updated_at: minutes(-119)
    });
  }
  for (let index = 0; index < dueAuditSchedules; index += 1) {
    db.insert("audit_schedules", {
      id: `schedule-audit-${index}`,
      owner_email: OTHER_OWNER,
      access_mode: "self-serve",
      target_url: `https://site${index}.example.com/`,
      target_host: `site${index}.example.com`,
      status: "active",
      max_pages: 10,
      next_run_at: minutes(-1),
      created_at: days(3),
      updated_at: days(3)
    });
  }
  for (let index = 0; index < dueUptimeSchedules; index += 1) {
    db.insert("audit_schedules", {
      id: `schedule-uptime-${index}`,
      owner_email: OWNER,
      access_mode: "self-serve",
      target_url: `https://site${index}.example.com/`,
      target_host: `site${index}.example.com`,
      status: "active",
      max_pages: 10,
      next_run_at: minutes(-1),
      uptime_checked_at: null,
      created_at: days(3),
      updated_at: days(3)
    });
  }
  for (let index = 0; index < largeCrawlJobs; index += 1) {
    db.insert("large_crawl_jobs", {
      id: `large-crawl-${index}`,
      owner_email: OTHER_OWNER,
      access_mode: "worker",
      target_url: `https://site${index}.example.com/`,
      target_host: `site${index}.example.com`,
      status: "queued",
      target_pages: 10,
      batch_size: 5,
      max_concurrency: 1,
      crawl_delay_ms: 0,
      max_retries: 1,
      frontier_url_count: 1,
      inventory_summary_json: "{}",
      merge_status: "blocked",
      expires_at: hours(24),
      created_at: T0,
      updated_at: T0
    });
  }
  for (let index = 0; index < 400; index += 1) {
    db.insert("score_history", {
      owner_email: OTHER_OWNER,
      report_id: `report-score-${index}`,
      url: `https://site${index % 40}.example.com/`,
      target_host: `site${index % 40}.example.com`,
      score: 60 + (index % 30),
      total_findings: 5,
      created_at: days(200 + (index % 100))
    });
  }
  for (let index = 0; index < 200; index += 1) {
    db.insert("widget_leads", {
      widget_id: `widget-${index % 4}`,
      owner_email: OTHER_OWNER,
      email: `lead${index}@example.com`,
      url: `https://site${index % 40}.example.com/`,
      score: 55,
      problems: 3,
      created_at: days(200 + (index % 100))
    });
  }
  for (let index = 0; index < 40; index += 1) {
    db.insert("audit_usage", {
      bucket: `usage-${index}`,
      count: 1,
      window_start: days(20),
      updated_at: days(20)
    });
  }
  for (let index = 0; index < 30; index += 1) {
    db.insert("beta_sessions", {
      token_hash: `session-${index}`,
      owner_email: `lead${index}@example.com`,
      created_at: days(2),
      last_seen_at: days(2),
      expires_at: hours(24 * 30)
    });
  }
  db.insert("access_tokens", {
    token_hash: "token-1",
    owner_email: OTHER_OWNER,
    created_at: days(40),
    expires_at: days(1)
  });
  db.insert("admin_sessions", {
    token_hash: "admin-1",
    actor_email: OWNER,
    created_at: days(40),
    expires_at: days(1)
  });
}

function testEnv(db, extra = {}) {
  return {
    WAITLIST_DB: db,
    SEOFIXKIT_APP_ORIGIN: "https://seofixkit.com",
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
    SEOFIXKIT_ADMIN_EMAIL: "ops@seofixkit.com",
    INTERNAL_EMAIL_DOMAINS: "0509.io,seofixkit.com",
    EMAIL: {
      async send() {
        return { messageId: "m-1" };
      }
    },
    REPORTS: {
      async delete() {}
    },
    AUDIT_QUEUE: {
      async send() {}
    },
    ...extra
  };
}

const TASK_OPTIONS = { fetchImpl: async () => new Response("ok"), privateAddressResolver: async () => false };

async function tick(db, seedOptions = {}, extraEnv = {}) {
  seed(db, seedOptions);
  const env = testEnv(db, extraEnv);
  const handle = instrument(db);
  const perTask = [];
  const instrumented = scheduledTasks(env).map(([name, task]) => [
    name,
    async (taskEnv) => {
      handle.reset();
      await task(taskEnv, TASK_OPTIONS);
      perTask.push({ name, ...handle.stats });
    }
  ]);
  await runScheduledTasks(env, instrumented);
  return { env, perTask, stats: handle.stats };
}

function report(perTask) {
  const width = Math.max(...perTask.map((task) => task.name.length));
  return perTask
    .map(
      (task) =>
        `  ${task.name.padEnd(width)}  statements=${String(task.statements).padStart(4)}  ` +
        `peakInFlight=${String(task.peakInFlight).padStart(3)}  batches=${task.batches}  ` +
        `largestBatch=${task.largestBatch}`
    )
    .join("\n");
}

function assertWithinCeiling(perTask) {
  assert.equal(
    D1_MAX_CONCURRENCY,
    MAX_IN_FLIGHT,
    `worker/lib/bounded.js raised D1_MAX_CONCURRENCY to ${D1_MAX_CONCURRENCY}; the ceiling this test holds is ${MAX_IN_FLIGHT}, so raise both or explain why the tick may hold more`
  );
  for (const task of perTask) {
    assert.ok(
      task.peakInFlight <= MAX_IN_FLIGHT,
      `${report([task])}\n\n${task.name} put ${task.peakInFlight} D1 calls in flight at once (limit ${MAX_IN_FLIGHT})`
    );
    assert.ok(
      task.largestBatch <= MAX_BATCH,
      `${report([task])}\n\n${task.name} sent a batch of ${task.largestBatch} statements (limit ${MAX_BATCH})`
    );
  }
}

test("a full scheduled tick through runScheduledTasks stays inside the D1 ceiling", async () => {
  const { perTask } = await tick(createTestD1(), {
    dueUptimeSchedules: 25,
    dueAuditSchedules: 5,
    expiredReports: 20
  });

  assertWithinCeiling(perTask);
});

test("the ceiling holds at four times the due uptime work", async () => {
  const { perTask } = await tick(createTestD1(), {
    dueUptimeSchedules: 100,
    dueAuditSchedules: 20,
    expiredReports: 60
  });

  assertWithinCeiling(perTask);

  const uptime = perTask.find((task) => task.name === "runUptimeChecks");
  assert.ok(
    uptime.statements >= MIN_UPTIME_STATEMENTS,
    `runUptimeChecks issued ${uptime.statements} statements for 100 due sites, expected at least ${MIN_UPTIME_STATEMENTS}`
  );
});

test("the large-crawl worker task is measured when the flag turns it on", async () => {
  const { env, perTask } = await tick(
    createTestD1(),
    { largeCrawlJobs: 3 },
    {
      SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED: "true",
      BROWSER: {}
    }
  );

  const names = scheduledTasks(env).map(([name]) => name);
  assert.ok(
    names.includes("runDueLargeRenderedCrawlWorkers"),
    `the large-crawl task is missing from the list: ${names.join(", ")}`
  );

  assertWithinCeiling(perTask);
});

test("a tick with nothing due still reads the database", async () => {
  const { perTask } = await tick(createTestD1());
  const cleanup = perTask.find((task) => task.name === "cleanupExpiredRows");
  assert.ok(cleanup.statements > 0, "the cleanup task reads the database even when nothing expired");
});
