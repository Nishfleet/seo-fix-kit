import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../worker/index.js";
import { deleteAccount } from "../worker/lib/account-deletion.js";
import { processAuditJob } from "../worker/routes/audits.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.test";
const TARGET = "leaver@example.com";
const OTHER = "stayer@example.com";
const ADMIN_TOKEN = "admin-token-for-deletion-tests";
const NOW = "2026-10-01T00:00:00.000Z";
const LATER = "2099-01-01T00:00:00.000Z";

const DELETION_SOURCE = readFileSync(new URL("../worker/lib/account-deletion.js", import.meta.url), "utf8");
const DELETED_TABLES = new Set(
  [...DELETION_SOURCE.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z][a-z0-9_]*)/g)].map((match) => match[1])
);
const DELETION_TABLE_EXEMPTIONS = new Map([
  ["admin_sessions", "staff sign-in sessions hold no customer email"],
  [
    "audit_report_blob_deletion_failures",
    "the retry queue for report files the deletion could not purge, owned by worker/lib/report-data.js"
  ],
  ["ops_digest_runs", "internal digest bookkeeping holds no customer email"]
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function fakeR2() {
  const objects = new Map();
  const deleted = [];
  return {
    objects,
    deleted,
    async put(key, value) {
      objects.set(key, value);
    },
    async head(key) {
      return objects.has(key) ? { key } : null;
    },
    async get(key) {
      return objects.has(key) ? { text: async () => objects.get(key), body: objects.get(key) } : null;
    },
    async delete(keys) {
      for (const key of [keys].flat()) {
        deleted.push(key);
        objects.delete(key);
      }
    }
  };
}

function makeWorld() {
  const db = createTestD1();
  const sent = [];
  const REPORTS = fakeR2();
  const env = {
    WAITLIST_DB: db,
    REPORTS,
    ADMIN_EXPORT_TOKEN: ADMIN_TOKEN,
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <support@seofixkit.com>",
    EMAIL: {
      async send(message) {
        sent.push(message);
        return { messageId: `message-${sent.length}` };
      }
    }
  };
  return { db, env, sent, REPORTS };
}

function signIn(db, email, { token = `token-${email}`, accessMode = "self-serve" } = {}) {
  db.insert("beta_sessions", {
    token_hash: sha256(token),
    owner_email: email,
    created_at: NOW,
    expires_at: LATER,
    last_seen_at: NOW,
    ip_hash: "ip-hash",
    user_agent: "test-agent",
    access_mode: accessMode
  });
  return `sfk_beta_session=${token}`;
}

function seedReport(db, REPORTS, id, owner, { inR2 = false } = {}) {
  const json = JSON.stringify({ id, url: `https://${owner.split("@")[0]}.example/`, owner: { email: owner } });
  if (inR2) REPORTS.objects.set(`reports/${id}.json`, json);
  db.insert("audit_reports", {
    id,
    url: `https://${owner.split("@")[0]}.example/`,
    origin: `https://${owner.split("@")[0]}.example`,
    score: 70,
    summary_json: "{}",
    report_json: inR2 ? `r2:reports/${id}.json` : json,
    created_at: NOW,
    updated_at: NOW,
    owner_email: owner,
    owner_session_hash: "session-hash",
    target_host: `${owner.split("@")[0]}.example`,
    expires_at: LATER
  });
}

function seedQueueItem(db, id, reportId, owner, updatedBy = owner) {
  db.insert("repair_queue_items", {
    id,
    report_id: reportId,
    owner_email: owner,
    issue_id: `issue-${id}`,
    title: "Missing title",
    created_at: NOW,
    updated_at: NOW,
    updated_by_email: updatedBy
  });
}

function seedEverything(world) {
  const { db, REPORTS } = world;
  const e = TARGET;
  const host = "leaver.example";

  seedReport(db, REPORTS, "rpt-leaver-000001", e, { inR2: true });
  seedReport(db, REPORTS, "rpt-leaver-000002", e);
  seedReport(db, REPORTS, "rpt-stayer-000001", OTHER, { inR2: true });
  REPORTS.objects.set("report-pdfs/owner/rpt-leaver-000001.pdf", "pdf");
  REPORTS.objects.set("report-pdfs/shares/share-leaver-1.pdf", "pdf");

  db.insert("waitlist_leads", { email: e, created_at: NOW, updated_at: NOW });
  db.insert("waitlist_leads", { email: OTHER, created_at: NOW, updated_at: NOW });
  db.insert("beta_invites", { id: "invite-leaver", code_hash: "code-hash", owner_email: e, created_at: NOW });
  db.insert("access_tokens", { token_hash: "access-hash", owner_email: e, created_at: NOW, expires_at: LATER });
  db.insert("site_claims", {
    id: "claim-leaver",
    owner_email: e,
    host,
    verification_token: "verify-token",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("audit_schedules", {
    id: "schedule-leaver",
    owner_email: e,
    target_url: `https://${host}/`,
    target_host: host,
    next_run_at: LATER,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("audit_jobs", {
    id: "11111111-1111-4111-8111-111111111111",
    owner_email: e,
    target_url: `https://${host}/`,
    target_host: host,
    status: "queued",
    report_id: "rpt-leaver-000001",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("api_tokens", {
    id: "api-token-leaver",
    owner_email: e,
    token_hash: "api-hash",
    token_prefix: "sfk_",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("api_webhooks", {
    id: "webhook-leaver",
    owner_email: e,
    url: "https://hooks.example/x",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("api_webhook_events", {
    id: "webhook-event-leaver",
    webhook_id: "webhook-leaver",
    owner_email: e,
    event_type: "audit.completed",
    status: "sent",
    created_at: NOW
  });
  db.insert("report_branding", {
    owner_email: e,
    agency_name: "Leaver Agency",
    brand_color: "#000000",
    accent_color: "#ffffff",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("report_share_links", {
    id: "share-leaver-1",
    report_id: "rpt-leaver-000001",
    owner_email: e,
    client_name: "Client",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("report_domains", {
    id: "domain-leaver",
    owner_email: e,
    domain: "reports.leaver.example",
    verification_token: "domain-token",
    created_at: NOW,
    updated_at: NOW
  });

  db.insert("team_members", {
    id: "team-leaver-owns",
    owner_email: e,
    member_email: "teammate@example.com",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("team_members", {
    id: "team-stayer-owns",
    owner_email: OTHER,
    member_email: e,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("issue_collaboration", {
    id: "collab-leaver",
    report_id: "rpt-leaver-000001",
    owner_email: e,
    issue_id: "issue-a",
    created_at: NOW,
    updated_at: NOW,
    updated_by_email: e
  });
  db.insert("issue_collaboration", {
    id: "collab-stayer",
    report_id: "rpt-stayer-000001",
    owner_email: OTHER,
    issue_id: "issue-b",
    assignee_email: e,
    created_at: NOW,
    updated_at: NOW,
    updated_by_email: e
  });

  seedQueueItem(db, "queue-leaver", "rpt-leaver-000001", e);
  seedQueueItem(db, "queue-stayer", "rpt-stayer-000001", OTHER, e);
  db.insert("repair_agent_actions", {
    id: "action-leaver",
    report_id: "rpt-leaver-000001",
    owner_email: e,
    queue_item_id: "queue-leaver",
    issue_id: "issue-queue-leaver",
    created_at: NOW,
    updated_at: NOW,
    updated_by_email: e
  });
  db.insert("repair_agent_actions", {
    id: "action-stayer",
    report_id: "rpt-stayer-000001",
    owner_email: OTHER,
    queue_item_id: "queue-stayer",
    issue_id: "issue-queue-stayer",
    created_at: NOW,
    updated_at: NOW,
    updated_by_email: e
  });
  db.insert("repair_proposals", {
    id: "proposal-leaver",
    report_id: "rpt-leaver-000001",
    owner_email: e,
    issue_id: "issue-a",
    created_at: NOW,
    updated_at: NOW,
    approved_by_email: e
  });
  db.insert("repair_proposals", {
    id: "proposal-stayer",
    report_id: "rpt-stayer-000001",
    owner_email: OTHER,
    issue_id: "issue-b",
    created_at: NOW,
    updated_at: NOW,
    approved_by_email: e
  });
  db.insert("repair_proposal_events", {
    id: "proposal-event-leaver",
    proposal_id: "proposal-leaver",
    event: "approved",
    actor_type: "owner",
    actor_email: e,
    created_at: NOW
  });
  db.insert("repair_proposal_events", {
    id: "proposal-event-stayer",
    proposal_id: "proposal-stayer",
    event: "approved",
    actor_type: "teammate",
    actor_email: e,
    created_at: NOW
  });

  db.insert("large_crawl_jobs", {
    id: "crawl-leaver",
    owner_email: e,
    target_url: `https://${host}/`,
    target_host: host,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("large_crawl_batches", {
    id: "batch-leaver",
    crawl_job_id: "crawl-leaver",
    batch_index: 0,
    start_index: 0,
    end_index: 1,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("large_crawl_frontier", {
    id: "frontier-leaver",
    crawl_job_id: "crawl-leaver",
    batch_id: "batch-leaver",
    batch_index: 0,
    url: `https://${host}/a`,
    normalized_url: `https://${host}/a`,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("large_crawl_url_proofs", {
    id: "proof-leaver",
    crawl_job_id: "crawl-leaver",
    batch_id: "batch-leaver",
    frontier_id: "frontier-leaver",
    url: `https://${host}/a`,
    rendered_at: NOW,
    created_at: NOW
  });
  db.insert("large_crawl_dead_letters", {
    id: "dead-leaver",
    crawl_job_id: "crawl-leaver",
    error: "timeout",
    created_at: NOW
  });
  db.insert("large_crawl_events", {
    id: "crawl-event-leaver",
    crawl_job_id: "crawl-leaver",
    event_type: "x",
    created_at: NOW
  });
  db.insert("large_crawl_worker_heartbeats", {
    id: "heartbeat-leaver",
    worker_id: "worker-1",
    crawl_job_id: "crawl-leaver",
    last_seen_at: NOW,
    created_at: NOW
  });

  db.insert("backlink_import_batches", {
    id: "backlink-batch-leaver",
    owner_email: e,
    target_host: host,
    imported_at: NOW,
    created_at: NOW
  });
  db.insert("backlink_edges", {
    id: "edge-leaver",
    owner_email: e,
    target_host: host,
    import_batch_id: "backlink-batch-leaver",
    source_url: "https://ref.example/",
    source_host: "ref.example",
    target_url: `https://${host}/`,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("keyword_import_batches", {
    id: "keyword-batch-leaver",
    owner_email: e,
    target_host: host,
    imported_at: NOW,
    created_at: NOW
  });
  db.insert("keyword_rank_observations", {
    id: "rank-leaver",
    owner_email: e,
    target_host: host,
    import_batch_id: "keyword-batch-leaver",
    query: "leaver plumbing",
    normalized_query: "leaver plumbing",
    observed_at: NOW,
    created_at: NOW
  });
  db.insert("keyword_volume_observations", {
    id: "volume-leaver",
    owner_email: e,
    target_host: host,
    query: "leaver plumbing",
    normalized_query: "leaver plumbing",
    observed_at: NOW,
    created_at: NOW
  });

  db.insert("fix_requests", {
    id: "fix-paid-leaver",
    report_id: "rpt-leaver-000001",
    owner_email: e,
    target_url: `https://${host}/`,
    target_host: host,
    status: "delivered",
    note: "Please fix my site",
    customer_note: `Contact ${e}`,
    admin_note: "VIP",
    checkout_session_id: "cs_paid_1",
    checkout_url: "https://test.dodopayments.com/session/cs_paid_1",
    payment_id: "pay_paid_1",
    paid_at: NOW,
    payment_amount: 9900,
    payment_currency: "USD",
    payment_customer_email: e,
    refund_reason: "Lee Leaver changed their mind",
    status_reason: "Lee Leaver asked for the homepage first",
    final_report_id: "leaver-example-11111111-1111-4111-8111-111111111111",
    assigned_to: "ops",
    score: 70,
    issue_count: 4,
    delivery_url: `https://${host}/fixed`,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("fix_requests", {
    id: "fix-unpaid-leaver",
    report_id: "rpt-leaver-000002",
    owner_email: e,
    target_url: `https://${host}/`,
    target_host: host,
    status: "new",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("fix_request_payments", {
    payment_id: "pay_paid_1",
    fix_request_id: "fix-paid-leaver",
    role: "primary",
    status: "succeeded",
    amount: 9900,
    currency: "USD",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("fix_request_events", {
    id: "fix-event-leaver",
    fix_request_id: "fix-paid-leaver",
    event: "status_changed",
    actor_type: "customer",
    actor_email: e,
    reason: "Lee Leaver phoned support",
    detail_json: JSON.stringify({ email: e }),
    created_at: NOW
  });
  db.insert("fix_request_events", {
    id: "fix-event-unpaid",
    fix_request_id: "fix-unpaid-leaver",
    event: "created",
    actor_type: "customer",
    actor_email: e,
    created_at: NOW
  });
  db.insert("fix_request_notifications", {
    id: "notification-leaver",
    fix_request_id: "fix-paid-leaver",
    event: "delivered",
    recipient_type: "customer",
    recipient_email: e,
    status: "sent",
    provider: "cloudflare",
    provider_message_id: "msg-to-lee-leaver",
    error: "Lee Leaver mailbox full",
    created_at: NOW
  });
  db.insert("dodo_webhook_events", {
    webhook_id: "wh-leaver",
    event_type: "payment.succeeded",
    payment_id: "pay_paid_1",
    fix_request_id: "fix-paid-leaver",
    status: "processed",
    payload_hash: "payload-hash",
    payload_json: JSON.stringify({ data: { customer: { email: e, name: "Lee Leaver" } } }),
    first_received_at: NOW,
    last_received_at: NOW,
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("offer_entitlements", {
    id: "entitlement-subscription",
    owner_email: e,
    offer_key: "proof_monitoring",
    status: "cancelled",
    source: "dodo_subscription",
    provider: "dodo",
    subscription_id: "sub_1",
    created_at: NOW,
    updated_at: NOW,
    revoked_at: NOW
  });
  db.insert("offer_entitlements", {
    id: "entitlement-manual",
    owner_email: e,
    offer_key: "agency_workspace",
    status: "active",
    source: "manual",
    created_at: NOW,
    updated_at: NOW
  });
  for (const entitlementId of ["entitlement-subscription", "entitlement-manual"]) {
    db.insert("offer_entitlement_events", {
      id: `event-${entitlementId}`,
      entitlement_id: entitlementId,
      owner_email: e,
      offer_key: "proof_monitoring",
      event: "changed",
      detail_json: JSON.stringify({ email: e }),
      created_at: NOW
    });
  }
  db.insert("monitoring_checkout_sessions", { owner_email: e, target_host: host, updated_at: NOW });

  db.insert("email_preferences", {
    owner_email: e,
    unsubscribe_token: "unsub-token",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("lifecycle_emails", { owner_email: e, kind: "first-audit-nudge", sent_at: NOW });
  db.insert("score_history", {
    owner_email: e,
    report_id: "rpt-leaver-000001",
    url: `https://${host}/`,
    target_host: host,
    score: 70,
    created_at: NOW
  });
  db.insert("score_badges", { id: "badge-leaver", owner_email: e, target_host: host, created_at: NOW });
  db.insert("audit_widgets", { id: "widget-leaver", owner_email: e, created_at: NOW });
  db.insert("audit_widgets", { id: "widget-stayer", owner_email: OTHER, created_at: NOW });
  db.insert("widget_leads", {
    widget_id: "widget-leaver",
    owner_email: e,
    email: "visitor@example.com",
    url: "https://visitor.example/",
    created_at: NOW
  });
  db.insert("widget_leads", {
    widget_id: "widget-stayer",
    owner_email: OTHER,
    email: e,
    url: `https://${host}/`,
    created_at: NOW
  });
  db.insert("widget_leads", {
    widget_id: "widget-stayer",
    owner_email: OTHER,
    email: "someone@example.com",
    url: "https://someone.example/",
    created_at: NOW
  });
  db.insert("access_events", { step: "access_requested", owner_email: e, ip_hash: "ip", created_at: NOW });
  db.insert("access_events", { step: "access_requested", owner_email: OTHER, ip_hash: "ip", created_at: NOW });
  db.insert("audit_usage", { bucket: `audit:lite-day:2026-10-01:${e}`, count: 1, window_start: NOW, updated_at: NOW });
  db.insert("audit_usage", {
    bucket: `login:email:2026-10-01T00:${sha256(e)}`,
    count: 1,
    window_start: NOW,
    updated_at: NOW
  });
  db.insert("audit_usage", { bucket: "audit:ip:2026-10-01T00:iphash", count: 1, window_start: NOW, updated_at: NOW });
  db.insert("admin_audit_log", {
    id: "admin-log-1",
    action: "create-invite",
    success: 1,
    actor_email: "bearer-admin",
    detail: e,
    created_at: NOW
  });
  db.insert("admin_audit_log", {
    id: "admin-log-2",
    action: "create-beta-proof-session",
    success: 1,
    actor_email: e,
    detail: "",
    created_at: NOW
  });

  seedQueueItem(db, "queue-stayer-own", "rpt-stayer-000001", OTHER);
  db.insert("site_claims", {
    id: "claim-stayer",
    owner_email: OTHER,
    host: "stayer.example",
    verification_token: "verify-other",
    created_at: NOW,
    updated_at: NOW
  });
}

const FIX_REQUEST_ACCOUNTING_COLUMNS = [
  "id",
  "report_id",
  "owner_email",
  "status",
  "created_at",
  "updated_at",
  "checkout_session_id",
  "checkout_created_at",
  "product_id",
  "payment_id",
  "paid_at",
  "in_progress_at",
  "delivered_at",
  "last_notification_at",
  "is_test",
  "due_at",
  "next_update_at",
  "payment_amount",
  "payment_currency",
  "dodo_business_id",
  "dodo_brand_id",
  "refund_id",
  "refund_amount",
  "refund_currency",
  "refunded_at",
  "dispute_event",
  "disputed_at",
  "delivery_notified_at",
  "expected_amount",
  "expected_currency",
  "pre_dispute_status"
];

function assertOnlyAccountingFields(db, table, allowed) {
  const allowedSet = new Set(allowed);
  for (const row of db.rows(`SELECT * FROM ${table}`)) {
    for (const [column, value] of Object.entries(row)) {
      if (value === null || value === "" || allowedSet.has(column)) continue;
      assert.fail(`${table}.${column} still holds ${JSON.stringify(value)} after deletion`);
    }
  }
}

function tables(db) {
  return db
    .rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((row) => row.name);
}

function rowsMentioning(db, needle) {
  const hits = [];
  for (const table of tables(db)) {
    for (const row of db.rows(`SELECT * FROM ${table}`)) {
      if (JSON.stringify(row).toLowerCase().includes(needle.toLowerCase())) hits.push({ table, row });
    }
  }
  return hits;
}

async function call(env, path, { method = "GET", body, cookie, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      "user-agent": "deletion-test",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...headers
    }
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env, {
    waitUntil() {},
    passThroughOnException() {}
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
}

test("the deletion names every table that can hold a customer's data", () => {
  const world = makeWorld();
  seedEverything(world);
  signIn(world.db, TARGET);
  const uncovered = tables(world.db).filter(
    (table) => !DELETED_TABLES.has(table) && !DELETION_TABLE_EXEMPTIONS.has(table)
  );
  assert.deepEqual(
    uncovered,
    [],
    `${uncovered.join(", ")}: cover the table in worker/lib/account-deletion.js, or record why it cannot hold a customer's data in DELETION_TABLE_EXEMPTIONS`
  );
  const seededTables = new Set(rowsMentioning(world.db, TARGET).map((hit) => hit.table));
  const unseeded = tables(world.db)
    .filter((table) => !DELETION_TABLE_EXEMPTIONS.has(table))
    .filter((table) => world.db.rows(`PRAGMA table_info(${table})`).some((column) => /email/.test(column.name)))
    .filter((table) => !seededTables.has(table));
  assert.deepEqual(
    unseeded,
    [],
    `${unseeded.join(", ")} has an email column: seed it here so the deletion scan covers it`
  );
});

test("a signed-in user deletes their account and every trace of it, keeping anonymised payment records", async () => {
  const world = makeWorld();
  const { db, env, sent, REPORTS } = world;
  seedEverything(world);
  const cookie = signIn(db, TARGET);
  signIn(db, OTHER);
  const before = (table) => db.rows(`SELECT COUNT(*) AS count FROM ${table}`)[0].count;
  const stayerQueueItems = before("repair_queue_items") - 1;

  const response = await call(env, "/api/account/delete", {
    method: "POST",
    cookie,
    body: { confirmEmail: "Leaver@Example.com" }
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.ok, true);
  assert.equal(response.json.paymentRecordsKept, 2);
  assert.equal(response.json.storedFilesDeleted, 3);
  assert.equal(response.json.storedFilesFailed, 0);
  assert.equal(response.json.auditRecorded, true);
  assert.match(response.headers.get("set-cookie") || "", /sfk_beta_session=;.*Max-Age=0/i);

  assert.deepEqual(rowsMentioning(db, TARGET), [], "no row anywhere may still hold the deleted email");
  assert.deepEqual(rowsMentioning(db, sha256(TARGET)), [], "no hashed email may remain in rate-limit buckets");
  assert.deepEqual(rowsMentioning(db, "leaver.example"), [], "the deleted account's site must be gone");
  assert.deepEqual(rowsMentioning(db, "Lee Leaver"), [], "payment payloads must not keep the customer's name");

  for (const key of [
    "reports/rpt-leaver-000001.json",
    "report-pdfs/owner/rpt-leaver-000001.pdf",
    "report-pdfs/shares/share-leaver-1.pdf"
  ]) {
    assert.ok(REPORTS.deleted.includes(key), `${key} must be deleted`);
    assert.equal(REPORTS.objects.has(key), false);
  }
  assert.ok(REPORTS.objects.has("reports/rpt-stayer-000001.json"));

  const [kept] = db.rows("SELECT * FROM fix_requests");
  assert.equal(db.rows("SELECT id FROM fix_requests").length, 1);
  assert.equal(kept.id, "fix-paid-leaver");
  assert.match(kept.owner_email, /^deleted-account:[0-9a-f-]{36}$/);
  assert.equal(kept.payment_id, "pay_paid_1");
  assert.equal(kept.payment_amount, 9900);
  assert.equal(kept.payment_currency, "USD");
  assert.equal(kept.status, "delivered");
  assert.equal(kept.payment_customer_email, null);
  assert.equal(kept.note, null);
  assert.equal(kept.customer_note, null);
  assert.equal(kept.target_url, "");
  assert.equal(kept.checkout_url, null);
  assert.equal(kept.report_id, "deleted-report:fix-paid-leaver", "report ids start with the site's host");
  assertOnlyAccountingFields(db, "fix_requests", FIX_REQUEST_ACCOUNTING_COLUMNS);
  assertOnlyAccountingFields(db, "fix_request_events", ["id", "fix_request_id", "event", "actor_type", "created_at"]);
  assertOnlyAccountingFields(db, "fix_request_notifications", [
    "id",
    "fix_request_id",
    "event",
    "recipient_type",
    "status",
    "provider",
    "created_at"
  ]);
  assertOnlyAccountingFields(db, "dodo_webhook_events", [
    "webhook_id",
    "event_type",
    "payment_id",
    "fix_request_id",
    "status",
    "payload_hash",
    "received_count",
    "first_received_at",
    "last_received_at",
    "created_at",
    "updated_at"
  ]);
  assert.equal(db.rows("SELECT * FROM fix_request_payments").length, 1);
  const [webhook] = db.rows("SELECT * FROM dodo_webhook_events");
  assert.equal(webhook.payload_json, null);
  assert.equal(webhook.payment_id, "pay_paid_1");
  assert.deepEqual(
    db.rows("SELECT id, owner_email FROM offer_entitlements").map((row) => row.id),
    ["entitlement-subscription"]
  );
  assert.equal(db.rows("SELECT owner_email FROM offer_entitlements")[0].owner_email, kept.owner_email);

  assert.equal(db.rows("SELECT * FROM audit_reports WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM repair_queue_items WHERE owner_email = ?", OTHER).length, stayerQueueItems);
  assert.equal(db.rows("SELECT * FROM site_claims WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM beta_sessions WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM widget_leads WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM issue_collaboration WHERE id = 'collab-stayer'")[0].assignee_email, null);
  assert.equal(db.rows("SELECT * FROM repair_proposals WHERE id = 'proposal-stayer'")[0].approved_by_email, null);
  assert.equal(db.rows("SELECT * FROM audit_usage").length, 1);

  const audit = db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_email, "account-owner");
  assert.equal(audit[0].ip_hash, "");
  const detail = JSON.parse(audit[0].detail);
  assert.equal(detail.reports, 2);
  assert.equal(detail.paymentRecordsKept, 2);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, TARGET);
  assert.match(sent[0].subject, /deleted/);
  const after = await call(env, "/api/account/summary", { cookie });
  assert.equal(after.status, 401);
});

test("deletion needs the typed email and is refused for founder sessions", async () => {
  const { db, env } = makeWorld();
  const cookie = signIn(db, TARGET);
  db.insert("waitlist_leads", { email: TARGET, created_at: NOW, updated_at: NOW });

  const wrong = await call(env, "/api/account/delete", { method: "POST", cookie, body: { confirmEmail: OTHER } });
  assert.equal(wrong.status, 400);
  const missing = await call(env, "/api/account/delete", { method: "POST", cookie, body: {} });
  assert.equal(missing.status, 400);
  const signedOut = await call(env, "/api/account/delete", { method: "POST", body: { confirmEmail: TARGET } });
  assert.equal(signedOut.status, 401);

  const founder = signIn(db, OTHER, { token: "founder-token", accessMode: "founder-override" });
  const refused = await call(env, "/api/account/delete", {
    method: "POST",
    cookie: founder,
    body: { confirmEmail: OTHER }
  });
  assert.equal(refused.status, 403);

  assert.equal(db.rows("SELECT * FROM waitlist_leads").length, 1);
  assert.equal(db.rows("SELECT * FROM beta_sessions WHERE owner_email = ?", TARGET).length, 1);
});

test("an open Fix Pack or a live subscription blocks deletion and nothing is removed", async () => {
  for (const blocker of ["open_fix_pack", "active_subscription"]) {
    const { db, env, sent } = makeWorld();
    const cookie = signIn(db, TARGET);
    seedReport(db, fakeR2(), "rpt-leaver-000001", TARGET);
    if (blocker === "open_fix_pack") {
      db.insert("fix_requests", {
        id: "fix-open",
        report_id: "rpt-leaver-000001",
        owner_email: TARGET,
        target_url: "https://leaver.example/",
        target_host: "leaver.example",
        status: "in_progress",
        payment_id: "pay_open",
        created_at: NOW,
        updated_at: NOW
      });
    } else {
      db.insert("offer_entitlements", {
        id: "entitlement-live",
        owner_email: TARGET,
        offer_key: "proof_monitoring",
        status: "active",
        source: "dodo_subscription",
        subscription_id: "sub_live",
        created_at: NOW,
        updated_at: NOW
      });
    }
    const response = await call(env, "/api/account/delete", {
      method: "POST",
      cookie,
      body: { confirmEmail: TARGET }
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.json.blockers, [blocker]);
    assert.equal(db.rows("SELECT * FROM audit_reports").length, 1);
    assert.equal(db.rows("SELECT * FROM beta_sessions").length, 1);
    assert.equal(db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'").length, 0);
    assert.equal(sent.length, 0);
  }
});

test("support completes an emailed deletion request with the same code", async () => {
  const world = makeWorld();
  const { db, env, sent } = world;
  seedEverything(world);

  const denied = await call(env, "/admin/account-deletions", { method: "POST", body: { email: TARGET } });
  assert.equal(denied.status, 401);
  assert.equal(rowsMentioning(db, TARGET).length > 0, true);

  const invalid = await call(env, "/admin/account-deletions", {
    method: "POST",
    body: { email: "not-an-email" },
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(invalid.status, 400);

  const response = await call(env, "/admin/account-deletions", {
    method: "POST",
    body: { email: TARGET.toUpperCase() },
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.ok, true);
  assert.equal(response.json.paymentRecordsKept, 2);
  assert.deepEqual(rowsMentioning(db, TARGET), []);
  const audit = db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].id, response.json.deletionId);
  assert.equal(sent.length, 1);
});

const JOB_ID = "22222222-2222-4222-8222-222222222222";

async function fakeAudit(url) {
  const origin = new URL(url).origin;
  return {
    url,
    origin,
    score: 72,
    summary: { totalFindings: 1, pagesCrawled: 1 },
    pages: [{ url, status: 200, title: "Leaver plumbing" }],
    findings: [{ id: "missing-description", title: "Missing meta description", severity: "medium", urls: [url] }]
  };
}

function seedRunningAudit(db) {
  db.insert("audit_jobs", {
    id: JOB_ID,
    owner_email: TARGET,
    owner_session_hash: "session-hash",
    access_mode: "self-serve",
    target_url: "https://leaver.example/",
    target_host: "leaver.example",
    max_pages: 2,
    status: "queued",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

function beforeStatement(db, marker, action) {
  const prepare = db.prepare.bind(db);
  let fired = false;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (fired || !sql.includes(marker)) return statement;
    const bind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = bind(...values);
      const run = bound.run.bind(bound);
      bound.run = async () => {
        if (!fired) {
          fired = true;
          await action();
        }
        return run();
      };
      return bound;
    };
    return statement;
  };
}

test("an audit that finishes normally saves its report and emails the owner", async () => {
  const { db, env, sent, REPORTS } = makeWorld();
  seedRunningAudit(db);
  await processAuditJob(env, JOB_ID, { appOrigin: ORIGIN, runAudit: fakeAudit });
  const [report] = db.rows("SELECT id, report_json FROM audit_reports WHERE owner_email = ?", TARGET);
  assert.ok(report, "the control run must save a report");
  assert.ok(REPORTS.objects.has(report.report_json.slice(3)));
  assert.equal(db.rows("SELECT status FROM audit_jobs WHERE id = ?", JOB_ID)[0].status, "completed");
  assert.equal(sent.length, 1, "the control run must send the audit email");
});

for (const [moment, marker] of [
  ["after the report file is written but before the report row", "INSERT INTO audit_reports"],
  ["after the report is saved but before the job is marked complete", "SET status = 'completed'"]
]) {
  test(`deleting the account ${moment} leaves no report, file, history or email behind`, async () => {
    const { db, env, sent, REPORTS } = makeWorld();
    seedRunningAudit(db);
    let deletion;
    beforeStatement(db, marker, async () => {
      deletion = await deleteAccount(env, TARGET);
    });
    await processAuditJob(env, JOB_ID, { appOrigin: ORIGIN, runAudit: fakeAudit });
    assert.equal(deletion?.ok, true, "the deletion must have run during the audit");
    assert.deepEqual(rowsMentioning(db, TARGET), [], "nothing may be saved for the deleted account");
    assert.deepEqual(rowsMentioning(db, "leaver.example"), []);
    assert.deepEqual(
      [...REPORTS.objects.keys()].filter((key) => key.startsWith("reports/")),
      [],
      "the report file must be removed"
    );
    assert.deepEqual(
      sent.map((message) => message.subject),
      ["Your SEO Fix Kit account was deleted"],
      "only the deletion confirmation may be sent"
    );
  });
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedFixRequest(db, id, fields = {}) {
  db.insert("fix_requests", {
    id,
    report_id: `rpt-${id}`,
    owner_email: TARGET,
    target_url: "https://leaver.example/",
    target_host: "leaver.example",
    status: "new",
    created_at: NOW,
    updated_at: NOW,
    ...fields
  });
  db.insert("fix_request_events", {
    id: `event-${id}`,
    fix_request_id: id,
    event: "status_changed",
    actor_type: "dodo",
    reason: "payment.failed",
    created_at: NOW
  });
  db.insert("fix_request_notifications", {
    id: `notification-${id}`,
    fix_request_id: id,
    event: "payment",
    recipient_type: "customer",
    recipient_email: TARGET,
    status: "sent",
    created_at: NOW
  });
  db.insert("dodo_webhook_events", {
    webhook_id: `wh-${id}`,
    event_type: "payment.failed",
    fix_request_id: id,
    status: "processed",
    first_received_at: NOW,
    last_received_at: NOW,
    created_at: NOW,
    updated_at: NOW
  });
}

test("only Fix Packs where money moved are kept; never-paid ones go with their children", async () => {
  const { db, env } = makeWorld();
  const stale = isoHoursAgo(48);
  seedFixRequest(db, "fix-new");
  seedFixRequest(db, "fix-abandoned", {
    status: "checkout_created",
    checkout_session_id: "cs_abandoned",
    checkout_created_at: stale
  });
  seedFixRequest(db, "fix-failed", {
    status: "payment_failed",
    payment_id: "pay_failed",
    checkout_session_id: "cs_failed",
    checkout_created_at: stale
  });
  seedFixRequest(db, "fix-delivered", {
    status: "delivered",
    payment_id: "pay_delivered",
    paid_at: NOW,
    payment_amount: 9900,
    payment_currency: "USD"
  });
  seedFixRequest(db, "fix-refund-only", {
    status: "refunded",
    refund_id: "rf_early",
    refund_amount: 9900,
    refund_currency: "USD",
    refunded_at: NOW
  });
  seedFixRequest(db, "fix-payment-row", {
    status: "checkout_created",
    checkout_session_id: "cs_paid_row",
    checkout_created_at: stale
  });
  db.insert("fix_request_payments", {
    payment_id: "pay_row",
    fix_request_id: "fix-payment-row",
    role: "primary",
    status: "paid",
    amount: 9900,
    currency: "USD",
    created_at: NOW,
    updated_at: NOW
  });

  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  const keptIds = ["fix-delivered", "fix-payment-row", "fix-refund-only"];
  assert.equal(result.paymentRecordsKept, keptIds.length);
  assert.deepEqual(
    db.rows("SELECT id FROM fix_requests ORDER BY id").map((row) => row.id),
    keptIds
  );
  for (const table of ["fix_request_events", "fix_request_notifications", "dodo_webhook_events"]) {
    assert.deepEqual(
      db.rows(`SELECT fix_request_id FROM ${table} ORDER BY fix_request_id`).map((row) => row.fix_request_id),
      keptIds,
      `${table} rows of never-paid requests must be deleted`
    );
  }
  assert.deepEqual(rowsMentioning(db, TARGET), []);
});

const LIVE_CHECKOUTS = {
  "a Fix Pack checkout opened an hour ago": (db) =>
    db.insert("fix_requests", {
      id: "fix-live",
      report_id: "rpt-live",
      owner_email: TARGET,
      target_url: "https://leaver.example/",
      target_host: "leaver.example",
      status: "checkout_created",
      checkout_session_id: "cs_live",
      checkout_created_at: isoHoursAgo(1),
      created_at: NOW,
      updated_at: NOW
    }),
  "a Fix Pack checkout whose last payment attempt failed an hour ago": (db) =>
    db.insert("fix_requests", {
      id: "fix-retry",
      report_id: "rpt-retry",
      owner_email: TARGET,
      target_url: "https://leaver.example/",
      target_host: "leaver.example",
      status: "payment_failed",
      payment_id: "pay_failed",
      checkout_session_id: "cs_retry",
      checkout_created_at: isoHoursAgo(1),
      created_at: NOW,
      updated_at: NOW
    }),
  "a Fix Pack checkout being opened right now": (db) =>
    db.insert("fix_requests", {
      id: "fix-opening",
      report_id: "rpt-opening",
      owner_email: TARGET,
      target_url: "https://leaver.example/",
      target_host: "leaver.example",
      status: "new",
      checkout_lock_until: new Date(Date.now() + 30_000).toISOString(),
      created_at: NOW,
      updated_at: NOW
    }),
  "a Proof Monitoring checkout opened an hour ago": (db) =>
    db.insert("monitoring_checkout_sessions", {
      owner_email: TARGET,
      target_host: "leaver.example",
      checkout_session_id: "cs_monitoring",
      checkout_url: "https://test.dodopayments.com/session/cs_monitoring",
      checkout_created_at: isoHoursAgo(1),
      updated_at: isoHoursAgo(1)
    }),
  "a Proof Monitoring checkout being opened right now": (db) =>
    db.insert("monitoring_checkout_sessions", {
      owner_email: TARGET,
      lock_until: new Date(Date.now() + 30_000).toISOString(),
      updated_at: NOW
    })
};

for (const [name, seed] of Object.entries(LIVE_CHECKOUTS)) {
  test(`${name} blocks deletion until it is paid or expires`, async () => {
    const { db, env, sent } = makeWorld();
    const cookie = signIn(db, TARGET);
    seed(db);
    const response = await call(env, "/api/account/delete", {
      method: "POST",
      cookie,
      body: { confirmEmail: TARGET }
    });
    assert.equal(response.status, 409, JSON.stringify(response.json));
    assert.deepEqual(response.json.blockers, ["open_checkout"]);
    assert.match(response.json.error, /Finish the payment, or wait for the checkout to expire \(24 hours/);
    assert.equal(db.rows("SELECT * FROM beta_sessions").length, 1);
    assert.equal(sent.length, 0);
  });
}

test("expired or already-subscribed checkouts do not block deletion and are removed", async () => {
  const { db, env } = makeWorld();
  db.insert("fix_requests", {
    id: "fix-expired",
    report_id: "rpt-expired",
    owner_email: TARGET,
    target_url: "https://leaver.example/",
    target_host: "leaver.example",
    status: "checkout_created",
    checkout_session_id: "cs_expired",
    checkout_created_at: isoHoursAgo(25),
    checkout_lock_until: isoHoursAgo(25),
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("monitoring_checkout_sessions", {
    owner_email: TARGET,
    target_host: "leaver.example",
    checkout_session_id: "cs_subscribed",
    checkout_created_at: isoHoursAgo(1),
    lock_until: isoHoursAgo(1),
    updated_at: isoHoursAgo(1)
  });
  db.insert("offer_entitlements", {
    id: "entitlement-cancelled",
    owner_email: TARGET,
    offer_key: "proof_monitoring",
    status: "cancelled",
    source: "dodo_subscription",
    provider: "dodo",
    subscription_id: "sub_cancelled",
    created_at: isoHoursAgo(1),
    updated_at: new Date().toISOString(),
    revoked_at: new Date().toISOString()
  });

  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(db.rows("SELECT * FROM fix_requests").length, 0);
  assert.equal(db.rows("SELECT * FROM monitoring_checkout_sessions").length, 0);
  assert.deepEqual(rowsMentioning(db, TARGET), []);
});

test("a cancelled subscription is counted as a payment record the account keeps", async () => {
  const { db, env, sent } = makeWorld();
  signIn(db, TARGET);
  db.insert("offer_entitlements", {
    id: "entitlement-subscription-only",
    owner_email: TARGET,
    offer_key: "proof_monitoring",
    status: "cancelled",
    source: "dodo_subscription",
    provider: "dodo",
    subscription_id: "sub_only",
    created_at: NOW,
    updated_at: NOW,
    revoked_at: NOW
  });
  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.paymentRecordsKept, 1);
  assert.equal(sent.length, 0);
  assert.match(db.rows("SELECT owner_email FROM offer_entitlements")[0].owner_email, /^deleted-account:/);
});

test("a stored file that cannot be removed is reported and named in the confirmation", async () => {
  const { db, env, sent, REPORTS } = makeWorld();
  signIn(db, TARGET);
  seedReport(db, REPORTS, "rpt-leaver-blob", TARGET, { inR2: true });
  REPORTS.objects.set("report-pdfs/owner/rpt-leaver-blob.pdf", "pdf");
  REPORTS.delete = async () => {
    throw new Error("R2 is unavailable");
  };
  const result = await deleteAccount(env, TARGET);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.storedFilesDeleted, 0);
  assert.equal(result.storedFilesFailed, 2);
  assert.equal(result.auditRecorded, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /could not remove 2 stored report file/);
  assert.equal(
    db.rows(
      "SELECT status FROM audit_report_blob_deletion_failures WHERE blob_key = ?",
      "reports/rpt-leaver-blob.json"
    )[0].status,
    "pending"
  );
});

test("an address with no account is refused, with no audit row and no email", async () => {
  const { db, env, sent } = makeWorld();
  signIn(db, OTHER);
  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.deepEqual(result.blockers, ["no_account"]);
  assert.equal(db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'").length, 0);
  assert.equal(sent.length, 0);
});

test("an audit write that fails is reported instead of swallowed", async () => {
  const { db, env } = makeWorld();
  signIn(db, TARGET);
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (sql.includes("INSERT INTO admin_audit_log")) {
      return {
        bind: () => ({
          run: async () => {
            throw new Error("audit log is read-only");
          }
        })
      };
    }
    return prepare(sql);
  };
  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.auditRecorded, false);
});

test("an event the deleted account acted on inside another account loses its details", async () => {
  const { db, env } = makeWorld();
  signIn(db, TARGET);
  db.insert("fix_requests", {
    id: "fix-stayer",
    report_id: "rpt-stayer",
    owner_email: OTHER,
    status: "new",
    target_url: "https://stayer.example/",
    target_host: "stayer.example",
    created_at: NOW,
    updated_at: NOW
  });
  db.insert("fix_request_events", {
    id: "event-stayer-by-leaver",
    fix_request_id: "fix-stayer",
    event: "status_changed",
    actor_type: "staff",
    actor_email: TARGET,
    reason: "Lee Leaver asked for a change",
    detail_json: JSON.stringify({ email: TARGET, name: "Lee Leaver" }),
    created_at: NOW
  });
  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  const [event] = db.rows("SELECT * FROM fix_request_events WHERE id = ?", "event-stayer-by-leaver");
  assert.equal(event.actor_email, null);
  assert.equal(event.reason, null);
  assert.equal(event.detail_json, null);
  assert.equal(db.rows("SELECT * FROM fix_requests WHERE owner_email = ?", OTHER).length, 1);
  assert.deepEqual(rowsMentioning(db, "Lee Leaver"), []);
});

test("a report written after the deletion batch is still removed", async () => {
  const { db, env, REPORTS } = makeWorld();
  signIn(db, TARGET);
  seedReport(db, REPORTS, "rpt-leaver-first", TARGET, { inR2: true });
  let late = false;
  const remove = REPORTS.delete.bind(REPORTS);
  REPORTS.delete = async (keys) => {
    if (!late) {
      late = true;
      seedReport(db, REPORTS, "rpt-leaver-late", TARGET, { inR2: true });
    }
    return remove(keys);
  };
  const result = await deleteAccount(env, TARGET, { notify: false });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.reports, 2);
  assert.equal(result.storedFilesDeleted, 2);
  assert.equal(result.storedFilesFailed, 0);
  assert.equal(db.rows("SELECT * FROM audit_reports WHERE owner_email = ?", TARGET).length, 0);
  assert.equal(REPORTS.objects.has("reports/rpt-leaver-late.json"), false);
});
