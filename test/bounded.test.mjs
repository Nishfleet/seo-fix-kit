import assert from "node:assert/strict";
import { test } from "node:test";
import { runBounded } from "../worker/lib/bounded.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test("runBounded keeps at most the limit in flight and returns results in order", async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 25 }, (_unused, index) => index);
  const results = await runBounded(items, 8, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
    return item * 2;
  });
  assert.equal(peak, 8);
  assert.deepEqual(
    results,
    items.map((item) => item * 2)
  );
});

test("runBounded runs everything even when the limit exceeds the item count", async () => {
  const seen = [];
  const results = await runBounded(["a", "b"], 8, async (item) => {
    seen.push(item);
    return item.toUpperCase();
  });
  assert.deepEqual(seen, ["a", "b"]);
  assert.deepEqual(results, ["A", "B"]);
});

test("runBounded returns an empty list without calling the worker", async () => {
  let calls = 0;
  const results = await runBounded([], 8, async () => {
    calls += 1;
    return "never";
  });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});

test("runBounded stops handing out work after the first failure", async () => {
  let started = 0;
  await assert.rejects(
    () =>
      runBounded([1, 2, 3, 4, 5, 6, 7, 8, 9], 2, async (item) => {
        started += 1;
        await tick();
        if (item === 1) throw new Error("boom");
        return item;
      }),
    /boom/
  );
  assert.equal(started, 2);
});

test("runBounded rejects with the first failure", async () => {
  await assert.rejects(
    () =>
      runBounded([1, 2, 3, 4, 5], 2, async (item) => {
        await tick();
        if (item === 3) throw new Error(`boom ${item}`);
        return item;
      }),
    /boom 3/
  );
});

test("runBounded treats a limit below one as one", async () => {
  let inFlight = 0;
  let peak = 0;
  await runBounded([1, 2, 3], 0, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
    return item;
  });
  assert.equal(peak, 1);
});
