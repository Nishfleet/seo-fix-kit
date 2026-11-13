import assert from "node:assert/strict";
import test from "node:test";
import { checkAddressSafety } from "./url-safety.js";

const HOST = "shop.example";

function dnsResponse(answers = []) {
  return new Response(JSON.stringify({ Answer: answers }), {
    status: 200,
    headers: { "content-type": "application/dns-json" }
  });
}

function recordType(url) {
  return new URL(url).searchParams.get("type");
}

async function withoutLookupNoise(run) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalError;
  }
}

function guard(ms, message) {
  let timer;
  const promise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  promise.catch(() => undefined);
  return { promise, cancel: () => clearTimeout(timer) };
}

test("an address lookup that fails on every record type reads the host as unreachable", async () => {
  const result = await withoutLookupNoise(() =>
    checkAddressSafety(HOST, async () => {
      throw new Error("the resolver is unreachable");
    })
  );
  assert.deepEqual(result, { private: false, reachable: false });
});

test("one answered record type is enough to read the host as reachable", async () => {
  const calls = [];
  const result = await withoutLookupNoise(() =>
    checkAddressSafety(HOST, async (url, init) => {
      calls.push({ url, signal: init?.signal });
      if (recordType(url) === "A") return dnsResponse([{ type: 1, data: "93.184.216.34" }]);
      throw new Error("the AAAA lookup failed");
    })
  );
  assert.deepEqual(result, { private: false, reachable: true });
  assert.equal(calls.length, 2, "both record types are looked up");
  assert.ok(
    calls.every((call) => call.signal instanceof AbortSignal),
    "every lookup carries the abort signal that bounds it"
  );
});

test("a private address in a resolver answer still refuses the host", async () => {
  const result = await withoutLookupNoise(() =>
    checkAddressSafety(HOST, async (url) => {
      if (recordType(url) === "A") return dnsResponse([{ type: 1, data: "10.0.0.5" }]);
      throw new Error("the AAAA lookup failed");
    })
  );
  assert.deepEqual(result, { private: true, reachable: true });
});

test("a literal address never needs a DNS lookup", async () => {
  let calls = 0;
  const result = await checkAddressSafety("93.184.216.34", async () => {
    calls += 1;
    return dnsResponse([]);
  });
  assert.deepEqual(result, { private: false, reachable: true });
  assert.equal(calls, 0);
});

test("a lookup that never answers ends unreachable once the timeout aborts it", async () => {
  const started = Date.now();
  const aborts = [];
  const limit = guard(25_000, "the address lookup never ended");
  try {
    const result = await Promise.race([
      withoutLookupNoise(() =>
        checkAddressSafety(
          HOST,
          async (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  aborts.push(Date.now() - started);
                  reject(new Error("the lookup was aborted"));
                },
                { once: true }
              );
            })
        )
      ),
      limit.promise
    ]);
    const elapsed = Date.now() - started;
    assert.deepEqual(result, { private: false, reachable: false });
    assert.equal(aborts.length, 2, "both record types were looked up");
    assert.ok(
      aborts[0] >= 3900 && aborts[0] < 10_000,
      `the first lookup waited for its timeout instead of answering at once (${aborts[0]}ms)`
    );
    assert.ok(aborts[1] >= 7900 && aborts[1] < 20_000, `the second lookup waited for its own timeout (${aborts[1]}ms)`);
    assert.ok(elapsed < 25_000, `the whole lookup stayed bounded by its timeouts (${elapsed}ms)`);
  } finally {
    limit.cancel();
  }
});
