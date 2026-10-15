import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { sha256Hex } from "../worker/lib/security.js";
import { createTestD1 } from "./support/d1.mjs";
import { checkoutMessage } from "../src/lib/labels.js";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const REPORT_ID = "example-com-report-1";
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const DODO_CHECKOUT_URL = "https://test.dodopayments.com/session/cs_test_1";

const BASE_ENV = {
  DODO_SEOFIXKIT_API_KEY: "dodo-test-key",
  DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt_fix_pack",
  DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: "pdt_monitoring",
  DODO_SEOFIXKIT_BRAND_ID: "brand-1",
  DODO_SEOFIXKIT_ENVIRONMENT: "test",
  DODO_SEOFIXKIT_WEBHOOK_SECRET: WEBHOOK_SECRET
};

function createWorld(envOverrides = {}) {
  const db = createTestD1();
  const env = { ...BASE_ENV, WAITLIST_DB: db };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return { db, env };
}

async function withDodo(callback, { checkoutUrl = DODO_CHECKOUT_URL, sessionId = "cs_test_1" } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const call = {
      url,
      method: options.method || "GET",
      headers: new Headers(options.headers || {}),
      body: options.body ? JSON.parse(options.body) : null
    };
    calls.push(call);
    if (url === "https://test.dodopayments.com/checkouts/preview") {
      return Response.json({ display_price: "$99.00", currency: "USD", total_amount: 9900 });
    }
    if (url === "https://test.dodopayments.com/checkouts") {
      return Response.json({ checkout_url: checkoutUrl, session_id: sessionId });
    }
    return new Response("unexpected outgoing request", { status: 599 });
  };
  let result;
  try {
    result = await callback(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const unexpected = calls.filter((call) => !call.url.startsWith("https://test.dodopayments.com/"));
  assert.deepEqual(
    unexpected.map((call) => call.url),
    [],
    "only Dodo is called"
  );
  return result;
}

function dodoCheckoutCalls(calls) {
  return calls.filter((call) => call.url === "https://test.dodopayments.com/checkouts");
}

async function send(env, request) {
  const pending = [];
  const ctx = {
    waitUntil(promise) {
      pending.push(promise);
    },
    passThroughOnException() {}
  };
  const response = await app.fetch(request, env, ctx);
  await Promise.allSettled(pending);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function apiRequest(path, { method = "GET", token = "", body } = {}) {
  const headers = {};
  if (token) headers["x-beta-session"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function signWebhook(webhookId, timestamp, body, secret) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${webhookId}.${timestamp}.${body}`).digest("base64")}`;
}

function webhookRequest(payload, webhookId, options = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp
  };
  if (options.signed !== false) {
    headers["webhook-signature"] = signWebhook(webhookId, timestamp, body, options.secret ?? WEBHOOK_SECRET);
  }
  return new Request(`${ORIGIN}/api/webhooks/dodo`, { method: "POST", headers, body });
}

async function arrangeOwnerSession(db, email = OWNER) {
  const token = `session-${randomBytes(16).toString("hex")}`;
  const now = new Date().toISOString();
  db.insert("beta_sessions", {
    token_hash: await sha256Hex(token),
    owner_email: email,
    access_mode: "founder-override",
    created_at: now,
    last_seen_at: now,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  return token;
}

function arrangeSavedReport(db, email = OWNER) {
  const now = new Date().toISOString();
  const report = {
    id: REPORT_ID,
    url: "https://example.com/",
    score: 81,
    summary: { totalFindings: 1 },
    findings: [
      {
        id: "issue-1",
        severity: "critical",
        title: "Missing title",
        pageUrl: "https://example.com/",
        evidence: "Rendered title is missing.",
        fix: "Add a descriptive title.",
        confidence: "verified",
        source: "rendered"
      }
    ],
    repairPlan: []
  };
  db.insert("audit_reports", {
    id: REPORT_ID,
    url: "https://example.com/",
    origin: "https://example.com",
    target_host: "example.com",
    owner_email: email,
    score: 81,
    summary_json: JSON.stringify(report.summary),
    report_json: JSON.stringify(report),
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
}

function arrangeVerifiedSite(db, email = OWNER, host = "example.com") {
  const now = new Date().toISOString();
  db.insert("site_claims", {
    id: "site-claim-1",
    owner_email: email,
    host,
    verification_token: "verify-token",
    status: "verified",
    verification_method: "meta",
    created_at: now,
    updated_at: now,
    verified_at: now
  });
}

async function startFixPackCheckout(world, token) {
  const { body } = await withDodo(() =>
    send(world.env, apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } }))
  );
  assert.equal(body.mode, "checkout", JSON.stringify(body));
  return fixRequestRow(world.db);
}

function fixRequestRow(db) {
  const rows = db.rows("SELECT * FROM fix_requests WHERE report_id = ?", REPORT_ID);
  assert.equal(rows.length, 1, "exactly one fix request for the report");
  return rows[0];
}

function queueItem(db) {
  return db.rows("SELECT * FROM repair_queue_items WHERE report_id = ?", REPORT_ID)[0];
}

function paymentData(fixRequest, item, overrides = {}) {
  return {
    payment_id: "pay_1",
    checkout_session_id: fixRequest.checkout_session_id,
    status: "succeeded",
    total_amount: 9900,
    currency: "USD",
    brand_id: "brand-1",
    customer: { email: OWNER },
    product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
    metadata: {
      product_key: "seofixkit_fix_pack",
      fix_request_id: fixRequest.id,
      report_id: REPORT_ID,
      repair_issue_id: item.issue_id,
      repair_queue_item_id: item.id,
      repair_title: item.title
    },
    ...overrides
  };
}

function subscriptionData(overrides = {}) {
  return {
    subscription_id: "sub_1",
    status: "active",
    brand_id: "brand-1",
    customer: { email: OWNER },
    product_cart: [{ product_id: "pdt_monitoring", quantity: 1 }],
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    metadata: {
      product_key: "seofixkit_proof_monitoring",
      offer_key: "proof_monitoring",
      owner_email: OWNER,
      target_host: "example.com",
      site_claim_id: "site-claim-1",
      audit_schedule_id: ""
    },
    ...overrides
  };
}

function databaseSnapshot(db) {
  const tables = db
    .rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((row) => row.name);
  return Object.fromEntries(tables.map((table) => [table, db.rows(`SELECT * FROM "${table}" ORDER BY rowid`)]));
}

function paymentState(db) {
  return {
    fixRequests: db.rows("SELECT * FROM fix_requests ORDER BY id"),
    fixRequestEvents: db.rows("SELECT * FROM fix_request_events ORDER BY created_at, id"),
    webhookEvents: db.rows("SELECT * FROM dodo_webhook_events ORDER BY webhook_id"),
    entitlements: db.rows("SELECT * FROM offer_entitlements ORDER BY id"),
    entitlementEvents: db.rows("SELECT * FROM offer_entitlement_events ORDER BY created_at, id")
  };
}

test("logged-in owner starts Fix Pack checkout from a saved report", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(
      world.env,
      apiRequest("/api/beta/fix-request", {
        method: "POST",
        token,
        body: { reportId: REPORT_ID, note: "Title first." }
      })
    ),
    calls
  }));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mode, "checkout");
  assert.equal(response.body.checkoutUrl, DODO_CHECKOUT_URL);
  assert.equal(response.body.request.status, "checkout_created");

  const fixRequest = fixRequestRow(world.db);
  const item = queueItem(world.db);
  assert.equal(fixRequest.owner_email, OWNER);
  assert.equal(fixRequest.target_host, "example.com");
  assert.equal(fixRequest.status, "checkout_created");
  assert.equal(fixRequest.checkout_session_id, "cs_test_1");
  assert.equal(fixRequest.checkout_url, DODO_CHECKOUT_URL);
  assert.equal(fixRequest.product_id, "pdt_fix_pack");
  assert.equal(fixRequest.note, "Title first.");
  assert.equal(fixRequest.paid_at, null);
  assert.equal(response.body.request.id, fixRequest.id);
  assert.equal(response.body.selectedRepair.queueItemId, item.id);
  assert.equal(item.issue_id, "issue-1");

  const checkouts = dodoCheckoutCalls(calls);
  assert.equal(checkouts.length, 1);
  const [checkout] = checkouts;
  assert.equal(checkout.method, "POST");
  assert.equal(checkout.headers.get("authorization"), "Bearer dodo-test-key");
  assert.deepEqual(checkout.body.product_cart, [{ product_id: "pdt_fix_pack", quantity: 1 }]);
  assert.deepEqual(checkout.body.customer, { email: OWNER });
  assert.equal(checkout.body.metadata.product_key, "seofixkit_fix_pack");
  assert.equal(checkout.body.metadata.fix_request_id, fixRequest.id);
  assert.equal(checkout.body.metadata.report_id, REPORT_ID);
  assert.equal(checkout.body.metadata.target_host, "example.com");
  assert.equal(checkout.body.metadata.repair_issue_id, "issue-1");
  assert.equal(checkout.body.metadata.repair_queue_item_id, item.id);
  const returnUrl = new URL(checkout.body.return_url);
  assert.equal(returnUrl.origin, ORIGIN);
  assert.equal(returnUrl.pathname, `/beta/reports/${REPORT_ID}`);
  assert.equal(returnUrl.searchParams.get("fixRequestId"), fixRequest.id);

  const events = world.db.rows(
    "SELECT event, to_status FROM fix_request_events WHERE fix_request_id = ?",
    fixRequest.id
  );
  assert.deepEqual(events, [{ event: "created", to_status: "new" }]);
});

