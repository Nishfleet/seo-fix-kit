import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;

const BUDGETS = [
  { label: "Homepage HTML (prerendered)", match: /^index\.html$/, kb: 10 },
  { label: "Shared design tokens and components", match: /^tokens\.css$/, kb: 6 },
  { label: "Entry JavaScript", match: /^assets\/index-[\w-]+\.js$/, kb: 110 },
  { label: "Entry CSS", match: /^assets\/index-[\w-]+\.css$/, kb: 22 },
  { label: "Signed-in app JavaScript", match: /^assets\/BetaApp-[\w-]+\.js$/, kb: 50 },
  { label: "Not-found page", match: /^404\.html$/, kb: 4 },
  { label: "Free tools script", match: /^tools\.js$/, kb: 28 }
];

function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]
  );
}

const shipped = files(dist);
let failed = false;

for (const budget of BUDGETS) {
  const matches = shipped.filter((file) => budget.match.test(file));
  if (matches.length === 0) {
    console.error(`✗ ${budget.label}: no file matched ${budget.match}`);
    failed = true;
    continue;
  }
  for (const file of matches) {
    const kb = gzipSync(readFileSync(join(dist, file))).length / 1024;
    const ok = kb <= budget.kb;
    if (!ok) failed = true;
    console.log(`${ok ? "✓" : "✗"} ${budget.label} (${file}): ${kb.toFixed(1)} KB gzip, budget ${budget.kb} KB`);
  }
}

if (failed) {
  console.error("\nPerformance budget exceeded. Trim the change or raise the budget deliberately in review.");
  process.exit(1);
}
