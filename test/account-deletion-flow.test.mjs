import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import worker from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.test";
const TARGET = "leaver@example.com";
const OTHER = "stayer@example.com";
const ADMIN_TOKEN = "admin-token-for-deletion-tests";
const NOW = "2026-10-01T00:00:00.000Z";
const LATER = "2099-01-01T00:00:00.000Z";

// Tables whose email columns only ever hold staff addresses, never a customer's.
const STAFF_ONLY_TABLES = new Set(["admin_sessions"]);

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

// One row in every customer table, for the account being deleted, plus rows for a
// second account that must survive and rows elsewhere that mention the first one.
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

  // Team: the leaver owns a team, and is also a member of the stayer's team.
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

  // Repair work, on the leaver's report and on the stayer's report.
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

  // Large crawl with every child table.
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

  // Payments: one delivered Fix Pack (kept, anonymised) and one never-paid request (deleted).
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
    refund_reason: `requested by ${e}`,
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

  // Settings, emails, history, widgets, funnel and rate-limit records.
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

  // The stayer's own account.
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

test("the seed covers every table that can hold a customer's email", () => {
  const world = makeWorld();
  seedEverything(world);
  signIn(world.db, TARGET);
  const seededTables = new Set(rowsMentioning(world.db, TARGET).map((hit) => hit.table));
  for (const table of tables(world.db)) {
    if (STAFF_ONLY_TABLES.has(table)) continue;
    const emailColumns = world.db.rows(`PRAGMA table_info(${table})`).filter((column) => /email/.test(column.name));
    if (!emailColumns.length) continue;
    assert.ok(
      seededTables.has(table),
      `${table} has an email column: seed it here and cover it in worker/lib/account-deletion.js`
    );
  }
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
  assert.equal(response.json.paymentRecordsKept, 1);
  assert.match(response.headers.get("set-cookie") || "", /sfk_beta_session=;.*Max-Age=0/i);

  assert.deepEqual(rowsMentioning(db, TARGET), [], "no row anywhere may still hold the deleted email");
  assert.deepEqual(rowsMentioning(db, sha256(TARGET)), [], "no hashed email may remain in rate-limit buckets");
  assert.deepEqual(rowsMentioning(db, "leaver.example"), [], "the deleted account's site must be gone");
  assert.deepEqual(rowsMentioning(db, "Lee Leaver"), [], "payment payloads must not keep the customer's name");

  // Stored report files and generated PDFs are deleted; the stayer's report file stays.
  for (const key of [
    "reports/rpt-leaver-000001.json",
    "report-pdfs/owner/rpt-leaver-000001.pdf",
    "report-pdfs/shares/share-leaver-1.pdf"
  ]) {
    assert.ok(REPORTS.deleted.includes(key), `${key} must be deleted`);
    assert.equal(REPORTS.objects.has(key), false);
  }
  assert.ok(REPORTS.objects.has("reports/rpt-stayer-000001.json"));

  // The paid Fix Pack keeps its money trail under a pseudonym; the unpaid one is gone.
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
  assert.equal(db.rows("SELECT * FROM fix_request_payments").length, 1);
  const [webhook] = db.rows("SELECT * FROM dodo_webhook_events");
  assert.equal(webhook.payload_json, null);
  assert.equal(webhook.payment_id, "pay_paid_1");
  assert.deepEqual(
    db.rows("SELECT id, owner_email FROM offer_entitlements").map((row) => row.id),
    ["entitlement-subscription"]
  );
  assert.equal(db.rows("SELECT owner_email FROM offer_entitlements")[0].owner_email, kept.owner_email);

  // The stayer's account is untouched apart from the leaver's name being removed.
  assert.equal(db.rows("SELECT * FROM audit_reports WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM repair_queue_items WHERE owner_email = ?", OTHER).length, stayerQueueItems);
  assert.equal(db.rows("SELECT * FROM site_claims WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM beta_sessions WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM widget_leads WHERE owner_email = ?", OTHER).length, 1);
  assert.equal(db.rows("SELECT * FROM issue_collaboration WHERE id = 'collab-stayer'")[0].assignee_email, null);
  assert.equal(db.rows("SELECT * FROM repair_proposals WHERE id = 'proposal-stayer'")[0].approved_by_email, null);
  assert.equal(db.rows("SELECT * FROM audit_usage").length, 1);

  // One audit entry, with no personal data.
  const audit = db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_email, "account-owner");
  assert.equal(audit[0].ip_hash, "");
  const detail = JSON.parse(audit[0].detail);
  assert.equal(detail.reports, 2);
  assert.equal(detail.paymentRecordsKept, 1);

  // A confirmation goes to the address, and the old session no longer works.
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
  assert.equal(response.json.paymentRecordsKept, 1);
  assert.deepEqual(rowsMentioning(db, TARGET), []);
  const audit = db.rows("SELECT * FROM admin_audit_log WHERE action = 'account-deleted'");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].id, response.json.deletionId);
  assert.equal(sent.length, 1);
});
