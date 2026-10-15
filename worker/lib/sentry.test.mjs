import assert from "node:assert/strict";
import test from "node:test";
import { getClient } from "@sentry/cloudflare";
import worker from "../index.js";
import { scrubEvent, sentryOptions, withErrorReporting } from "./sentry.js";

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
