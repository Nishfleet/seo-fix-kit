import assert from "node:assert/strict";
import test from "node:test";
import { createTestD1 } from "../../test/support/d1.mjs";
import worker from "../index.js";
import { serviceStatus, statusHtml } from "./status.js";

function readyEnv(db = createTestD1()) {
  return {
    WAITLIST_DB: db,
    BROWSER: {},
    AUDIT_QUEUE: {},
    REPORTS: {},
    EMAIL: { send() {} },
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <hello@seofixkit.com>",
    DODO_SEOFIXKIT_API_KEY: "key",
    DODO_SEOFIXKIT_BRAND_ID: "brand",
    DODO_SEOFIXKIT_ENVIRONMENT: "test_mode",
    DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "prod",
    DODO_SEOFIXKIT_WEBHOOK_SECRET: "secret",
    ASSETS: { fetch: async () => new Response("", { status: 404 }) }
  };
}

test("every part reports working when its services are connected and the database answers", async () => {
  const db = createTestD1();
  await db
    .prepare(
      "INSERT INTO audit_jobs (id, owner_email, target_url, target_host, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)"
    )
    .bind(
      "job-1",
      "a@example.com",
      "https://example.com/",
      "example.com",
      "2026-10-01T00:00:00Z",
      "2026-10-01T00:00:00Z",
      "2026-10-01T00:05:00Z"
    )
    .run();
  const status = await serviceStatus(readyEnv(db));
  assert.equal(status.ok, true);
  assert.equal(status.summary, "All systems working");
  assert.equal(status.lastAuditCompletedAt, "2026-10-01T00:05:00Z");
  assert.ok(status.components.every((component) => component.status === "operational"));
});

test("a missing service marks only the parts that depend on it", async () => {
  const env = readyEnv();
  delete env.BROWSER;
  delete env.EMAIL;
  const status = await serviceStatus(env);
  assert.equal(status.ok, false);
  assert.equal(status.summary, "2 parts not working");
  const down = status.components.filter((component) => component.status === "down").map((component) => component.key);
  assert.deepEqual(down, ["audits", "sign-in"]);
  const html = statusHtml("https://seofixkit.com", status);
  assert.match(html, /Some things aren’t working\./);
  assert.match(html, /Not working/);
});

test("a database that errors marks audits and reports down instead of failing the page", async () => {
  const env = readyEnv({
    prepare() {
      throw new Error("D1 unavailable");
    }
  });
  const status = await serviceStatus(env);
  const byKey = Object.fromEntries(status.components.map((component) => [component.key, component.status]));
  assert.equal(byKey.audits, "down");
  assert.equal(byKey.reports, "down");
  assert.equal(byKey.website, "operational");
});

test("/status and /api/status are served live and never cached", async () => {
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const page = await worker.fetch(new Request("https://seofixkit.com/status"), readyEnv(), ctx);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /All systems working\./);
  const api = await worker.fetch(new Request("https://seofixkit.com/api/status"), readyEnv(), ctx);
  const body = await api.json();
  assert.equal(body.status, "operational");
  assert.equal(body.components.length, 5);
});
