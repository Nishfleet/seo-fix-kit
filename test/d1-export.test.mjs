import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WF = readFileSync(new URL("../.github/workflows/d1-export.yml", import.meta.url), "utf8");
const DEPLOY = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const CONFIG = readFileSync(new URL("../cloudflare.config.ts", import.meta.url), "utf8");

const matrixRows = (text) =>
  [...text.matchAll(/^ {10}- \{ name: "?(\w+)"?, id: ([0-9a-f-]{36})[,} ]/gm)].map((m) => [m[1], m[2]]);

test("the backup covers the database the deploy migrates, under its own bound name", () => {
  const deployIds = [
    ...DEPLOY.matchAll(/migrations apply ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g)
  ].map((m) => m[1]);
  assert.ok(deployIds.length >= 1, "the deploy migrates one D1 database");
  const matrix = WF.slice(WF.indexOf("matrix:"), WF.indexOf("steps:"));
  const rows = matrixRows(matrix);
  assert.ok(rows.length >= 1, "the export walks the databases in one matrix");
  for (const id of deployIds)
    assert.ok(
      rows.some(([, rowId]) => rowId === id),
      `the deploy migrates ${id} and the backup must dump it`
    );
  const bound = CONFIG.match(
    /bindings\.d1\(\{\s*name: "([^"]+)",\s*id: "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/s
  );
  assert.ok(bound, "cloudflare.config.ts binds a D1 database");
  const row = rows.find(([name]) => name === bound[1]);
  assert.ok(row, `the matrix row is named after the bound database ${bound[1]}`);
  assert.equal(row[1], bound[2], `the backup dumps the bound database ${bound[2]}`);
});

test("the dumps are encrypted before they touch an artifact", () => {
  assert.match(WF, /\$\{\{ vars\.AGE_RECIPIENT \}\}/);
  assert.match(WF, /the age recipient is unset/);
  assert.match(WF, /age-bin\/age" -r "\$AGE_RECIPIENT" -o "\$file\.age" "\$file"/);
  assert.match(WF, /rm -f "\$file"/);
  assert.match(WF, /path: \$\{\{ runner\.temp \}\}\/d1-export\/\*\.sql\.age$/m);
  assert.doesNotMatch(WF, /path: \$\{\{ runner\.temp \}\}\/d1-export\/\*\.sql$/m);
});

test("the age binary is a digest-pinned release download", () => {
  assert.match(WF, /AGE_VERSION: v\d+\.\d+\.\d+/);
  assert.match(WF, /AGE_LINUX_AMD64_SHA256: [0-9a-f]{64}/);
  assert.match(WF, /echo "\$AGE_LINUX_AMD64_SHA256 {2}\$RUNNER_TEMP\/age\.tar\.gz" \| sha256sum -c -/);
});
