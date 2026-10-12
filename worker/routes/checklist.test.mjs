import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { escapeHtml } from "../../shared/audit-engine.js";
import { CHECKLIST_CSV, CHECKLIST_SECTIONS, checklistCsvResponse, checklistHtml } from "./checklist.js";

const origin = "https://seofixkit.com";

test("checklist page lists every CSV row and links the check plus guides", () => {
  const html = checklistHtml(origin);
  assert.match(html, /Proof-First Technical SEO Checklist/);
  assert.match(html, /Disclosure:|No email required/);
  assert.doesNotMatch(html, /\/go\//, "checklist must not carry outbound affiliate /go links");
  assert.match(html, new RegExp(`href="${origin}/check"`));
  assert.match(html, new RegExp(`href="${origin}/guides/best-seo-audit-tools"`));
  assert.match(html, new RegExp(`href="${origin}/guides/semrush-vs-alternatives"`));
  assert.match(html, new RegExp(`href="${origin}/guides/fast-hosting-for-seo"`));
  assert.match(html, new RegExp(`href="${origin}/checklist\\.csv"`));
  assert.match(html, /download="proof-first-technical-seo-checklist\.csv"/);
  assert.match(html, /never guaranteed/);
  for (const section of CHECKLIST_SECTIONS) {
    assert.match(html, new RegExp(escapeHtml(section.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), section.title);
    for (const item of section.items) {
      const visible = escapeHtml(item);
      assert.match(html, new RegExp(visible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), item);
    }
  }
});

test("checklist CSV download matches the public file and the page rows", () => {
  const shipped = readFileSync(new URL("../../public/checklist.csv", import.meta.url), "utf8");
  assert.equal(CHECKLIST_CSV, shipped, "worker CSV must match public/checklist.csv");
  const response = checklistCsvResponse();
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(response.headers.get("content-disposition") || "", /proof-first-technical-seo-checklist\.csv/);
});
