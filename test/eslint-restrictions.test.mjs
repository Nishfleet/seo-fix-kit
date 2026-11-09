import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });

async function lintProbe(code) {
  const results = await eslint.lintText(code, {
    filePath: fileURLToPath(new URL("../worker/routes/__lint-band-probe.js", import.meta.url))
  });
  return results.flatMap((result) => result.messages);
}

test("a local binding named fetch reports, so the raw-fetch band stays alive", async () => {
  const messages = await lintProbe("export function probe(url, fetch) {\n  return fetch(url);\n}\n");
  const hits = messages.filter((message) => message.ruleId === "no-restricted-syntax");
  assert.equal(hits.length, 1, `expected the fetch-binding band, got ${JSON.stringify(messages)}`);
  assert.match(hits[0].message, /local binding named fetch/);
});

test("a raw global fetch call reports, so no-restricted-globals stays alive", async () => {
  const messages = await lintProbe("export async function probe(url) {\n  return fetch(url);\n}\n");
  const hits = messages.filter((message) => message.ruleId === "no-restricted-globals");
  assert.equal(hits.length, 1, `expected the raw-fetch band, got ${JSON.stringify(messages)}`);
  assert.match(hits[0].message, /fetchPublicUrl/);
});

test("a template-literal SQL copy of the paid rule reports", async () => {
  const code =
    "export const sql = `SELECT * FROM fix_requests WHERE owner_email = ${owner} AND status IN (${statuses})`;\n";
  const messages = await lintProbe(code);
  const hits = messages.filter((message) => message.ruleId === "no-restricted-syntax");
  assert.equal(hits.length, 1, `expected the paid-copy band, got ${JSON.stringify(messages)}`);
  assert.match(hits[0].message, /paid_owners view/);
});

test("a string-literal SQL copy of the paid rule reports", async () => {
  const code = "export const sql = \"SELECT * FROM fix_requests WHERE owner_email = ? AND status IN ('paid')\";\n";
  const messages = await lintProbe(code);
  const hits = messages.filter((message) => message.ruleId === "no-restricted-syntax");
  assert.equal(hits.length, 1, `expected the paid-copy band, got ${JSON.stringify(messages)}`);
  assert.match(hits[0].message, /paid_owners view/);
});