test("a second checkout click reuses the fresh Dodo session instead of creating another", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  await startFixPackCheckout(world, token);

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } })
    ),
    calls
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.mode, "checkout");
  assert.equal(response.body.checkoutUrl, DODO_CHECKOUT_URL);
  assert.equal(dodoCheckoutCalls(calls).length, 0);
  assert.equal(world.db.rows("SELECT id FROM fix_requests").length, 1);
});

test("Fix Pack checkout requires a session and the owner's own report", async () => {
  const world = createWorld();
  arrangeSavedReport(world.db, "someone-else@example.com");
  const strangerToken = await arrangeOwnerSession(world.db, OWNER);

  await withDodo(async (calls) => {
    const anonymous = await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", body: { reportId: REPORT_ID } })
    );
    assert.equal(anonymous.status, 401);

    const notOwner = await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token: strangerToken, body: { reportId: REPORT_ID } })
    );
    assert.equal(notOwner.status, 404);
    assert.equal(notOwner.body.error, "Report not found.");
    assert.equal(calls.length, 0);
  });
  assert.equal(world.db.rows("SELECT id FROM fix_requests").length, 0);
});

test("Fix Pack checkout fails closed without a Dodo call when the product id is missing", async () => {
  const world = createWorld({ DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: undefined });
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } })
    ),
    calls
  }));

  assert.equal(response.status, 200);
  assert.equal(response.body.mode, "request");
  assert.equal(response.body.checkoutAvailable, false);
  assert.equal(response.body.checkoutUrl, undefined);
  assert.match(response.body.message, /Checkout is not open yet/);
  assert.equal(calls.length, 0, "no outgoing Dodo call");

  const fixRequest = fixRequestRow(world.db);
  assert.equal(fixRequest.status, "new");
  assert.equal(fixRequest.checkout_session_id, null);
  assert.equal(fixRequest.checkout_url, null);
});

