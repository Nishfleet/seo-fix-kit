import assert from "node:assert/strict";
import test from "node:test";
import { getClient } from "@sentry/cloudflare";
import worker from "../index.js";
import {
  createEventCap,
  MAX_EVENTS_PER_WINDOW,
  resetSentryEventCap,
  scrubBreadcrumb,
  scrubEvent,
  sentryOptions,
  withErrorReporting
} from "./sentry.js";

const FAKE_DSN = "https://publickey@sentry.invalid/1";

function collectingCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
    passThroughOnException() {}
  };
}

function stubFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input?.url || input), body: init.body ? String(init.body) : "" });
    return new Response("{}", { status: 200 });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

function quietConsole() {
  const original = console.error;
  console.error = () => {};
  return () => (console.error = original);
}

test("without SENTRY_DSN every handler runs unwrapped and nothing is sent", async () => {
  const seen = {};
  const handlers = {
    fetch: (request, env, ctx) => {
      Object.assign(seen, { env, ctx });
      return new Response("ok");
    },
    scheduled: async () => "ran",
    queue: async () => "queued"
  };
  const wrapped = withErrorReporting(handlers);
  const env = { WAITLIST_DB: {} };
  const ctx = collectingCtx();
  const fetchStub = stubFetch();
  try {
    const response = await wrapped.fetch(new Request("https://seofixkit.test/"), env, ctx);
    assert.equal(await response.text(), "ok");
    assert.equal(seen.env, env, "env must not be proxied when reporting is off");
    assert.equal(seen.ctx, ctx, "ctx must not be wrapped when reporting is off");
    assert.equal(await wrapped.scheduled({ cron: "*/15 * * * *" }, env, ctx), "ran");
    assert.equal(await wrapped.queue({ queue: "q", messages: [] }, env, ctx), "queued");
    assert.equal(ctx.pending.length, 0);
    assert.equal(fetchStub.calls.length, 0);
    assert.equal(getClient(), undefined);
  } finally {
    fetchStub.restore();
  }
});

test("the Worker export keeps fetch, scheduled and queue handlers working without a DSN", async () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
  assert.equal(typeof worker.queue, "function");

  const health = await worker.fetch(new Request("https://seofixkit.test/api/health"), {}, collectingCtx());
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  await worker.scheduled({ cron: "*/15 * * * *", scheduledTime: Date.now() }, {}, collectingCtx());

  let acked = 0;
  await worker.queue(
    { queue: "seofixkit-audit-jobs", messages: [{ id: "m1", body: { kind: "unknown" }, ack: () => (acked += 1) }] },
    {},
    collectingCtx()
  );
  assert.equal(acked, 1);
});

test("with SENTRY_DSN a route error caught by the app error handler is reported without personal data", async () => {
  const restoreConsole = quietConsole();
  const fetchStub = stubFetch();
  try {
    const ctx = collectingCtx();
    const response = await worker.fetch(
      new Request("https://seofixkit.test/api/beta/session?email=owner@example.com", {
        headers: { cookie: "sfk_beta_session=secret-session-token", authorization: "Bearer secret-api-token" }
      }),
      {
        SENTRY_DSN: FAKE_DSN,
        WAITLIST_DB: {
          prepare() {
            throw new Error("lookup failed for owner@example.com");
          }
        }
      },
      ctx
    );
    assert.equal(response.status, 500);
    await Promise.all(ctx.pending);

    const sent = fetchStub.calls.filter((call) => call.url.includes("sentry.invalid"));
    assert.equal(sent.length, 1, "one error event reaches the DSN");
    assert.match(sent[0].body, /lookup failed for \[email\]/);
    assert.doesNotMatch(sent[0].body, /owner@example\.com|secret-session-token|secret-api-token|sfk_beta_session/);
  } finally {
    fetchStub.restore();
    restoreConsole();
  }
});

