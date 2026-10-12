import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiErrorMessage, apiFetch, apiRequest, isAbortError } from "./api.js";

const realFetch = globalThis.fetch;

function stubFetch(status, body, calls = []) {
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("GET sends same-origin credentials and a JSON accept header", async () => {
  const calls = stubFetch(200, { ok: true, value: 1 });
  const payload = await apiFetch("/api/developer", { fallbackError: "Could not load developer API." });
  assert.deepEqual(payload, { ok: true, value: 1 });
  assert.equal(calls[0].path, "/api/developer");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.deepEqual(calls[0].init.headers, { accept: "application/json" });
  assert.equal("body" in calls[0].init, false);
});

test("body requests are JSON encoded and merge extra headers", async () => {
  const calls = stubFetch(200, { ok: true });
  await apiFetch("/api/access/verify", {
    method: "PATCH",
    headers: { "x-seofixkit-funnel-key": "fk_1" },
    body: { token: "t" },
    credentials: "include"
  });
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(calls[0].init.headers, {
    "content-type": "application/json",
    "x-seofixkit-funnel-key": "fk_1"
  });
  assert.equal(calls[0].init.body, JSON.stringify({ token: "t" }));
});

test("body defaults the method to POST", async () => {
  const calls = stubFetch(200, { ok: true });
  await apiFetch("/api/sites/claim", { body: { host: "example.com" } });
  assert.equal(calls[0].init.method, "POST");
});

test("server error message and status are carried on ApiError", async () => {
  stubFetch(403, { ok: false, error: "Session expired." });
  await assert.rejects(
    apiFetch("/api/x", { fallbackError: "Could not load." }),
    (error) => error instanceof ApiError && error.message === "Session expired." && error.status === 403
  );
});

test("fallback message is used when the server sends none or invalid JSON", async () => {
  stubFetch(500, "<html>oops</html>");
  await assert.rejects(apiFetch("/api/x", { fallbackError: "Could not load billing." }), {
    message: "Could not load billing.",
    status: 500
  });
});

test("2xx without ok:true fails by default but passes with requireOkFlag false", async () => {
  stubFetch(200, { reportId: "r1" });
  await assert.rejects(apiFetch("/api/x", { fallbackError: "Nope." }), { message: "Nope.", status: 200 });
  stubFetch(200, { reportId: "r1" });
  assert.deepEqual(await apiFetch("/api/x", { requireOkFlag: false }), { reportId: "r1" });
});

test("errorKeys picks the first populated server field", async () => {
  stubFetch(503, { message: "Pricing paused." });
  await assert.rejects(
    apiFetch("/api/pricing-preview", {
      requireOkFlag: false,
      errorKeys: ["message"],
      fallbackError: "Pricing unavailable."
    }),
    { message: "Pricing paused." }
  );
  assert.equal(apiErrorMessage({ message: "m" }, "f", ["error", "message"]), "m");
  assert.equal(apiErrorMessage({ error: "e", message: "m" }, "f", ["error", "message"]), "e");
  assert.equal(apiErrorMessage({}, "f"), "f");
});

test("apiRequest never throws for HTTP failures", async () => {
  stubFetch(402, { checkoutAvailable: false });
  const result = await apiRequest("/api/beta/monitoring-checkout", { body: {} });
  assert.equal(result.ok, false);
  assert.equal(result.status, 402);
  assert.deepEqual(result.payload, { checkoutAvailable: false });
});

test("prebuilt init is passed through unchanged", async () => {
  const calls = stubFetch(200, { ok: true });
  const init = {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}"
  };
  await apiFetch("/api/reports/r/repair-actions/a", { init });
  assert.deepEqual(calls[0].init, init);
});

test("network errors propagate unchanged", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(apiFetch("/api/x"), { name: "TypeError", message: "Failed to fetch" });
});

test("abort signals are forwarded and recognised", async () => {
  const controller = new AbortController();
  globalThis.fetch = (path, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  const pending = apiFetch("/api/audit/jobs/1", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => isAbortError(error));
});