test("signed payment.succeeded marks the fix request paid, and a replay is deduped", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const payload = { type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db)) };

  const first = await withDodo(() => send(world.env, webhookRequest(payload, "wh_paid_1")));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.received, true);
  assert.equal(first.body.status, "processed");
  assert.equal(first.body.paid, true);
  assert.equal(first.body.fixRequestId, fixRequest.id);

  const paid = fixRequestRow(world.db);
  assert.equal(paid.status, "paid");
  assert.equal(paid.payment_id, "pay_1");
  assert.equal(paid.payment_amount, 9900);
  assert.equal(paid.payment_currency, "USD");
  assert.equal(paid.payment_customer_email, OWNER);
  assert.equal(paid.dodo_brand_id, "brand-1");
  assert.ok(paid.paid_at);
  assert.ok(paid.due_at > paid.paid_at);

  const ledger = world.db.rows("SELECT * FROM dodo_webhook_events");
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].webhook_id, "wh_paid_1");
  assert.equal(ledger[0].event_type, "payment.succeeded");
  assert.equal(ledger[0].status, "processed");
  assert.equal(ledger[0].payment_id, "pay_1");
  assert.equal(ledger[0].fix_request_id, fixRequest.id);
  const paidEvents = world.db.rows(
    "SELECT * FROM fix_request_events WHERE fix_request_id = ? AND event = 'payment_succeeded'",
    fixRequest.id
  );
  assert.equal(paidEvents.length, 1);

  const before = paymentState(world.db);
  const replay = await withDodo(() => send(world.env, webhookRequest(payload, "wh_paid_1")));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.received, true);
  assert.equal(replay.body.duplicate, true);
  assert.deepEqual(paymentState(world.db), before, "replay changed nothing");

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } })
    ),
    calls
  }));
  assert.equal(response.status, 200);
  assert.equal(response.body.mode, "paid");
  assert.equal(response.body.checkoutUrl, undefined);
  assert.equal(dodoCheckoutCalls(calls).length, 0);
});

test("unsigned, wrong-secret and stale webhooks are rejected with zero database changes", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const payload = { type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db)) };

  const scenarios = [
    ["unsigned", webhookRequest(payload, "wh_unsigned", { signed: false })],
    [
      "wrong secret",
      webhookRequest(payload, "wh_wrong_secret", { secret: `whsec_${randomBytes(24).toString("base64")}` })
    ],
    ["stale timestamp", webhookRequest(payload, "wh_stale", { timestamp: Math.floor(Date.now() / 1000) - 60 * 60 })],
    ["future timestamp", webhookRequest(payload, "wh_future", { timestamp: Math.floor(Date.now() / 1000) + 60 * 60 })]
  ];
  for (const [label, request] of scenarios) {
    const before = databaseSnapshot(world.db);
    const response = await withDodo(() => send(world.env, request));
    assert.equal(response.status, 400, label);
    assert.equal(response.body.error, "Invalid signature.", label);
    assert.deepEqual(databaseSnapshot(world.db), before, `${label}: database changed`);
  }
  assert.equal(fixRequestRow(world.db).status, "checkout_created");

  const signed = webhookRequest(payload, "wh_tampered");
  const tampered = new Request(signed.url, {
    method: "POST",
    headers: signed.headers,
    body: JSON.stringify({ ...payload, data: { ...payload.data, total_amount: 1 } })
  });
  const before = databaseSnapshot(world.db);
  const response = await withDodo(() => send(world.env, tampered));
  assert.equal(response.status, 400);
  assert.deepEqual(databaseSnapshot(world.db), before);
});

test("webhooks are refused outright when the webhook secret is not configured", async () => {
  const world = createWorld({ DODO_SEOFIXKIT_WEBHOOK_SECRET: undefined });
  const before = databaseSnapshot(world.db);
  const response = await withDodo(() =>
    send(world.env, webhookRequest({ type: "payment.succeeded", data: {} }, "wh_no_secret"))
  );
  assert.equal(response.status, 503);
  assert.deepEqual(databaseSnapshot(world.db), before);
});

test("payment.failed moves an unpaid checkout to payment_failed", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const payload = {
    type: "payment.failed",
    data: paymentData(fixRequest, queueItem(world.db), { payment_id: "pay_failed_1", status: "failed" })
  };

  const response = await withDodo(() => send(world.env, webhookRequest(payload, "wh_failed_1")));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, "processed");
  assert.equal(response.body.paid, false);
  const row = fixRequestRow(world.db);
  assert.equal(row.status, "payment_failed");
  assert.equal(row.payment_id, "pay_failed_1");
  assert.equal(row.paid_at, null);
  assert.equal(world.db.rows("SELECT status FROM dodo_webhook_events")[0].status, "processed");
});

