import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";

const dist = new URL("../.cloudflare/output/v0/workers/default/assets/", import.meta.url).pathname;

const BUDGETS = [
  { label: "Homepage HTML (prerendered)", match: /^index\.html$/, kb: 10 },
  { label: "Shared design tokens and components", match: /^tokens\.css$/, kb: 6 },
  { label: "Entry JavaScript", match: /^assets\/index-[\w-]+\.js$/, kb: 110 },
  { label: "Entry CSS", match: /^assets\/index-[\w-]+\.css$/, kb: 22 },
  { label: "Signed-in app JavaScript", match: /^assets\/BetaApp-[\w-]+\.js$/, kb: 50 },
  { label: "Not-found page", match: /^404\.html$/, kb: 4 },
  { label: "Free tools script", match: /^tools\.js$/, kb: 28 },
  { label: "Free page check script", match: /^check\.js$/, kb: 6 }
];

function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]
  );
}

test("no shipped file exceeds its performance budget", () => {
  if (!existsSync(dist))
    throw new Error("the built assets are missing; npm run build must run before npm run test:budget");
  const shipped = files(dist);
  for (const budget of BUDGETS) {
    const matches = shipped.filter((file) => budget.match.test(file));
    assert.ok(matches.length > 0, `${budget.label}: no built file matched ${budget.match}`);
    for (const file of matches) {
      const kb = gzipSync(readFileSync(join(dist, file))).length / 1024;
      assert.ok(
        kb <= budget.kb,
        `${budget.label} (${file}): ${kb.toFixed(1)} KB gzip exceeds the ${budget.kb} KB budget; trim the change or raise the budget deliberately in review`
      );
    }
  }
});
