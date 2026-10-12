import assert from "node:assert/strict";
import test from "node:test";
import { createTestD1 } from "./d1.mjs";

test("test D1 applies every migration and enforces the real schema", async () => {
  const db = createTestD1();
  const tables = db.rows("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
  for (const table of ["waitlist_leads", "beta_sessions", "audit_reports", "fix_requests", "dodo_webhook_events", "repair_queue_items"]) {
    assert.ok(tables.includes(table), `migrations create ${table}`);
  }
  await assert.rejects(
    db.prepare("INSERT INTO waitlist_leads (email) VALUES (?)").bind("lead@example.com").run(),
    /NOT NULL constraint failed/
  );
});

test("test D1 mirrors the D1 statement API", async () => {
  const db = createTestD1();
  const now = new Date().toISOString();
  const insert = await db
    .prepare("INSERT INTO waitlist_leads (email, created_at, updated_at) VALUES (?, ?, ?)")
    .bind("lead@example.com", now, now)
    .run();
  assert.equal(insert.success, true);
  assert.equal(insert.meta.changes, 1);

  const select = db.prepare("SELECT email FROM waitlist_leads WHERE email = ?").bind("lead@example.com");
  assert.deepEqual(await select.first(), { email: "lead@example.com" });
  assert.equal(await select.first("email"), "lead@example.com");
  assert.deepEqual((await select.all()).results, [{ email: "lead@example.com" }]);
  assert.deepEqual(await select.raw(), [["lead@example.com"]]);
  assert.equal(await db.prepare("SELECT email FROM waitlist_leads WHERE email = ?").bind("missing").first(), null);
  assert.throws(() => db.prepare("SELECT 1 WHERE ? = 1").bind(undefined), /D1_TYPE_ERROR/);
});

test("test D1 batch is atomic", async () => {
  const db = createTestD1();
  const now = new Date().toISOString();
  const insert = (email) =>
    db.prepare("INSERT INTO waitlist_leads (email, created_at, updated_at) VALUES (?, ?, ?)").bind(email, now, now);
  await assert.rejects(db.batch([insert("one@example.com"), insert("one@example.com")]), /UNIQUE constraint failed/);
  assert.deepEqual(db.rows("SELECT email FROM waitlist_leads"), []);
});