test("payment.failed arriving after payment does not un-pay the fix request", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const item = queueItem(world.db);
  await withDodo(() =>
    send(world.env, webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, item) }, "wh_paid"))
  );

  const late = { type: "payment.failed", data: paymentData(fixRequest, item, { status: "failed" }) };
  const response = await withDodo(() => send(world.env, webhookRequest(late, "wh_late_failed")));

  assert.equal(response.status, 200);
  assert.equal(fixRequestRow(world.db).status, "paid");
});

test("refund.succeeded moves a paid fix request to refunded and closes checkout", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const item = queueItem(world.db);
  await withDodo(() =>
    send(world.env, webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, item) }, "wh_paid"))
  );

  const foreign = {
    type: "refund.succeeded",
    data: {
      refund_id: "ref_x",
      payment_id: "pay_other",
      total_amount: 9900,
      currency: "USD",
      metadata: { fix_request_id: fixRequest.id }
    }
  };
  const ignored = await withDodo(() => send(world.env, webhookRequest(foreign, "wh_refund_foreign")));
  assert.equal(ignored.status, 200);
  assert.equal(ignored.body.reason, "payment_id_mismatch");
  assert.equal(fixRequestRow(world.db).status, "paid");

  const refund = {
    type: "refund.succeeded",
    data: {
      refund_id: "ref_1",
      payment_id: "pay_1",
      total_amount: 9900,
      currency: "USD",
      metadata: { fix_request_id: fixRequest.id }
    }
  };
  const response = await withDodo(() => send(world.env, webhookRequest(refund, "wh_refund_1")));

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.refunded, true);
  const row = fixRequestRow(world.db);
  assert.equal(row.status, "refunded");
  assert.equal(row.refund_id, "ref_1");
  assert.equal(row.refund_amount, 9900);
  assert.equal(row.refund_currency, "USD");
  assert.ok(row.refunded_at);

  const { response: retry, calls } = await withDodo(async (calls) => ({
    response: await send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } })
    ),
    calls
  }));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.mode, "refunded");
  assert.equal(retry.body.checkoutAvailable, false);
  assert.equal(dodoCheckoutCalls(calls).length, 0);
});

