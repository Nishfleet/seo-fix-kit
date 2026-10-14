import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_FILES_EXEMPT_FROM_CHECK = new Map();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function committedTestFiles() {
  const files = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return files
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && /\.test\.(mjs|js)$/.test(line));
}

function chainCoveredTestFiles(packageJson) {
  const checkChain = packageJson.scripts?.check;
  assert.equal(typeof checkChain, "string", "package.json scripts.check must be a string");

  const chainNames = [...checkChain.matchAll(/npm run (test:[A-Za-z0-9_.-]+)/g)].map((match) => match[1]);
  const covered = new Set();
  for (const name of chainNames) {
    const script = packageJson.scripts?.[name];
    assert.equal(
      typeof script,
      "string",
      `check chain references npm run ${name}, but package.json defines no "${name}" script`
    );
    const tokens = script.trim().split(/\s+/);
    const testFlagIndex = tokens.indexOf("--test");
    if (tokens[0] === "node" && testFlagIndex >= 0 && tokens[testFlagIndex + 1]) {
      const file = tokens[testFlagIndex + 1];
      assert.ok(
        !file.startsWith("-"),
        `check chain script "${name}" uses bare node --test discovery; inventory coverage must name files explicitly`
      );
      covered.add(file);
    }
  }
  return covered;
}

test("every committed Node test file is covered by the canonical check chain", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const covered = chainCoveredTestFiles(packageJson);
  const committed = committedTestFiles();

  for (const file of committed) {
    assert.ok(
      covered.has(file) || TEST_FILES_EXEMPT_FROM_CHECK.has(file),
      `committed Node test ${file} is absent from the canonical check chain: ` +
        `add a "test:<name>": "node --test ${file}" script and run it from ` +
        `"scripts.check", or justify a TEST_FILES_EXEMPT_FROM_CHECK entry ` +
        `(never for a hermetic suite that CI could run)`
    );
  }
});

test("the check chain only references committed node --test files", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const committed = new Set(committedTestFiles());

  for (const [name, script] of Object.entries(packageJson.scripts ?? {})) {
    if (!name.startsWith("test:")) {
      continue;
    }
    if (name === "test:check-inventory") {
      continue;
    }
    const tokens = script.trim().split(/\s+/);
    const testFlagIndex = tokens.indexOf("--test");
    if (tokens[0] !== "node" || testFlagIndex < 0 || !tokens[testFlagIndex + 1]) {
      continue;
    }
    const file = tokens[testFlagIndex + 1];
    assert.ok(
      committed.has(file),
      `check chain script "${name}" references ${file}, which is not a committed test file`
    );
  }
});
