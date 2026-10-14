import assert from "node:assert/strict";
import test from "node:test";
import { hmacSha256Hex } from "./security.js";
import { cleanWebhookEvents, deliverApiWebhook, deliverApiWebhooks } from "./webhooks.js";

test("deliverApiWebhooks retries transient failure and keeps one event row", async () => {
  const env = fakeWebhookEnv();
  let fetchCalls = 0;
  const fetcher = async () => {
    fetchCalls += 1;
    return new Response("", { status: fetchCalls === 1 ? 503 : 200 });
  };

  await deliverApiWebhooks(
    env,
    "owner@example.com",
    "audit.completed",
    {
      audit: { audit_id: "audit-1", report_id: "report-1" }
    },
    {
      fetcher,
      resolvesToPrivateAddress: async () => false,
      sleep: async () => {}
    }
  );

  assert.equal(fetchCalls, 2);
  assert.equal(env.events.length, 1);
  assert.equal(env.events[0].status, "delivered");
  assert.equal(env.events[0].http_status, 200);
  assert.equal(env.webhooks[0].last_delivery_status, "delivered");
});

test("cleanWebhookEvents allows repair action lifecycle events", () => {
  assert.deepEqual(
    cleanWebhookEvents([
      "audit.completed",
      "repair_action.drafted",
      "repair_action.approved",
      "repair_action.applied",
      "repair_action.fixed",
      "repair_action.regressed",
      "unknown.event"
    ]),
    [
      "audit.completed",
      "repair_action.drafted",
      "repair_action.approved",
      "repair_action.applied",
      "repair_action.fixed",
      "repair_action.regressed"
    ]
  );
});

test("deliverApiWebhook does not retry non-transient client errors", async () => {
  let fetchCalls = 0;
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async () => {
      fetchCalls += 1;
      return new Response("", { status: 400 });
    },
    resolvesToPrivateAddress: async () => false,
    sleep: async () => {},
    maxAttempts: 3,
    timeoutMs: 1000,
    eventBudgetMs: 3000
  });

  assert.equal(fetchCalls, 1);
  assert.deepEqual(result, { status: "failed", httpStatus: 400, error: "HTTP 400" });
});

test("deliverApiWebhook records timeout failure", async () => {
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async (_url, options = {}) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    resolvesToPrivateAddress: async () => false,
    sleep: async () => {},
    maxAttempts: 1,
    timeoutMs: 1,
    eventBudgetMs: 1000
  });

  assert.equal(result.status, "failed");
  assert.equal(result.httpStatus, 0);
  assert.match(result.error, /timed out/);
});

test("deliverApiWebhook rechecks private DNS before retrying", async () => {
  let fetchCalls = 0;
  let resolverCalls = 0;
  const result = await deliverApiWebhook(fakeWebhookEnv(), fakeWebhook(), "audit.completed", "{}", {
    fetcher: async () => {
      fetchCalls += 1;
      return new Response("", { status: 503 });
    },
    resolvesToPrivateAddress: async () => {
      resolverCalls += 1;
      return resolverCalls > 1;
    },
    sleep: async () => {},
    maxAttempts: 3,
    timeoutMs: 1000,
    eventBudgetMs: 3000
  });

  assert.equal(fetchCalls, 1);
  assert.equal(resolverCalls, 2);
  assert.deepEqual(result, {
    status: "failed",
    httpStatus: 503,
    error: "Webhook host resolves to a private or internal address."
  });
});

