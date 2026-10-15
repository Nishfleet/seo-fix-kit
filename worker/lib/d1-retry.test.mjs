import assert from "node:assert/strict";
import test from "node:test";
import { withD1Retry } from "./d1-retry.js";
import { runScheduledTasks } from "./scheduled.js";

function flakyDb(failures) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const statement = {
        bind: () => statement,
        async first() {
          calls.push(sql);
          const failure = failures.shift();
          if (failure) throw new Error(failure);
          return { ok: 1 };
        },
        async run() {
          calls.push(sql);
          const failure = failures.shift();
          if (failure) throw new Error(failure);
          return { success: true };
        }
      };
      return statement;
    },
    async batch(statements) {
      calls.push(`batch:${statements.length}`);
      const failure = failures.shift();
      if (failure) throw new Error(failure);
      return statements.map(() => ({ success: true }));
    }
  };
  return db;
}

const fast = { delayMs: 1 };

test("a read is retried after a lost connection and then succeeds", async () => {
  const db = flakyDb(["D1_ERROR: Network connection lost.", "D1_ERROR: Network connection lost."]);
  const row = await withD1Retry(db, fast).prepare("SELECT 1").bind().first();
  assert.deepEqual(row, { ok: 1 });
  assert.equal(db.calls.length, 3);
});

test("a read gives up after three attempts and throws the last error", async () => {
  const db = flakyDb(Array(5).fill("D1_ERROR: Network connection lost."));
  await assert.rejects(withD1Retry(db, fast).prepare("SELECT 1").first(), /Network connection lost/);
  assert.equal(db.calls.length, 3);
});

test("a write is not replayed after a lost connection, because it may have been applied", async () => {
  const db = flakyDb(["D1_ERROR: Network connection lost."]);
  await assert.rejects(withD1Retry(db, fast).prepare("INSERT INTO t VALUES (1)").run(), /Network connection lost/);
  assert.equal(db.calls.length, 1);
});

test("a write is replayed when D1 says it queued too long, because it never ran", async () => {
  const db = flakyDb(["D1_ERROR: D1 DB is overloaded. Requests queued for too long."]);
  const result = await withD1Retry(db, fast).prepare("UPDATE t SET a = 1").run();
  assert.deepEqual(result, { success: true });
  assert.equal(db.calls.length, 2);
});

test("an error that is not transient is thrown at once", async () => {
  const db = flakyDb(["D1_ERROR: no such table: t"]);
  await assert.rejects(withD1Retry(db, fast).prepare("SELECT * FROM t").first(), /no such table/);
  assert.equal(db.calls.length, 1);
});

test("a batch of wrapped statements reaches D1 as the real statements and retries on overload", async () => {
  const db = flakyDb(["D1_ERROR: D1 DB is overloaded. Requests queued for too long."]);
  const wrapped = withD1Retry(db, fast);
  const results = await wrapped.batch([
    wrapped.prepare("DELETE FROM a").bind(),
    wrapped.prepare("DELETE FROM b").bind()
  ]);
  assert.equal(results.length, 2);
  assert.deepEqual(db.calls, ["batch:2", "batch:2"]);
});

test("a write batch is not replayed after a lost connection", async () => {
  const db = flakyDb(["D1_ERROR: Network connection lost."]);
  const wrapped = withD1Retry(db, fast);
  await assert.rejects(wrapped.batch([wrapped.prepare("DELETE FROM a")]), /Network connection lost/);
  assert.equal(db.calls.length, 1);
});

test("scheduled tasks run one after another, one failing task does not stop the rest, and the run still reports it", async () => {
  const order = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    const env = { WAITLIST_DB: flakyDb([]) };
    const tasks = [
      ["first", async () => order.push("first")],
      [
        "broken",
        async () => {
          order.push("broken");
          throw new Error("boom");
        }
      ],
      ["last", async () => order.push("last")]
    ];
    await assert.rejects(runScheduledTasks(env, tasks), /Scheduled tasks failed: broken/);
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(order, ["first", "broken", "last"]);
});

test("scheduled tasks get a database that retries a transient read", async () => {
  const db = flakyDb(["D1_ERROR: Network connection lost."]);
  let row = null;
  await runScheduledTasks({ WAITLIST_DB: db }, [
    ["read", async (env) => (row = await env.WAITLIST_DB.prepare("SELECT 1").first())]
  ]);
  assert.deepEqual(row, { ok: 1 });
  assert.equal(db.calls.length, 2);
});
