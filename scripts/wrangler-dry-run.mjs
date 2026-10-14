#!/usr/bin/env node
// Wrangler's esbuild step parses every package.json on the ancestor chain of its working directory; one malformed manifest fails the dry-run before bundling.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEPLOY_DIRS = ["worker", "shared", "dist", "migrations"];
const DEPLOY_FILES = ["package.json", "package-lock.json", "wrangler.jsonc"];

export function malformedAncestorManifests(fromDir) {
  const findings = [];
  let dir = path.resolve(fromDir);
  for (;;) {
    const manifest = path.join(dir, "package.json");
    let content;
    try {
      content = fs.readFileSync(manifest, "utf8");
    } catch {}
    if (content !== undefined) {
      try {
        JSON.parse(content);
      } catch (err) {
        findings.push({
          path: manifest,
          problem: `not valid JSON (${err.message})`
        });
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return findings;
}

function chainIsFreeOfManifests(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, "package.json"))) return false;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return true;
}

export function pickCleanScratchRoot() {
  const candidates = [];
  if (process.env.SEOFIXKIT_WRANGLER_SCRATCH_TMPDIR) {
    candidates.push(process.env.SEOFIXKIT_WRANGLER_SCRATCH_TMPDIR);
  }
  candidates.push(os.tmpdir());
  if (os.tmpdir() !== "/tmp") candidates.push("/tmp");
  for (const base of candidates) {
    let scratch;
    try {
      fs.mkdirSync(base, { recursive: true });
      scratch = fs.mkdtempSync(path.join(base, "seofixkit-wrangler-dry-run-"));
    } catch {
      continue;
    }
    if (chainIsFreeOfManifests(scratch)) return scratch;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  throw new Error(
    "wrangler-dry-run: no clean scratch root available. Tried: " +
      candidates.join(", ") +
      ". Every candidate either cannot be created or has a package.json on its " +
      "ancestor chain, so the dry-run cannot be shielded from malformed " +
      "ancestor manifests. Refusing to run in place."
  );
}

export function resolveWranglerBin(projectRoot) {
  const wranglerPackage = path.join(projectRoot, "node_modules", "wrangler");
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(wranglerPackage, "package.json"), "utf8"));
    const bin = pkg.bin?.wrangler || "bin/wrangler.js";
    const resolved = path.join(wranglerPackage, bin);
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function buildShieldedScratch(projectRoot) {
  const scratch = pickCleanScratchRoot();
  try {
    for (const file of DEPLOY_FILES) {
      const src = path.join(projectRoot, file);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(scratch, file));
    }
    for (const dir of DEPLOY_DIRS) {
      const src = path.join(projectRoot, dir);
      if (fs.existsSync(src)) {
        fs.cpSync(src, path.join(scratch, dir), {
          recursive: true,
          dereference: true
        });
      }
    }
    const nodeModulesSrc = path.join(projectRoot, "node_modules");
    const nodeModulesDest = path.join(scratch, "node_modules");
    if (!fs.existsSync(nodeModulesSrc)) {
      throw new Error(`wrangler-dry-run: ${nodeModulesSrc} does not exist; run npm ci first`);
    }
    const hardlink = spawnSync("cp", ["-al", nodeModulesSrc, nodeModulesDest], {
      encoding: "utf8"
    });
    if (hardlink.status !== 0) {
      fs.rmSync(nodeModulesDest, { recursive: true, force: true });
      const realCopy = spawnSync("cp", ["-r", nodeModulesSrc, nodeModulesDest], {
        encoding: "utf8"
      });
      if (realCopy.status !== 0) {
        throw new Error(
          `wrangler-dry-run: could not copy node_modules into the shielded ` +
            `scratch (hardlink: ${hardlink.stderr?.trim() || "failed"}; copy: ${realCopy.stderr?.trim() || "failed"})`
        );
      }
    }
    return { scratch };
  } catch (err) {
    fs.rmSync(scratch, { recursive: true, force: true });
    throw err;
  }
}

export function runWranglerDryRun(cwd, wranglerBin, envOverride) {
  const result = spawnSync(process.execPath, [wranglerBin, "deploy", "--dry-run"], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...(envOverride || {}) }
  });
  return result.status === null ? 1 : result.status;
}

export function runGuardedDryRun(projectRoot, envOverride) {
  const malformed = malformedAncestorManifests(projectRoot);
  for (const finding of malformed) {
    console.error(
      `[wrangler-dry-run] malformed ancestor package.json at ${finding.path} ` +
        `(${finding.problem}). The dry-run will run from a shielded scratch ` +
        `copy so the canary stays green; restoring a confirmed empty scaffold ` +
        `manifest to valid JSON ({}) is a separate host-side hygiene action.`
    );
  }
  const wranglerBin = resolveWranglerBin(projectRoot);
  if (!wranglerBin) {
    throw new Error(
      "wrangler-dry-run: wrangler is not installed in this project (node_modules/wrangler missing); run npm ci first"
    );
  }
  if (malformed.length === 0) {
    return runWranglerDryRun(projectRoot, wranglerBin, envOverride);
  }
  const { scratch } = buildShieldedScratch(projectRoot);
  try {
    // Wrangler anchors esbuild's working directory at its own package location, so it must run from the scratch copy.
    const scratchBin = resolveWranglerBin(scratch);
    if (!scratchBin) {
      throw new Error("wrangler-dry-run: shielded scratch lost its wrangler copy");
    }
    return runWranglerDryRun(scratch, scratchBin, envOverride);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runGuardedDryRun(REPO_ROOT);
  } catch (err) {
    console.error(`[wrangler-dry-run] ${err.message}`);
    process.exitCode = 1;
  }
}
