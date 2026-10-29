import { issuePatternKey } from "./fix-patterns.js";

const MAX_FIELD = 1200;

function clip(value = "", max = MAX_FIELD) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function reportPlatform(report = {}) {
  const names = report.platformSeoAudit?.summary?.detectedPlatformNames || [];
  if (names.length) return names.join(" / ");
  const generator = report.pages?.[0]?.rendered?.generator || "";
  return clip(generator, 60);
}

function siteLine(report = {}) {
  const platform = reportPlatform(report);
  return `My website is ${report.url || report.origin || "my site"}${platform ? `, built with ${platform}` : ""}.`;
}

function problemBlock(item = {}, index = null) {
  const lines = [`${index === null ? "Problem:" : `${index}.`} ${clip(item.title, 200)}`];
  const page = item.pageUrl || item.finalUrl;
  if (item.pages?.length > 1) lines.push(`Pages: ${clip(item.pages.join(", "), 600)}`);
  else if (page) lines.push(`Page: ${page}`);
  const evidence = item.evidence || item.proof;
  if (evidence) lines.push(`What the audit found: ${clip(evidence)}`);
  if (item.why) lines.push(`Why it matters: ${clip(item.why, 400)}`);
  if (item.fix) lines.push(`Suggested fix: ${clip(item.fix)}`);
  if (item.snippet) lines.push("Suggested code:", "```", clip(item.snippet, 4000), "```");
  if (item.acceptance) lines.push(`Done when: ${clip(item.acceptance, 400)}`);
  return lines.join("\n");
}

const RULES = [
  "If you can see my code, make the smallest change that fixes it and show me the diff.",
  "If you can't see my code, give me short step-by-step instructions for my platform.",
  "Use the real URLs, titles and content from my site. Never invent facts, reviews or prices.",
  "Don't change anything unrelated."
];

export function findingFixPrompt(finding = {}, report = {}, plan = null) {
  const item = { ...finding, acceptance: plan?.acceptance || finding.acceptance };
  return [
    `You are a senior web developer and SEO expert. ${siteLine(report)}`,
    "An SEO Fix Kit audit found this problem. Please fix it.",
    "",
    problemBlock(item),
    "",
    ...RULES.map((rule) => `- ${rule}`)
  ].join("\n");
}

export function reportFixPrompt(report = {}, { limit = 5 } = {}) {
  const findings = report.findings || [];
  const groups = new Map();
  for (const plan of report.repairPlan || []) {
    const key = issuePatternKey(plan.title);
    if (!groups.has(key) && groups.size >= limit) continue;
    groups.set(key, [...(groups.get(key) || []), plan]);
  }
  const items = [...groups.entries()].map(([key, plans]) => {
    const [plan] = plans;
    const finding = findings.find((item) => item.title === plan.title) || {};
    const item = { ...finding, ...plan, evidence: plan.proof || finding.evidence };
    if (plans.length < 2) return item;
    const pages = plans
      .map((entry) => {
        const match = findings.find((candidate) => candidate.title === entry.title) || {};
        return match.pageUrl || match.finalUrl || entry.title.slice(key.length).replace(/^\s*on\s+/i, "");
      })
      .filter(Boolean);
    return { ...item, title: `${key} (${plans.length} pages)`, pages };
  });
  if (!items.length) return "";
  return [
    `You are a senior web developer and SEO expert. ${siteLine(report)}`,
    `An SEO Fix Kit audit scored it ${report.score ?? "?"}/100. Please fix these ${items.length} problems, most important first. Finish one before starting the next.`,
    "",
    items.map((item, index) => problemBlock(item, index + 1)).join("\n\n"),
    "",
    ...RULES.map((rule) => `- ${rule}`),
    "- When you're done, list what you changed for each problem."
  ].join("\n");
}