test("dispute events move a paid fix request to disputed", async () => {
  for (const eventType of ["dispute.opened", "dispute.lost"]) {
    const world = createWorld();
    const token = await arrangeOwnerSession(world.db);
    arrangeSavedReport(world.db);
    const fixRequest = await startFixPackCheckout(world, token);
    await withDodo(() =>
      send(
        world.env,
        webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db)) }, "wh_paid")
      )
    );

    const dispute = {
      type: eventType,
      data: { dispute_id: "dsp_1", payment_id: "pay_1", metadata: { fix_request_id: fixRequest.id } }
    };
    const response = await withDodo(() => send(world.env, webhookRequest(dispute, `wh_${eventType}`)));

    assert.equal(response.status, 200, `${eventType}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.disputed, true, eventType);
    const row = fixRequestRow(world.db);
    assert.equal(row.status, "disputed", eventType);
    assert.equal(row.dispute_event, eventType);
    assert.ok(row.disputed_at, eventType);
  }
});

test("billing summary lists the owner's paid Fix Pack", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  await withDodo(() =>
    send(
      world.env,
      webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db)) }, "wh_paid")
    )
  );

  const summary = await withDodo(() => send(world.env, apiRequest("/api/billing/summary", { token })));
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.owner.email, OWNER);
  assert.equal(summary.body.provider.checkoutReady, true);
  assert.equal(summary.body.requests.length, 1);
  assert.equal(summary.body.requests[0].id, fixRequest.id);
  assert.equal(summary.body.requests[0].status, "paid");
  assert.equal(summary.body.payments.length, 1);

  const anonymous = await withDodo(() => send(world.env, apiRequest("/api/billing/summary")));
  assert.equal(anonymous.status, 401);
});

test("Proof Monitoring: checkout, activation once, cancellation, and billing summary", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeVerifiedSite(world.db);

  const { response: checkout, calls } = await withDodo(
    async (calls) => ({
      response: await send(world.env, apiRequest("/api/beta/monitoring-checkout", { method: "POST", token, body: {} })),
      calls
    }),
    { sessionId: "cs_monitoring_1" }
  );
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  assert.equal(checkout.body.mode, "checkout");
  assert.equal(checkout.body.checkoutUrl, DODO_CHECKOUT_URL);
  assert.equal(checkout.body.target.targetHost, "example.com");
  const monitoringCheckouts = dodoCheckoutCalls(calls);
  assert.equal(monitoringCheckouts.length, 1);
  assert.deepEqual(monitoringCheckouts[0].body.product_cart, [{ product_id: "pdt_monitoring", quantity: 1 }]);
  assert.deepEqual(monitoringCheckouts[0].body.metadata, {
    product_key: "seofixkit_proof_monitoring",
    offer_key: "proof_monitoring",
    owner_email: OWNER,
    target_host: "example.com",
    site_claim_id: "site-claim-1",
    audit_schedule_id: ""
  });
  assert.equal(world.db.rows("SELECT id FROM offer_entitlements").length, 0, "no access before the webhook");

  const beforeSummary = await withDodo(() => send(world.env, apiRequest("/api/billing/summary", { token })));
  assert.equal(beforeSummary.status, 200);
  assert.notEqual(beforeSummary.body.monitoring.status, "active");
  assert.deepEqual(beforeSummary.body.subscriptions, []);
  assert.equal(beforeSummary.body.subscriptionState.status, "available");

  const active = { type: "subscription.active", data: subscriptionData() };
  const activated = await withDodo(() => send(world.env, webhookRequest(active, "wh_sub_active")));
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  assert.equal(activated.body.status, "processed");
  assert.equal(activated.body.entitlementStatus, "active");
  const replay = await withDodo(() => send(world.env, webhookRequest(active, "wh_sub_active")));
  assert.equal(replay.body.duplicate, true);
  const renewed = await withDodo(() =>
    send(world.env, webhookRequest({ type: "subscription.renewed", data: subscriptionData() }, "wh_sub_renewed"))
  );
  assert.equal(renewed.status, 200);

  const entitlements = world.db.rows("SELECT * FROM offer_entitlements");
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].owner_email, OWNER);
  assert.equal(entitlements[0].offer_key, "proof_monitoring");
  assert.equal(entitlements[0].status, "active");
  assert.equal(entitlements[0].provider, "dodo");
  assert.equal(entitlements[0].product_id, "pdt_monitoring");
  assert.equal(entitlements[0].subscription_id, "sub_1");
  assert.equal(entitlements[0].current_period_end, "2026-11-01T00:00:00.000Z");
  assert.equal(entitlements[0].revoked_at, null);

  const activeSummary = await withDodo(() => send(world.env, apiRequest("/api/billing/summary", { token })));
  assert.equal(activeSummary.body.monitoring.status, "active");
  assert.equal(activeSummary.body.subscriptionState.status, "active");
  assert.equal(activeSummary.body.subscriptions.length, 1);
  assert.equal(activeSummary.body.subscriptions[0].offerKey, "proof_monitoring");
  assert.equal(activeSummary.body.subscriptions[0].currentPeriodEnd, "2026-11-01T00:00:00.000Z");

  const { response: again, calls: againCalls } = await withDodo(async (calls) => ({
    response: await send(world.env, apiRequest("/api/beta/monitoring-checkout", { method: "POST", token, body: {} })),
    calls
  }));
  assert.equal(again.status, 200);
  assert.equal(again.body.mode, "active");
  assert.equal(again.body.checkoutAvailable, false);
  assert.equal(dodoCheckoutCalls(againCalls).length, 0);

  const cancelled = { type: "subscription.cancelled", data: subscriptionData({ status: "cancelled" }) };
  const revoked = await withDodo(() => send(world.env, webhookRequest(cancelled, "wh_sub_cancelled")));
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.entitlementStatus, "cancelled");
  const afterCancel = world.db.rows("SELECT * FROM offer_entitlements");
  assert.equal(afterCancel.length, 1);
  assert.equal(afterCancel[0].status, "cancelled");
  assert.ok(afterCancel[0].revoked_at);

  const cancelledSummary = await withDodo(() => send(world.env, apiRequest("/api/billing/summary", { token })));
  assert.notEqual(cancelledSummary.body.monitoring.status, "active");
  assert.deepEqual(cancelledSummary.body.subscriptions, []);

  const stale = await withDodo(() =>
    send(world.env, webhookRequest({ type: "subscription.active", data: subscriptionData() }, "wh_sub_active_late"))
  );
  assert.equal(stale.status, 200);
  assert.equal(world.db.rows("SELECT status FROM offer_entitlements")[0].status, "cancelled");

  const events = world.db.rows("SELECT event FROM offer_entitlement_events WHERE owner_email = ?", OWNER);
  assert.ok(events.some((row) => row.event === "subscription_active"));
  assert.ok(events.some((row) => row.event === "subscription_inactive"));
});

test("subscription webhook for a different product grants nothing", async () => {
  const world = createWorld();
  const payload = {
    type: "subscription.active",
    data: subscriptionData({ product_cart: [{ product_id: "pdt_something_else", quantity: 1 }] })
  };
  const response = await withDodo(() => send(world.env, webhookRequest(payload, "wh_sub_wrong_product")));
  assert.equal(response.status, 200);
  assert.equal(world.db.rows("SELECT id FROM offer_entitlements WHERE revoked_at IS NULL").length, 0);
});

test("Proof Monitoring checkout requires a verified site", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(world.env, apiRequest("/api/beta/monitoring-checkout", { method: "POST", token, body: {} })),
    calls
  }));

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "MONITORING_SITE_REQUIRED");
  assert.equal(response.body.checkoutAvailable, false);
  assert.equal(dodoCheckoutCalls(calls).length, 0);
});

test("Proof Monitoring checkout fails closed without a Dodo call when the product id is missing", async () => {
  const world = createWorld({ DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: undefined });
  const token = await arrangeOwnerSession(world.db);
  arrangeVerifiedSite(world.db);
  const before = databaseSnapshot(world.db);

  const { response, calls } = await withDodo(async (calls) => ({
    response: await send(world.env, apiRequest("/api/beta/monitoring-checkout", { method: "POST", token, body: {} })),
    calls
  }));

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "MONITORING_CHECKOUT_NOT_CONFIGURED");
  assert.equal(response.body.checkoutAvailable, false);
  assert.deepEqual(response.body.missing, ["productId"]);
  assert.equal(response.body.checkoutUrl, undefined);
  assert.equal(calls.length, 0, "no outgoing Dodo call");
  const after = databaseSnapshot(world.db);
  delete before.beta_sessions;
  delete after.beta_sessions;
  assert.deepEqual(after, before);
});

// ---------- Money safety regressions ----------

const ADMIN = "admin@ops.test";

function createAlertingWorld() {
  const sent = [];
  const world = createWorld({
    EMAIL: {
      async send(message) {
        sent.push(message);
        return { messageId: `msg_${sent.length}` };
      }
    },
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
    SEOFIXKIT_ADMIN_EMAIL: ADMIN
  });
  return { ...world, sent };
}

function adminAlerts(world, reason) {
  return world.sent.filter((message) => message.to === ADMIN && message.subject.startsWith(`Billing alert: ${reason}`));
}

function webhookRow(db, webhookId) {
  return db.rows("SELECT * FROM dodo_webhook_events WHERE webhook_id = ?", webhookId)[0];
}

async function paidFixPack(world, token, overrides = {}) {
  const fixRequest = await startFixPackCheckout(world, token);
  const item = queueItem(world.db);
  const paid = await withDodo(() =>
    send(
      world.env,
      webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, item, overrides) }, "wh_paid")
    )
  );
  assert.equal(paid.body.status, "processed", JSON.stringify(paid.body));
  return { fixRequest, item };
}

// A Dodo fake that answers slowly and hands out a new session per call, so overlapping requests overlap.
async function withSlowDodo(callback) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (url === "https://test.dodopayments.com/checkouts/preview") {
      return Response.json({ display_price: "$99.00", currency: "USD", total_amount: 9900 });
    }
    if (url === "https://test.dodopayments.com/checkouts") {
      const n = dodoCheckoutCalls(calls).length;
      return Response.json({ checkout_url: `https://test.dodopayments.com/session/cs_${n}`, session_id: `cs_${n}` });
    }
    return new Response("unexpected", { status: 599 });
  };
  try {
    return { result: await callback(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function refundEvent(paymentId, refundId, extra = {}) {
  return {
    type: "refund.succeeded",
    data: { payment_id: paymentId, refund_id: refundId, amount: 9900, currency: "USD", ...extra }
  };
}

test("concurrent Fix Pack checkout clicks create exactly one Dodo session", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);

  const { result, calls } = await withSlowDodo(() =>
    Promise.all(
      [1, 2, 3].map(() =>
        send(world.env, apiRequest("/api/beta/fix-request", { method: "POST", token, body: { reportId: REPORT_ID } }))
      )
    )
  );

  assert.equal(dodoCheckoutCalls(calls).length, 1, "one Dodo checkout session");
  const row = fixRequestRow(world.db);
  for (const response of result) {
    if (response.status === 200) assert.equal(response.body.checkoutUrl, row.checkout_url);
    else {
      assert.equal(response.status, 409);
      assert.equal(response.body.code, "CHECKOUT_IN_PROGRESS");
    }
  }
  assert.ok(result.some((response) => response.status === 200));
  assert.equal(row.checkout_lock_until, null, "lock released once the session is saved");
  assert.equal(row.expected_amount, 9900);
  assert.equal(row.expected_currency, "USD");
  assert.deepEqual(dodoCheckoutCalls(calls)[0].body.feature_flags, { allow_discount_code: false });
});

test("a second distinct payment keeps the original, is recorded for refund, and alerts the admin", async () => {
  const world = createAlertingWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const { fixRequest, item } = await paidFixPack(world, token, { payment_id: "pay_A" });

  const second = await withDodo(() =>
    send(
      world.env,
      webhookRequest(
        {
          type: "payment.succeeded",
          data: paymentData(fixRequest, item, { payment_id: "pay_B", checkout_session_id: "cs_other_tab" })
        },
        "wh_pay_B"
      )
    )
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.reason, "duplicate_payment_needs_refund");
  let row = fixRequestRow(world.db);
  assert.equal(row.status, "paid");
  assert.equal(row.payment_id, "pay_A", "original payment kept");
  const webhook = webhookRow(world.db, "wh_pay_B");
  assert.equal(webhook.status, "error");
  assert.match(webhook.error, /^duplicate_payment_needs_refund/);
  const payments = world.db.rows("SELECT payment_id, role, status FROM fix_request_payments ORDER BY payment_id");
  assert.deepEqual(payments, [
    { payment_id: "pay_A", role: "primary", status: "paid" },
    { payment_id: "pay_B", role: "duplicate", status: "paid" }
  ]);
  assert.equal(adminAlerts(world, "duplicate_payment_needs_refund").length, 1);

  // Refunding the extra payment (no metadata) is matched and leaves the Fix Pack paid.
  const refundB = await withDodo(() => send(world.env, webhookRequest(refundEvent("pay_B", "ref_B"), "wh_ref_B")));
  assert.equal(refundB.body.duplicatePayment, true);
  assert.equal(webhookRow(world.db, "wh_ref_B").status, "processed");
  assert.equal(fixRequestRow(world.db).status, "paid");
  assert.equal(
    world.db.rows("SELECT status FROM fix_request_payments WHERE payment_id = 'pay_B'")[0].status,
    "refunded"
  );

  // Refunding the original still refunds the Fix Pack.
  await withDodo(() => send(world.env, webhookRequest(refundEvent("pay_A", "ref_A"), "wh_ref_A")));
  row = fixRequestRow(world.db);
  assert.equal(row.status, "refunded");
  assert.equal(row.refund_id, "ref_A");
});

test("a payment after a refund (second tab) is flagged for refund instead of silently accepted", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const { fixRequest, item } = await paidFixPack(world, token);
  await withDodo(() => send(world.env, webhookRequest(refundEvent("pay_1", "r"), "wh_r")));
  await withDodo(() =>
    send(
      world.env,
      webhookRequest(
        {
          type: "payment.succeeded",
          data: paymentData(fixRequest, item, { payment_id: "pay_2", checkout_session_id: "cs_x" })
        },
        "wh_p2"
      )
    )
  );
  const row = fixRequestRow(world.db);
  assert.equal(row.status, "refunded");
  assert.equal(row.payment_id, "pay_1");
  assert.equal(webhookRow(world.db, "wh_p2").status, "error");
});