test("deliverApiWebhooks refuses a host whose DNS resolves privately and records the failure without delivering", async () => {
  const env = fakeWebhookEnv();
  env.webhooks[0].url = "https://dns-private-webhook.example.com/seofixkit";
  let deliveries = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.origin === "https://cloudflare-dns.com" && url.pathname === "/dns-query") {
      const answer = url.searchParams.get("type") === "A" ? [{ type: 1, data: "127.0.0.1" }] : [];
      return new Response(JSON.stringify({ Answer: answer }), {
        status: 200,
        headers: { "content-type": "application/dns-json" }
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    await deliverApiWebhooks(
      env,
      "owner@example.com",
      "audit.completed",
      {},
      {
        fetcher: async () => {
          deliveries += 1;
          return new Response(null, { status: 204 });
        },
        sleep: async () => {}
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(deliveries, 0);
  assert.equal(env.events[0].status, "failed");
  assert.equal(env.webhooks[0].last_delivery_status, "failed");
  assert.match(env.webhooks[0].last_error, /private or internal/);
});

test("deliverApiWebhooks records a timed-out delivery on the webhook row", async () => {
  const env = fakeWebhookEnv();
  env.SEOFIXKIT_WEBHOOK_MAX_ATTEMPTS = "1";
  await deliverApiWebhooks(
    env,
    "owner@example.com",
    "audit.completed",
    {},
    {
      fetcher: async (_url, options = {}) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      resolvesToPrivateAddress: async () => false,
      sleep: async () => {}
    }
  );

  assert.equal(env.events[0].status, "failed");
  assert.equal(env.webhooks[0].last_delivery_status, "failed");
  assert.match(env.webhooks[0].last_error, /timed out/i);
});

test("deliverApiWebhooks signs each delivery with a verifiable t=,v1= HMAC header", async () => {
  const env = fakeWebhookEnv();
  const requests = [];
  await deliverApiWebhooks(
    env,
    "owner@example.com",
    "audit.completed",
    { audit: { audit_id: "audit-1" } },
    {
      fetcher: async (_url, options = {}) => {
        requests.push(options);
        return new Response(null, { status: 204 });
      },
      resolvesToPrivateAddress: async () => false,
      sleep: async () => {}
    }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers["x-seofixkit-event"], "audit.completed");
  const signature = requests[0].headers["x-seofixkit-signature"];
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature);
  assert.ok(match, signature);
  const secret = `whsec_${(await hmacSha256Hex("test-secret", "webhook-1")).slice(0, 32)}`;
  assert.equal(match[2], await hmacSha256Hex(secret, `${match[1]}.${requests[0].body}`));
});

function fakeWebhook() {
  return {
    id: "webhook-1",
    owner_email: "owner@example.com",
    url: "https://hooks.example.com/seo",
    events_json: JSON.stringify(["audit.completed"]),
    status: "active",
    revoked_at: null
  };
}

function fakeWebhookEnv() {
  const env = {
    SEOFIXKIT_API_WEBHOOK_SECRET: "test-secret",
    SEOFIXKIT_WEBHOOK_MAX_ATTEMPTS: "3",
    SEOFIXKIT_WEBHOOK_TIMEOUT_MS: "1000",
    SEOFIXKIT_WEBHOOK_EVENT_BUDGET_MS: "3000",
    webhooks: [fakeWebhook()],
    events: [],
    WAITLIST_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return statement(sql, values, env);
          }
        };
      },
      batch(statements) {
        return Promise.all(statements.map((item) => item.run()));
      }
    }
  };
  return env;
}

function statement(sql, values, env) {
  return {
    all: async () => {
      if (sql.includes("FROM api_webhooks")) return { results: env.webhooks };
      throw new Error(`Unexpected all SQL: ${sql}`);
    },
    run: async () => {
      if (sql.includes("INSERT INTO api_webhook_events")) {
        env.events.push({
          id: values[0],
          webhook_id: values[1],
          owner_email: values[2],
          event_type: values[3],
          audit_job_id: values[4],
          report_id: values[5],
          status: values[6],
          http_status: values[7],
          error: values[8],
          payload_json: values[9],
          created_at: values[10],
          delivered_at: values[11]
        });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE api_webhook_events")) {
        const failedUpdate = sql.includes("SET status = 'failed'");
        const event = env.events.find((row) => row.id === values[failedUpdate ? 2 : 4]);
        Object.assign(
          event,
          failedUpdate
            ? {
                status: "failed",
                error: values[0],
                delivered_at: values[1]
              }
            : {
                status: values[0],
                http_status: values[1],
                error: values[2],
                delivered_at: values[3]
              }
        );
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE api_webhooks")) {
        const failedUpdate = sql.includes("last_delivery_status = 'failed'");
        const webhook = env.webhooks.find((row) => row.id === values[failedUpdate ? 3 : 4]);
        Object.assign(
          webhook,
          failedUpdate
            ? {
                last_delivery_at: values[0],
                last_delivery_status: "failed",
                last_error: values[1],
                updated_at: values[2]
              }
            : {
                last_delivery_at: values[0],
                last_delivery_status: values[1],
                last_error: values[2],
                updated_at: values[3]
              }
        );
        return { meta: { changes: 1 } };
      }
      throw new Error(`Unexpected run SQL: ${sql}`);
    }
  };
}
