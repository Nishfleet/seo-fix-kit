import assert from "node:assert/strict";
import test from "node:test";
import { buildSiteProgress } from "./site-progress.js";

const report = (url, score, totalFindings, createdAt) => ({
  url,
  score,
  totalFindings,
  createdAt,
  reportPath: `/beta/reports/${createdAt}`
});

test("a site's trend follows its most-checked page, oldest first", () => {
  const [site] = buildSiteProgress(
    [
      report("https://www.example.com/", 81, 6, "2026-10-20T00:00:00Z"),
      report("https://example.com/pricing", 40, 20, "2026-10-21T00:00:00Z"),
      report("https://example.com/", 72, 14, "2026-10-13T00:00:00Z")
    ],
    [{ status: "active", targetUrl: "https://example.com/", nextRunAt: "2026-10-27T00:00:00Z" }]
  );
  assert.equal(site.host, "example.com");
  assert.deepEqual(
    site.points.map((point) => point.score),
    [72, 81]
  );
  assert.equal(site.scoreChange, 9);
  assert.equal(site.issuesChange, -8);
  assert.equal(site.checks, 2);
  assert.equal(site.reportPath, "/beta/reports/2026-10-20T00:00:00Z");
  assert.equal(site.nextCheckAt, "2026-10-27T00:00:00Z");
  assert.equal(site.latestAt, "2026-10-21T00:00:00Z", "the site sorts by its newest report of any page");
});

test("sites sort by most recent activity and paused checks are ignored", () => {
  const sites = buildSiteProgress(
    [report("https://a.com/", 50, 3, "2026-10-01T00:00:00Z"), report("https://b.com/", 90, 1, "2026-10-05T00:00:00Z")],
    [{ status: "paused", targetUrl: "https://a.com/", nextRunAt: "2026-10-08T00:00:00Z" }]
  );
  assert.deepEqual(
    sites.map((site) => site.host),
    ["b.com", "a.com"]
  );
  assert.equal(sites[1].nextCheckAt, "");
  assert.equal(sites[1].checks, 1);
  assert.equal(sites[1].scoreChange, 0);
});

test("no reports means no progress card", () => {
  assert.deepEqual(buildSiteProgress([], []), []);
  assert.deepEqual(buildSiteProgress([{ url: "not a url", score: 1 }], []), []);
});