test("refunds and disputes that match no recorded payment are errors, not ignored", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  await paidFixPack(world, token);
  const unknown = await withDodo(() =>
    send(
      world.env,
      webhookRequest({ type: "dispute.opened", data: { payment_id: "pay_unknown", dispute_id: "dp_x" } }, "wh_dsp_x")
    )
  );
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.reason, "fix_request_not_found");
  const row = webhookRow(world.db, "wh_dsp_x");
  assert.equal(row.status, "error");
  assert.match(row.error, /unmatched_refund_or_dispute/);
  assert.equal(fixRequestRow(world.db).status, "paid");
});

test("a refund that arrives before payment.succeeded is applied once the payment lands", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  const fixRequest = await startFixPackCheckout(world, token);
  const item = queueItem(world.db);
  const early = await withDodo(() => send(world.env, webhookRequest(refundEvent("pay_1", "ref_1"), "wh_ref")));
  assert.equal(early.status, 200);
  assert.equal(webhookRow(world.db, "wh_ref").status, "error", "kept visible and retryable");

  const paid = await withDodo(() =>
    send(world.env, webhookRequest({ type: "payment.succeeded", data: paymentData(fixRequest, item) }, "wh_pay"))
  );
  assert.equal(paid.body.paid, false);
  assert.equal(paid.body.refunded, true);
  assert.equal(webhookRow(world.db, "wh_ref").status, "processed");

  const retry = await withDodo(() => send(world.env, webhookRequest(refundEvent("pay_1", "ref_1"), "wh_ref")));
  assert.equal(retry.body.duplicate, true);
  const row = fixRequestRow(world.db);
  assert.equal(row.status, "refunded");
  assert.equal(row.refund_id, "ref_1");
  assert.equal(
    world.db.rows("SELECT id FROM fix_request_notifications WHERE event = 'payment_succeeded'").length,
    0,
    "no payment receipt for a payment that is already refunded"
  );
});