test("with SENTRY_DSN a failing cron task is reported", async () => {
  const restoreConsole = quietConsole();
  const fetchStub = stubFetch();
  try {
    const ctx = collectingCtx();
    const failingDb = {
      prepare() {
        throw new Error("cron store unavailable");
      },
      batch() {
        throw new Error("cron store unavailable");
      }
    };
    await assert.rejects(
      worker.scheduled(
        { cron: "*/15 * * * *", scheduledTime: Date.now() },
        { SENTRY_DSN: FAKE_DSN, WAITLIST_DB: failingDb },
        ctx
      ),
      /Scheduled tasks failed/
    );
    await Promise.all(ctx.pending);
    const sent = fetchStub.calls.filter((call) => call.url.includes("sentry.invalid"));
    assert.ok(sent.length >= 1, "cron failures reach the DSN");
    assert.ok(
      sent.every((call) => /scheduledTask/.test(call.body)),
      "each event is a task-level report"
    );
    assert.ok(
      sent.every((call) => !/Scheduled tasks failed/.test(call.body)),
      "the summary error is not sent again"
    );
  } finally {
    fetchStub.restore();
    restoreConsole();
  }
});

test("options keep personal data and tracing off", () => {
  const options = sentryOptions({ SENTRY_DSN: FAKE_DSN });
  assert.equal(options.dsn, FAKE_DSN);
  assert.equal(options.sendDefaultPii, false);
  assert.equal(options.tracesSampleRate, 0);
  assert.equal(sentryOptions({}).dsn, undefined);
});

test("scrubEvent strips bodies, cookies, auth headers, query strings, users and emails", () => {
  const event = scrubEvent({
    message: "Signup failed for jane.doe@example.com",
    user: { email: "jane.doe@example.com", ip_address: "203.0.113.9" },
    request: {
      url: "https://seofixkit.com/email/unsubscribe/abc123token?email=jane.doe@example.com",
      data: '{"email":"jane.doe@example.com"}',
      cookies: { sfk_beta_session: "token" },
      query_string: "email=jane.doe@example.com",
      headers: {
        Authorization: "Bearer token",
        Cookie: "sfk_beta_session=token",
        "X-Api-Key": "key",
        "User-Agent": "test-agent"
      }
    },
    exception: { values: [{ type: "Error", value: "No account for jane.doe@example.com" }] },
    breadcrumbs: [{ message: "console: sent mail to jane.doe@example.com" }]
  });

  assert.equal(event.user, undefined);
  assert.equal(event.request.data, undefined);
  assert.equal(event.request.cookies, undefined);
  assert.equal(event.request.query_string, undefined);
  assert.deepEqual(event.request.headers, { "User-Agent": "test-agent" });
  assert.equal(event.request.url, "https://seofixkit.com/email/unsubscribe/[redacted]");
  assert.doesNotMatch(JSON.stringify(event), /jane\.doe|abc123token/);
  assert.equal(event.exception.values[0].value, "No account for [email]");
});

test("scrubEvent hides client report share links in URLs, messages and breadcrumbs", () => {
  const event = scrubEvent({
    message: "Report render failed for https://seofixkit.com/r/share-secret-1 (pdf /r/share-secret-2.pdf)",
    request: { url: "https://seofixkit.com/r/share-secret-3/unlock" },
    breadcrumbs: [{ data: { url: "/r/share-secret-4" } }]
  });
  assert.equal(event.request.url, "https://seofixkit.com/r/[redacted]/unlock");
  assert.doesNotMatch(JSON.stringify(event), /share-secret/);
});

function failingSessionRequest(ctx, index, beforeThrow = () => {}) {
  return worker.fetch(
    new Request("https://seofixkit.test/api/beta/session", {
      headers: { cookie: "sfk_beta_session=storm-session-token" }
    }),
    {
      SENTRY_DSN: FAKE_DSN,
      WAITLIST_DB: {
        prepare() {
          beforeThrow();
          throw new Error(`lookup failed ${index}`);
        }
      }
    },
    ctx
  );
}

test("options never set up the Console integration and drop console breadcrumbs", () => {
  const options = sentryOptions({ SENTRY_DSN: FAKE_DSN });
  const kept = options.integrations([{ name: "Console" }, { name: "Dedupe" }, { name: "LinkedErrors" }]);
  assert.deepEqual(
    kept.map((integration) => integration.name),
    ["Dedupe", "LinkedErrors"]
  );
  assert.equal(options.beforeBreadcrumb({ category: "console", message: "sent mail to jane" }), null);
  assert.deepEqual(scrubBreadcrumb({ category: "app", level: "info", message: "Jane asked about pricing" }), {
    category: "app",
    level: "info"
  });
});

