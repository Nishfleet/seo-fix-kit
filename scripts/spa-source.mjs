// Source-text helper for contract tests that pin copy or wiring in the React
// SPA. The SPA is split across many modules under src/, so tests read the
// concatenation of every non-test src/**/*.{js,jsx} file instead of one
// hard-coded file path; moving a component between modules then cannot break
// (or silently void) an assertion about what the shipped UI contains.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

export function spaSourceFiles(dir = SRC_DIR) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...spaSourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
  }
  return files.sort();
}

export function readSpaSource() {
  const files = spaSourceFiles();
  if (!files.length) throw new Error(`No SPA source files found under ${SRC_DIR}`);
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}