test("a clearly wrong amount or currency is recorded but flagged amount_mismatch", async () => {
  for (const [label, overrides, flagged] of [
    ["wrong currency", { total_amount: 1, currency: "JPY" }, true],
    ["under half the price", { total_amount: 4000, currency: "USD" }, true],
    ["tax on top", { total_amount: 11880, currency: "USD" }, false],
    ["small regional discount", { total_amount: 8000, currency: "USD" }, false]
  ]) {
    const world = createAlertingWorld();
    const token = await arrangeOwnerSession(world.db);
    arrangeSavedReport(world.db);
    const fixRequest = await startFixPackCheckout(world, token);
    assert.equal(fixRequest.expected_amount, 9900, label);
    const response = await withDodo(() =>
      send(
        world.env,
        webhookRequest(
          { type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db), overrides) },
          "wh_amount"
        )
      )
    );
    const row = fixRequestRow(world.db);
    assert.equal(row.status, "paid", `${label}: access is never blocked`);
    assert.equal(row.payment_amount, overrides.total_amount, label);
    const webhook = webhookRow(world.db, "wh_amount");
    if (flagged) {
      assert.equal(webhook.status, "error", label);
      assert.match(webhook.error, /^amount_mismatch/, label);
      assert.equal(response.body.reason, "amount_mismatch", label);
      assert.equal(adminAlerts(world, "amount_mismatch").length, 1, label);
    } else {
      assert.equal(webhook.status, "processed", label);
    }
  }
});

test("customer email, product and quantity mismatches on a paid payment are errors with an admin alert", async () => {
  for (const [reason, overrides] of [
    ["customer_email_mismatch", { customer: { email: "billing@client.com" } }],
    ["product_mismatch", { product_cart: [{ product_id: "pdt_other", quantity: 1 }] }],
    ["product_quantity_mismatch", { product_cart: [{ product_id: "pdt_fix_pack", quantity: 2 }] }]
  ]) {
    const world = createAlertingWorld();
    const token = await arrangeOwnerSession(world.db);
    arrangeSavedReport(world.db);
    const fixRequest = await startFixPackCheckout(world, token);
    const response = await withDodo(() =>
      send(
        world.env,
        webhookRequest(
          { type: "payment.succeeded", data: paymentData(fixRequest, queueItem(world.db), overrides) },
          "wh_identity"
        )
      )
    );
    assert.equal(response.body.reason, reason);
    const webhook = webhookRow(world.db, "wh_identity");
    assert.equal(webhook.status, "error", reason);
    assert.equal(webhook.error, `payment_identity_rejected: ${reason}`);
    assert.equal(fixRequestRow(world.db).status, "checkout_created", reason);
    assert.equal(adminAlerts(world, reason).length, 1, reason);
  }
});

