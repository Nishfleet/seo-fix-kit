import assert from "node:assert/strict";
import test from "node:test";
import { D1BackupWorkflow } from "./d1-backup-workflow.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeStep() {
  const names = [];
  return {
    names,
    do: async (name, fn) => {
      names.push(name);
      return fn();
    }
  };
}

function fakeEnv(overrides = {}) {
  const puts = [];
  return {
    puts,
    env: {
      ACCOUNT_ID: "account-1",
      DATABASE_ID: "database-1",
      D1_REST_API_TOKEN: "token-1",
      BACKUP_BUCKET: {
        put: async (key, body) => {
          puts.push({ key, body });
          return {};
        }
      },
      ...overrides
    }
  };
}

async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("D1 backup workflow polls the D1 export API and stores the dump in R2", async () => {
  const { env, puts } = fakeEnv();
  const step = fakeStep();
  const calls = [];

  await withFetch(
    async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        authorization: init?.headers?.get("authorization"),
        body: init?.body ? JSON.parse(init.body) : null
      });
      if (calls.length === 1) {
        return jsonResponse({ result: { at_bookmark: "bookmark-1" } });
      }
      if (calls.length === 2) {
        return jsonResponse({ result: { signed_url: "https://dump.example/d1.sql", filename: "export-1.sql" } });
      }
      return new Response("DUMP BYTES", { status: 200 });
    },
    async () => {
      const workflow = new D1BackupWorkflow({}, env);
      await workflow.run({}, step);
    }
  );

  assert.deepEqual(step.names, ["Start D1 export", "Store D1 export in R2"]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/account-1/d1/database/database-1/export");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].authorization, "Bearer token-1");
  assert.deepEqual(calls[0].body, { output_format: "polling" });
  assert.equal(calls[1].url, calls[0].url);
  assert.deepEqual(calls[1].body, { current_bookmark: "bookmark-1" });
  assert.equal(calls[2].url, "https://dump.example/d1.sql");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, "d1/export-1.sql");
  assert.equal(await new Response(puts[0].body).text(), "DUMP BYTES");
});

test("D1 backup workflow fails before any API call when a required variable is missing", async () => {
  const { env } = fakeEnv({ D1_REST_API_TOKEN: "" });
  const step = fakeStep();
  let calls = 0;

  await withFetch(
    async () => {
      calls += 1;
      return jsonResponse({ result: { at_bookmark: "bookmark-1" } });
    },
    async () => {
      const workflow = new D1BackupWorkflow({}, env);
      await assert.rejects(() => workflow.run({}, step), /D1_REST_API_TOKEN/);
    }
  );

  assert.equal(calls, 0);
  assert.deepEqual(step.names, []);
});

test("D1 backup workflow fails the step when the export API omits its bookmark", async () => {
  const { env, puts } = fakeEnv();
  const step = fakeStep();

  await withFetch(
    async () => jsonResponse({ result: {} }),
    async () => {
      const workflow = new D1BackupWorkflow({}, env);
      await assert.rejects(() => workflow.run({}, step), /Missing at_bookmark/);
    }
  );

  assert.deepEqual(step.names, ["Start D1 export"]);
  assert.equal(puts.length, 0);
});
