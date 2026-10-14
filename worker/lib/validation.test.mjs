import assert from "node:assert/strict";
import test from "node:test";
import { body, email, flag, number, optionalEmail, parseJsonBody, record, text } from "./validation.js";
import { cleanInviteCode, isSafeUuid, normalizeEmail } from "./text.js";

function jsonRequest(payload) {
  return new Request("https://seofixkit.test/api/example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
}

const ExampleBody = body(
  {
    email: email("Enter a valid email address."),
    note: text(10),
    maxPages: number(),
    testMode: flag(),
    meta: record(),
    cc: optionalEmail()
  },
  { max_pages: "maxPages" }
);

test("parseJsonBody returns cleaned data for a valid body", async () => {
  const { data, error } = await parseJsonBody(
    jsonRequest({ email: " Owner@Example.COM ", note: "  hello\n\nworld again ", max_pages: "25", testMode: "true" }),
    ExampleBody
  );
  assert.equal(error, undefined);
  assert.deepEqual(data, {
    email: "owner@example.com",
    note: "hello worl",
    maxPages: 25,
    testMode: true,
    meta: {},
    cc: ""
  });
});

test("parseJsonBody keeps the canonical key over its alias and drops unknown keys", async () => {
  const { data } = await parseJsonBody(
    jsonRequest({ email: "a@example.com", maxPages: 5, max_pages: 50, extra: "x" }),
    ExampleBody
  );
  assert.equal(data.maxPages, 5);
  assert.equal("extra" in data, false);
});

test("parseJsonBody reports the route's message and the failing field", async () => {
  const { error } = await parseJsonBody(jsonRequest({ email: "not-an-email" }), ExampleBody);
  assert.deepEqual(error, { error: "Enter a valid email address.", field: "email" });
});

test("parseJsonBody explains wrong types in plain words", async () => {
  const { error } = await parseJsonBody(jsonRequest({ email: "a@example.com", note: { nested: true } }), ExampleBody);
  assert.equal(error.field, "note");
  assert.match(error.error, /^note /);
  const pages = await parseJsonBody(jsonRequest({ email: "a@example.com", maxPages: "lots" }), ExampleBody);
  assert.deepEqual(pages.error, { error: "maxPages must be a number.", field: "maxPages" });
});

test("parseJsonBody treats malformed, empty, and non-object bodies as {}", async () => {
  for (const payload of ["{oops", "", "null", "[1,2]", "42"]) {
    const { error } = await parseJsonBody(jsonRequest(payload), ExampleBody);
    assert.deepEqual(error, { error: "Enter a valid email address.", field: "email" }, payload);
  }
});

test("text.js identity helpers share the Zod schemas", () => {
  assert.equal(normalizeEmail(" Founder@Example.com "), "founder@example.com");
  assert.equal(normalizeEmail("founder@localhost"), "");
  assert.equal(normalizeEmail("用户@example.com"), "用户@example.com");
  assert.equal(normalizeEmail("a@b.c"), "a@b.c");
  assert.equal(normalizeEmail(`${"a".repeat(250)}@example.com`), "");
  assert.equal(cleanInviteCode(" invite_code-1 "), "invite_code-1");
  assert.equal(cleanInviteCode("short"), "");
  assert.equal(isSafeUuid(crypto.randomUUID()), true);
  assert.equal(isSafeUuid("../etc/passwd"), false);
});