test("a partial refund keeps the Fix Pack and records the amount and reason", async () => {
  const world = createWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  await paidFixPack(world, token);
  const response = await withDodo(() =>
    send(
      world.env,
      webhookRequest(
        refundEvent("pay_1", "ref_p", { amount: 1000, is_partial: true, reason: "Goodwill credit" }),
        "wh_partial"
      )
    )
  );
  assert.equal(response.body.partialRefund, true);
  const row = fixRequestRow(world.db);
  assert.equal(row.status, "paid");
  assert.equal(row.refund_amount, 1000);
  assert.equal(row.refund_currency, "USD");
  assert.equal(row.refund_reason, "Goodwill credit");
  assert.equal(row.refunded_at, null);
});

test("dispute won, cancelled or expired restores the status from before the dispute", async () => {
  for (const [resolution, before] of [
    ["dispute.won", "paid"],
    ["dispute.cancelled", "in_progress"],
    ["dispute.expired", "paid"]
  ]) {
    const world = createWorld();
    const token = await arrangeOwnerSession(world.db);
    arrangeSavedReport(world.db);
    await paidFixPack(world, token);
    world.db.sqlite.prepare("UPDATE fix_requests SET status = ?").run(before);
    const dispute = { payment_id: "pay_1", dispute_id: "dp_1" };
    await withDodo(() => send(world.env, webhookRequest({ type: "dispute.opened", data: dispute }, "wh_d1")));
    assert.equal(fixRequestRow(world.db).status, "disputed", resolution);
    const resolved = await withDodo(() =>
      send(world.env, webhookRequest({ type: resolution, data: dispute }, "wh_d2"))
    );
    assert.equal(resolved.body.disputeResolved, true, resolution);
    const row = fixRequestRow(world.db);
    assert.equal(row.status, before, resolution);
    assert.equal(row.dispute_event, resolution);
    assert.equal(webhookRow(world.db, "wh_d2").status, "processed", resolution);
  }
});

test("refund_failed has its own customer message", () => {
  const message = checkoutMessage("refund_failed", false);
  assert.notEqual(message, checkoutMessage("checkout_created", false));
  assert.match(message, /refund/i);
  assert.match(message, /support@seofixkit\.com/);
});

test("checkout endpoints allow about 10 attempts per account per hour", async () => {
  const world = createWorld({ DODO_SEOFIXKIT_PRODUCT_REPAIR_SPRINT_ID: "pdt_sprint" });
  const token = await arrangeOwnerSession(world.db);
  arrangeSavedReport(world.db);
  arrangeVerifiedSite(world.db);
  for (const path of ["/api/beta/fix-request", "/api/beta/monitoring-checkout", "/api/beta/repair-sprint-checkout"]) {
    const statuses = [];
    await withSlowDodo(async () => {
      for (let i = 0; i < 11; i += 1) {
        const response = await send(
          world.env,
          apiRequest(path, { method: "POST", token, body: { reportId: REPORT_ID } })
        );
        statuses.push(response.status);
      }
    });
    assert.ok(
      statuses.slice(0, 10).every((status) => status !== 429),
      `${path}: ${statuses}`
    );
    assert.equal(statuses[10], 429, path);
  }
  const other = await arrangeOwnerSession(world.db, "other@example.com");
  const fresh = await withDodo(() =>
    send(
      world.env,
      apiRequest("/api/beta/fix-request", { method: "POST", token: other, body: { reportId: REPORT_ID } })
    )
  );
  assert.notEqual(fresh.status, 429, "the limit is per account");
});

test("monitoring checkout reuses the open session and a second live subscription is flagged", async () => {
  const world = createAlertingWorld();
  const token = await arrangeOwnerSession(world.db);
  arrangeVerifiedSite(world.db);
  const click = () => send(world.env, apiRequest("/api/beta/monitoring-checkout", { method: "POST", token, body: {} }));

  const { result, calls } = await withSlowDodo(async () => {
    const parallel = await Promise.all([click(), click()]);
    return [...parallel, await click()];
  });
  assert.equal(dodoCheckoutCalls(calls).length, 1, "one Dodo subscription checkout");
  const urls = new Set(result.filter((r) => r.status === 200).map((r) => r.body.checkoutUrl));
  assert.equal(urls.size, 1);
  assert.equal(result.at(-1).status, 200);
  assert.deepEqual(dodoCheckoutCalls(calls)[0].body.feature_flags, { allow_discount_code: false });

  await withDodo(() =>
    send(world.env, webhookRequest({ type: "subscription.active", data: subscriptionData() }, "wh_s1"))
  );
  const second = await withDodo(() =>
    send(
      world.env,
      webhookRequest({ type: "subscription.active", data: subscriptionData({ subscription_id: "sub_2" }) }, "wh_s2")
    )
  );
  assert.equal(second.body.reason, "duplicate_subscription_needs_cancel");
  const webhook = webhookRow(world.db, "wh_s2");
  assert.equal(webhook.status, "error");
  assert.match(webhook.error, /^duplicate_subscription_needs_cancel: sub_2/);
  assert.equal(world.db.rows("SELECT id FROM offer_entitlements").length, 1);
  assert.equal(adminAlerts(world, "duplicate_subscription_needs_cancel").length, 1);
});