test("scrubEvent drops extra, custom contexts and breadcrumb text", () => {
  const event = scrubEvent({
    extra: { lead: "Jane Visitor, +1 415 555 0134" },
    contexts: {
      runtime: { name: "cloudflare" },
      cloud_resource: { "cloud.provider": "cloudflare" },
      culture: { timezone: "America/Los_Angeles" },
      trace: { trace_id: "t1", span_id: "s1", data: { "url.full": "https://seofixkit.com/?email=jane@example.com" } },
      customer: { name: "Jane Visitor" }
    },
    breadcrumbs: [
      { category: "console", level: "warning", message: "lead Jane Visitor" },
      { category: "fetch", type: "http", message: "POST for Jane", data: { method: "POST", url: "/r/share-secret-9" } },
      { category: "custom", message: "Jane Visitor asked a question" }
    ],
    exception: { values: [{ type: "TypeError", value: "boom", stacktrace: { frames: [{ function: "fetch" }] } }] }
  });
  assert.equal(event.extra, undefined);
  assert.deepEqual(event.contexts, {
    runtime: { name: "cloudflare", version: undefined },
    cloud_resource: { "cloud.provider": "cloudflare" },
    trace: { trace_id: "t1", span_id: "s1" }
  });
  assert.deepEqual(event.breadcrumbs, [
    { category: "fetch", type: "http", data: { method: "POST", url: "/r/[redacted]" } },
    { category: "custom" }
  ]);
  assert.deepEqual(event.exception.values[0], {
    type: "TypeError",
    value: "boom",
    stacktrace: { frames: [{ function: "fetch" }] }
  });
  assert.doesNotMatch(JSON.stringify(event), /Jane|555|share-secret|culture/);
});

test("with SENTRY_DSN a console line logged before an error never reaches Sentry", async () => {
  resetSentryEventCap();
  const restoreConsole = quietConsole();
  const originalWarn = console.warn;
  const fetchStub = stubFetch();
  try {
    const ctx = collectingCtx();
    const response = await failingSessionRequest(ctx, "console", () =>
      console.warn("lead from Jane Visitor, call +1 415 555 0134")
    );
    assert.equal(response.status, 500);
    await Promise.all(ctx.pending);
    const sent = fetchStub.calls.filter((call) => call.url.includes("sentry.invalid"));
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0].body, /Jane Visitor|555 0134|"category":"console"/);
  } finally {
    console.warn = originalWarn;
    fetchStub.restore();
    restoreConsole();
  }
});

test("with SENTRY_DSN a 500 storm sends at most the per-isolate cap of events", async () => {
  resetSentryEventCap();
  const restoreConsole = quietConsole();
  const fetchStub = stubFetch();
  try {
    const storm = MAX_EVENTS_PER_WINDOW + 10;
    const statuses = [];
    const ctx = collectingCtx();
    for (let i = 0; i < storm; i += 1) statuses.push((await failingSessionRequest(ctx, i)).status);
    await Promise.all(ctx.pending);
    assert.deepEqual(new Set(statuses), new Set([500]), "every request still gets its 500");
    const sent = fetchStub.calls.filter((call) => call.url.includes("sentry.invalid"));
    assert.equal(sent.length, MAX_EVENTS_PER_WINDOW);
  } finally {
    fetchStub.restore();
    restoreConsole();
    resetSentryEventCap();
  }
});

test("the event cap allows a fixed number per window and opens again in the next window", () => {
  let now = 1_000;
  const cap = createEventCap({ max: 3, windowMs: 60_000, now: () => now });
  assert.deepEqual([cap.allow(), cap.allow(), cap.allow(), cap.allow()], [true, true, true, false]);
  now += 59_999;
  assert.equal(cap.allow(), false);
  now += 1;
  assert.deepEqual([cap.allow(), cap.allow(), cap.allow(), cap.allow()], [true, true, true, false]);
});
