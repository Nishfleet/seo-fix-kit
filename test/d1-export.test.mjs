import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WF = readFileSync(new URL("../.github/workflows/d1-export.yml", import.meta.url), "utf8");
const DEPLOY = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const CONFIG = readFileSync(new URL("../cloudflare.config.ts", import.meta.url), "utf8");

const onBlock = (text) => {
  const start = text.search(/\non:(?: #.*)?\n/);
  const end = text.slice(start + 1).search(/\n[^\s#]/);
  return text.slice(start, start + 1 + end);
};

const matrixRows = (text) =>
  [...text.matchAll(/^ {10}- \{ name: "?(\w+)"?, id: ([0-9a-f-]{36})[,} ]/gm)].map((m) => [m[1], m[2]]);

test("the backup runs weekly and can be started by hand for a restore drill", () => {
  const on = onBlock(WF);
  assert.match(on, /^ {2}schedule:\n(?: {4}#[^\n]*\n)* {4}- cron: "\d+ \d+ \* \* \d+"$/m);
  assert.match(on, /^ {2}workflow_dispatch:(?: \{\})?(?: #[^\n]*)?$/m);
  assert.equal(
    [...on.matchAll(/- cron:/g)].length,
    1,
    "one weekly cadence: 13 points survive the 90-day artifact retention"
  );
});

test("the backup reads only the deploy credentials, behind the production environment", () => {
  assert.match(WF, /^ {4}environment:\n {6}name: production$/m);
  const secrets = [...WF.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(secrets)].sort(),
    ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    "the backup needs only the deploy secret pair; the restore key's private half never goes into Actions"
  );
});

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

test("a database that cannot be dumped fails its own job, and the others still ship", () => {
  const strategy = WF.slice(WF.indexOf("strategy:"), WF.indexOf("steps:"));
  assert.match(strategy, /fail-fast: false/, "a database the export API refuses must not cancel the others");
  const entries = matrixRows(strategy);
  assert.ok(entries.length >= 1, "one job per database, each carrying its own id");
  assert.doesNotMatch(WF, /for pair in/, "the matrix walks the databases, not a shell loop");
  assert.doesNotMatch(WF, /missing=/, "a database that cannot dump fails its own job");
  assert.doesNotMatch(WF, /continue/, "nothing steps past a failed database");
  assert.doesNotMatch(WF, /if: always\(\)/, "no step waits for a failed database to ship");
  assert.match(WF, /name: d1-backup-\$\{\{ matrix\.database\.name \}\}/, "each database's dump is its own artifact");
  assert.match(WF, /if-no-files-found: error/, "a job that produced nothing does not upload an empty artifact");
});

test("the export polls the stock D1 export API and fails loud at every exit", () => {
  assert.match(WF, /d1\/database\/\$DB_ID\/export/);
  assert.match(WF, /output_format/);
  assert.match(WF, /current_bookmark/);
  assert.match(WF, /no download URL after 20 polls/);
  assert.match(WF, /the dump download failed/);
  assert.match(WF, /the API call failed/);
  const dump = WF.slice(WF.indexOf("- name: Dump and seal"), WF.indexOf("- name: Upload the sealed dump"));
  assert.ok(dump.length > 0, "the dump step is gone");
  const exits = dump.split("\n").filter((line) => /::error::/.test(line) && /exit 1\b/.test(line));
  assert.ok(exits.length >= 6, "every failure exit names the database and stops the job");
});

test("the dump lands as a pinned, 90-day artifact", () => {
  const uses = [...WF.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0, "the workflow uses pinned actions");
  for (const ref of uses) assert.match(ref.split("@")[1], /^[0-9a-f]{40}$/, `pinned by commit SHA: ${ref}`);
  assert.match(WF, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(WF, /retention-days: 90/);
});

test("the dump is fetched as data by the runtime, never as a curl executable download", () => {
  const downloads =
    WF.match(/\bnode -e 'const fs=require\("fs"\);\(async\(\)=>\{const r=await fetch\(process\.argv\[1\]\)/g) ?? [];
  assert.equal(downloads.length, 1, "exactly one fetch of the signed URL");
  assert.doesNotMatch(WF, /\bcurl\b[^\n]*\s-o\s|\bcurl\b[^\n|>]*\|/);
  assert.doesNotMatch(WF, /\bwget\b/);
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
