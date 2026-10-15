import { issuePatternKey } from "./audit-engine.js";
import { reportFixPrompt, reportPlatform } from "./ai-fix-prompt.js";
import { llmsTxt, robotsTxt, sitemapXml } from "./free-tools/generators.js";

const SEVERITY_ORDER = { critical: 0, warning: 1, notice: 2 };
const SEVERITY_LABEL = { critical: "Critical", warning: "Warning", notice: "Notice" };

function hasFinding(report, pattern) {
  return (report.findings || []).some((finding) => pattern.test(finding.title || ""));
}

function slug(value, fallback = "page") {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function pageSlug(url, origin) {
  try {
    const parsed = new URL(url);
    if (origin && parsed.origin === origin && parsed.pathname === "/" && !parsed.search) return "home";
    return slug(`${parsed.pathname}${parsed.search}`, "home");
  } catch {
    return slug(url);
  }
}

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

// One entry per distinct problem, with every page it appears on.
export function groupedFixes(report = {}) {
  const groups = new Map();
  for (const item of report.repairPlan || []) {
    if (!Object.hasOwn(SEVERITY_ORDER, item.severity)) continue;
    const key = issuePatternKey(item.title);
    const group = groups.get(key) || {
      key,
      title: key,
      severity: item.severity,
      fix: item.fix || "",
      snippet: item.snippet || "",
      acceptance: item.acceptance || "",
      effort: item.estimatedEffort || "",
      scoreGain: 0,
      pages: []
    };
    if (SEVERITY_ORDER[item.severity] < SEVERITY_ORDER[group.severity]) group.severity = item.severity;
    if (!group.snippet && item.snippet) group.snippet = item.snippet;
    group.scoreGain = Math.max(group.scoreGain, Number(item.scoreGain || 0));
    const page = item.pageUrl || "";
    if (page && !group.pages.includes(page)) group.pages.push(page);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.scoreGain - a.scoreGain
  );
}

function indexablePages(report = {}) {
  const noindexed = new Set(
    (report.findings || []).filter((finding) => /noindex/i.test(finding.title || "")).map((finding) => finding.pageUrl)
  );
  return (report.pageSummaries || [])
    .filter((page) => page.status >= 200 && page.status < 300)
    .filter((page) => !page.finalUrl || page.finalUrl === page.url)
    .filter((page) => !noindexed.has(page.url))
    .map((page) => page.url);
}

function brokenLinks(report = {}) {
  const rows = [];
  const seen = new Set();
  for (const page of report.pages || []) {
    for (const check of page.linkChecks || []) {
      const status = Number(check?.status || 0);
      if (check?.ok !== false && status < 400) continue;
      if (status === 429 || status === 403) continue;
      const key = `${page.url} ${check.url}`;
      if (!check.url || seen.has(key)) continue;
      seen.add(key);
      rows.push([page.url, check.url, status || check.error || "no response"]);
    }
  }
  return rows;
}

function headSnippetFiles(report = {}) {
  const byPage = new Map();
  for (const finding of report.findings || []) {
    if (!finding.snippet || !Object.hasOwn(SEVERITY_ORDER, finding.severity)) continue;
    const page = finding.pageUrl || report.url || "";
    const list = byPage.get(page) || [];
    if (!list.some((entry) => entry.snippet === finding.snippet)) list.push(finding);
    byPage.set(page, list);
  }
  const used = new Set();
  return [...byPage.entries()].map(([page, findings]) => {
    let name = pageSlug(page, report.origin);
    while (used.has(name)) name = `${name}-2`;
    used.add(name);
    const body = findings
      .map((finding) => `<!-- Fixes: ${String(finding.title).replace(/--/g, "-")} -->\n${finding.snippet.trim()}`)
      .join("\n\n");
    return {
      path: `code/${name}.html`,
      content: `<!-- Code for ${page}. Title, meta and link tags go in <head>; replace the old tag if one exists. Other elements go where the page content is. -->\n\n${body}\n`
    };
  });
}

function robotsFile(report = {}) {
  const origin = report.origin || "";
  const sitemap = origin ? `${origin}/sitemap.xml` : "";
  const access = report.crawlerAccess;
  if (!access || hasFinding(report, /^Robots\.txt not found/)) {
    return {
      path: "robots.txt",
      content: robotsTxt({ access: "allow", sitemaps: sitemap }).code
    };
  }
  const lines = [];
  const blockedAnswers = access.blockedAnswerBots || [];
  const blockedSearch = access.blockedSearch || [];
  for (const bot of [...blockedSearch, ...blockedAnswers]) {
    lines.push(`# ${bot.agent} (${bot.product}) is blocked${bot.rule ? ` by "${bot.rule}"` : ""}.`);
    lines.push(`User-agent: ${bot.agent}`, "Allow: /", "");
  }
  if (!(access.sitemaps || []).length && sitemap) lines.push(`Sitemap: ${sitemap}`, "");
  if (!lines.length) return null;
  return {
    path: "robots-additions.txt",
    content: `# Add these lines to your existing robots.txt at ${origin}/robots.txt.\n# Remove or narrow the rule each comment names, or the block stays in place.\n\n${lines.join("\n")}`
  };
}

function llmsFile(report = {}) {
  if (report.llmsTxt?.ok) return null;
  const first = report.pages?.[0]?.rendered || {};
  const links = (report.pageSummaries || [])
    .filter((page) => page.status >= 200 && page.status < 300 && page.title)
    .slice(0, 25)
    .map((page) => `${page.title.replace(/\|/g, "-")} | ${page.url}`)
    .join("\n");
  const name = (first.title || report.origin || "").split(/\s[|\-–—]\s/)[0];
  return {
    path: "llms.txt",
    content: llmsTxt({ siteName: name, summary: first.description || "", links: links ? `## Pages\n${links}` : "" })
      .code
  };
}

function fixesMarkdown(report, groups) {
  const lines = [
    `# Fix list for ${report.url || report.origin}`,
    "",
    `Score now: ${report.score ?? "?"}/100.${report.projectedScore ? ` Fixing the top ${report.projectedScore.fixes} could take it to about ${report.projectedScore.to}.` : ""}`,
    `${groups.length} distinct problems, most important first. Tick each one off when its "Done when" check passes, then rerun the audit.`,
    ""
  ];
  groups.forEach((group, index) => {
    lines.push(`## ${index + 1}. ${group.title}`);
    lines.push("");
    lines.push(
      `- [ ] ${SEVERITY_LABEL[group.severity]}${group.scoreGain ? ` · about +${group.scoreGain} points` : ""}${group.effort ? ` · effort: ${group.effort}` : ""}`
    );
    if (group.pages.length) {
      lines.push(
        `- Pages (${group.pages.length}): ${group.pages.slice(0, 10).join(", ")}${group.pages.length > 10 ? ", …" : ""}`
      );
    }
    if (group.fix) lines.push(`- Fix: ${group.fix}`);
    if (group.acceptance) lines.push(`- Done when: ${group.acceptance}`);
    if (group.snippet) lines.push("", "```html", group.snippet.trim(), "```");
    lines.push("");
  });
  return lines.join("\n");
}

function readme(report, files, groups) {
  const platform = reportPlatform(report);
  const describe = {
    "FIXES.md": "Every problem once, most important first, with pages, points, the fix and a done-when check.",
    "fixes.csv": "The same list for a spreadsheet, Trello, Jira, Asana or Linear import.",
    "AI-PROMPT.md": "Paste into ChatGPT, Claude or Cursor and it works through the fixes in order.",
    "robots.txt": "A complete robots.txt. Upload it to your site root.",
    "robots-additions.txt": "Lines to add to your robots.txt so search and AI answer crawlers can read the site.",
    "sitemap.xml": "Every indexable page the audit found. Upload it to your site root if you have no sitemap.",
    "llms.txt": "A starter llms.txt for AI tools. Check the summary, then upload it to your site root.",
    "broken-links.csv": "Every broken link, the page it sits on, and the error. Fix the link or add a redirect."
  };
  const lines = [
    `# SEO Fix Kit files for ${report.url || report.origin}`,
    "",
    `Made from your audit on ${String(report.scannedAt || "").slice(0, 10) || "the report date"}${platform ? ` (site built with ${platform})` : ""}. ${groups.length} problems to fix.`,
    "",
    "## What's inside",
    ""
  ];
  for (const file of files) {
    if (describe[file.path]) lines.push(`- **${file.path}**: ${describe[file.path]}`);
  }
  const codeFiles = files.filter((file) => file.path.startsWith("code/"));
  if (codeFiles.length) {
    lines.push(
      `- **code/** (${codeFiles.length} files): ready-to-paste code for each page (head tags and page elements), one file per page.`
    );
  }
  lines.push(
    "",
    "## How to use it",
    "",
    "1. Start at the top of FIXES.md. Critical problems first.",
    "2. Paste the code from code/ into each page, or hand the folder to your developer.",
    "3. Upload the site-root files (robots, sitemap, llms.txt) if the list says you need them.",
    "4. Rerun the audit in SEO Fix Kit. Each fix shows as fixed or still open.",
    "",
    "Nothing here was applied to your site. Review each change before it goes live. No ranking promise is made."
  );
  return `${lines.join("\n")}\n`;
}

export function buildFixKitFiles(report = {}) {
  const groups = groupedFixes(report);
  const files = [];
  files.push({ path: "FIXES.md", content: fixesMarkdown(report, groups) });
  files.push({
    path: "fixes.csv",
    content: csv([
      ["Priority", "Severity", "Problem", "Points", "Pages", "Fix", "Done when", "Status"],
      ...groups.map((group, index) => [
        index + 1,
        SEVERITY_LABEL[group.severity],
        group.title,
        group.scoreGain || "",
        group.pages.join(" "),
        group.fix,
        group.acceptance,
        "Open"
      ])
    ])
  });
  const prompt = reportFixPrompt(report, { limit: 15 });
  if (prompt) files.push({ path: "AI-PROMPT.md", content: `${prompt}\n` });
  const robots = robotsFile(report);
  if (robots) files.push(robots);
  const pages = indexablePages(report);
  if (pages.length) files.push({ path: "sitemap.xml", content: sitemapXml({ urls: pages.join("\n") }).code });
  const llms = llmsFile(report);
  if (llms) files.push(llms);
  const broken = brokenLinks(report);
  if (broken.length)
    files.push({ path: "broken-links.csv", content: csv([["Page", "Broken link", "Error"], ...broken]) });
  files.push(...headSnippetFiles(report));
  files.unshift({ path: "README.md", content: readme(report, files, groups) });
  return files;
}

// What a buyer can see before paying: file names and counts, no contents.
export function fixKitManifest(report = {}) {
  const files = buildFixKitFiles(report);
  const groups = groupedFixes(report);
  const codeFiles = files.filter((file) => file.path.startsWith("code/")).length;
  const brokenFile = files.find((file) => file.path === "broken-links.csv");
  return {
    problems: groups.length,
    codeFiles,
    brokenLinks: brokenFile ? brokenFile.content.trim().split("\n").length - 1 : 0,
    sitemapPages: indexablePages(report).length,
    files: files.filter((file) => !file.path.startsWith("code/")).map((file) => file.path)
  };
}

export function fixKitFilename(report = {}) {
  let host = "site";
  try {
    host = new URL(report.url || report.origin).hostname;
  } catch {
    // keep the fallback
  }
  return `seo-fix-kit-${slug(host, "site")}.zip`;
}
