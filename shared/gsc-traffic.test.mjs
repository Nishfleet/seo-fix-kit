import assert from "node:assert/strict";
import test from "node:test";
import { applyGscTrafficToQueue, gscPageSummary, normalizeGscPageRows, GSC_READONLY_SCOPE } from "./gsc-traffic.js";

const GSC_ROWS = [
  { keys: ["https://shop.example/pricing"], clicks: 400, impressions: 9000, ctr: 0.044, position: 8.2 },
  { keys: ["https://www.shop.example/"], clicks: 1200, impressions: 20000, ctr: 0.06, position: 4.1 },
  { keys: ["https://shop.example/about"], clicks: 0, impressions: 40, ctr: 0, position: 44 }
];

test("the read-only scope never grants write access", () => {
  assert.equal(GSC_READONLY_SCOPE, "https://www.googleapis.com/auth/webmasters.readonly");
});

test("normalizeGscPageRows folds Search Console API rows and dedupes by page", () => {
  const rows = normalizeGscPageRows([
    ...GSC_ROWS,
    { keys: ["https://shop.example/pricing"], clicks: 10, impressions: 5 }
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].clicks, 1200, "rows are sorted by clicks");
  const pricing = rows.find((row) => row.path === "/pricing");
  assert.equal(pricing.clicks, 410);
  assert.equal(normalizeGscPageRows([{ keys: ["not a url"] }]).length, 0);
});

test("gscPageSummary totals the 90-day window", () => {
  const summary = gscPageSummary(GSC_ROWS);
  assert.equal(summary.windowDays, 90);
  assert.equal(summary.pages, 3);
  assert.equal(summary.clicks, 1600);
  assert.equal(summary.impressions, 29040);
});

test("the queue ranks faults on pages with traffic first and says why", () => {
  const items = [
    {
      issueId: "issue-1",
      title: "Duplicate title on /blog/draft",
      severity: "critical",
      pageUrl: "https://shop.example/blog/draft",
      priority: 1
    },
    {
      issueId: "issue-2",
      title: "Duplicate title on /pricing",
      severity: "notice",
      pageUrl: "https://shop.example/pricing",
      priority: 2
    },
    {
      issueId: "issue-3",
      title: "Thin content on /",
      severity: "warning",
      pageUrl: "https://shop.example/",
      priority: 3
    }
  ];
  const { items: ranked, summary } = applyGscTrafficToQueue(items, GSC_ROWS);

  assert.deepEqual(
    ranked.map((item) => item.issueId),
    ["issue-3", "issue-2", "issue-1"],
    "the homepage (1200 clicks) and /pricing (400 clicks) outrank the critical fault on an unvisited page"
  );
  assert.equal(ranked[0].trafficClicks, 1200);
  assert.equal(ranked[1].trafficClicks, 400);
  assert.equal(ranked[2].trafficClicks, 0);
  assert.match(ranked[0].trafficReason, /1200 clicks.*90 days.*risk/);
  assert.match(ranked[2].trafficReason, /0 clicks/);

  assert.equal(summary.status, "ready");
  assert.equal(summary.windowDays, 90);
  assert.equal(summary.pages, 3);
  assert.equal(summary.pagesWithTraffic, 2);
  assert.equal(summary.clicksAtRisk, 1600);
  assert.equal(summary.topFive.length, 3);
  assert.match(summary.topFive[0].reason, /1200 clicks/);
});

test("without Search Console rows the queue is untouched", () => {
  const items = [
    { issueId: "issue-1", title: "A", severity: "warning", pageUrl: "https://shop.example/", priority: 1 },
    { issueId: "issue-2", title: "B", severity: "critical", pageUrl: "https://shop.example/x", priority: 2 }
  ];
  const untouched = applyGscTrafficToQueue(items, []);
  assert.equal(untouched.items, items);
  assert.equal(untouched.summary, null);
});
