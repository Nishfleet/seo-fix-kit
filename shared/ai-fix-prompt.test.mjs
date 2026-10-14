import assert from "node:assert/strict";
import test from "node:test";
import { findingFixPrompt, reportFixPrompt } from "./ai-fix-prompt.js";

const report = {
  url: "https://shop.example/",
  score: 71,
  platformSeoAudit: { summary: { detectedPlatformNames: ["Shopify"] } },
  findings: [
    {
      title: "Missing meta description on /",
      severity: "warning",
      pageUrl: "https://shop.example/",
      why: "Search results show a description under your title.",
      evidence: "No meta description tag.",
      fix: "Add a meta description.",
      snippet: '<meta name="description" content="Handmade mugs." />'
    },
    { title: "Sitemap not found", severity: "warning", evidence: "GET /sitemap.xml returned 404.", fix: "Publish one." }
  ],
  repairPlan: [
    {
      priority: 1,
      title: "Missing meta description on /",
      proof: "No meta description tag.",
      fix: "Add a meta description.",
      acceptance: "The page has one meta description."
    },
    { priority: 2, title: "Sitemap not found", proof: "GET /sitemap.xml returned 404.", fix: "Publish one." }
  ]
};

test("a finding prompt names the site, platform, evidence, code and done-when check", () => {
  const prompt = findingFixPrompt(report.findings[0], report, report.repairPlan[0]);
  assert.match(prompt, /My website is https:\/\/shop\.example\/, built with Shopify\./);
  assert.match(prompt, /Problem: Missing meta description on \//);
  assert.match(prompt, /What the audit found: No meta description tag\./);
  assert.match(prompt, /```\n<meta name="description" content="Handmade mugs\." \/>\n```/);
  assert.match(prompt, /Done when: The page has one meta description\./);
  assert.match(prompt, /Never invent facts/);
});

test("the report prompt lists the repair plan in order with the score", () => {
  const prompt = reportFixPrompt(report);
  assert.match(prompt, /scored it 71\/100\. Please fix these 2 problems/);
  assert.ok(prompt.indexOf("1. Missing meta description") < prompt.indexOf("2. Sitemap not found"));
  assert.match(prompt, /Suggested code:/);
  assert.equal(reportFixPrompt({ ...report, repairPlan: [] }), "");
});

test("long evidence is clipped so prompts stay pasteable", () => {
  const prompt = findingFixPrompt({ title: "Big", evidence: "x".repeat(5000) }, { url: "https://a.example/" });
  assert.ok(prompt.length < 2000);
  assert.match(prompt, /…/);
});
