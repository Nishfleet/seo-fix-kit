const D1_MAX_CONCURRENCY = 8;

async function runBounded(items, limit, worker) {
  const results = new Array(items.length);
  const width = Math.min(items.length, Math.max(1, Math.trunc(limit) || 1));
  let next = 0;
  let failed = false;
  const runners = Array.from({ length: width }, async () => {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  const settled = await Promise.allSettled(runners);
  const failure = settled.find((outcome) => outcome.status === "rejected");
  if (failure) throw failure.reason;
  return results;
}

export { D1_MAX_CONCURRENCY, runBounded };
