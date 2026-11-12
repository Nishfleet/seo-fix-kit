import assert from "node:assert/strict";
import test from "node:test";
import { createAuditEngine } from "../audit-engine.js";
import { robotsAccess } from "../robots-access.js";
import { answerReadiness } from "./answer-readiness.js";
import { buildPublicCheckResponse } from "../../worker/routes/public-check.js";

test("answerReadiness flags a page whose content only exists after JavaScript", () => {
  const readiness = answerReadiness({ staticWordCount: 14, renderedWordCount: 412 });
  assert.equal(readiness.status, "javascript-only");
  assert.equal(readiness.readable, false);
  assert.match(readiness.verdict, /Google can read this page/i);
  assert.match(readiness.verdict, /AI answer tools cannot/i);
  assert.equal(readiness.rawWordCount, 14);
  assert.equal(readiness.renderedWordCount, 412);
});

test("answerReadiness clears a page that carries its content in the raw HTML", () => {
  const readiness = answerReadiness({ staticWordCount: 300, renderedWordCount: 320 });
  assert.equal(readiness.status, "readable");
  assert.equal(readiness.readable, true);
});

test("answerReadiness reports unknown when a word count is missing", () => {
  assert.equal(answerReadiness({ staticWordCount: 14 }).status, "unknown");
  assert.equal(answerReadiness().status, "unknown");
});

test("a 404 robots.txt means every crawler is allowed, not unchecked", () => {
  const access = robotsAccess(
    { ok: false, status: 404, url: "https://shop.example/robots.txt", body: "" },
    "https://shop.example/pricing?q=1"
  );
  assert.ok(access, "a missing robots.txt must still be checked");
  assert.equal(access.path, "/pricing?q=1");
  assert.equal(access.blockedSearch.length, 0);
  assert.equal(access.blockedAnswerBots.length, 0);
  for (const bot of [...access.search, ...access.ai]) {
    assert.equal(bot.allowed, true, `${bot.agent} must be allowed with no robots.txt`);
    assert.equal(bot.rule, "");
  }
});

test("a 5xx robots.txt stays unknown, so the panel can say it was not checked", () => {
  assert.equal(
    robotsAccess(
      { ok: false, status: 503, url: "https://shop.example/robots.txt", body: "" },
      "https://shop.example/"
    ),
    null
  );
  assert.equal(
    robotsAccess({ ok: false, status: null, url: "https://shop.example/robots.txt", body: "", error: "timed out" }, "https://shop.example/"),
    null
  );
});

const RENDERED_FACTS = {
  source: "rendered-dom",
  finalUrl: "https://public.example/",
  title: "Proof page",
  description: null,
  generator: null,
  robots: null,
  canonical: null,
  lang: "en",
  viewport: null,
  charset: "UTF-8",
  doctype: "html",
  hreflangs: [],
  h1s: ["Proof page"],
  headings: [{ level: "h1", text: "Proof page" }],
  links: [],
  internalLinks: [],
  externalLinks: [],
  images: [],
  imagesMissingAlt: [],
  scripts: [],
  stylesheets: [],
  openGraph: {},
  twitter: {},
  favicon: null,
  appleTouchIcon: null,
  schemaTypes: [],
  schemaErrors: [],
  navigationTiming: {},
  resourceTimings: [],
  resourceTimingsTotal: 0,
  bodyText: "",
  bodySample: ""
};

function fakeBrowser(rendered) {
  return {
    async newPage() {
      return {
        async goto() {
          return { status: () => 200 };
        },
        async evaluate() {
          return rendered;
        },
        async close() {}
      };
    },
    async close() {}
  };
}

function siteFetch(pageHtml, { robotsStatus = 404 } = {}) {
  return async (url) => {
    if (url === "https://public.example/") {
      return new Response(pageHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("", { status: robotsStatus, headers: { "content-type": "text/plain" } });
  };
}

async function auditPage(pageHtml, rendered, options = {}) {
  const engine = createAuditEngine({
    launchBrowser: async () => fakeBrowser(rendered),
    fetchImpl: siteFetch(pageHtml, options),
    pagespeedDisabled: true
  });
  return engine.auditUrl("https://public.example/", { maxPages: 1, pageSpeed: false });
}

test("a JavaScript-only page gets the AI-readability finding and a 404 robots.txt shows every crawler allowed", async () => {
  const rendered = {
    ...RENDERED_FACTS,
    wordCount: 412,
    bodyText: `${"Quote after quote rendered by JavaScript. ".repeat(20)}`,
    bodySample: "Quote after quote rendered by JavaScript."
  };
  const report = await auditPage(
    "<!doctype html><html><head><title>Quotes</title></head><body><div id=\"root\"></div></body></html>",
    rendered
  );
  const finding = report.findings.find((item) => item.aiReadability);
  assert.ok(finding, "the engine must report AI answer tools cannot read the content");
  assert.equal(finding.severity, "warning");
  assert.match(finding.title, /AI answer tools cannot read/);
  assert.match(finding.evidence, /Raw HTML: 0 words; rendered page: 412 words/);
  assert.match(finding.fix, /server rendering or pre-rendering/i);
  assert.doesNotMatch(finding.fix, /llms\.txt/i);
  const guard = report.findings.find(
    (item) => /rendered content is not thin/.test(item.title) && item.severity === "good"
  );
  assert.ok(guard, "the thin-content guard stays for tools that judge Google's view");
  assert.ok(
    report.crawlerAccess && [...report.crawlerAccess.search, ...report.crawlerAccess.ai].every((bot) => bot.allowed),
    "a 404 robots.txt means every crawler is allowed"
  );

  const payload = buildPublicCheckResponse(report);
  assert.match(payload.findings[0].title, /AI answer tools cannot read/, "the verdict leads, above the fold");
});

test("a page with content in the raw HTML gets no AI-readability finding", async () => {
  const rendered = {
    ...RENDERED_FACTS,
    wordCount: 320,
    bodyText: "Plain text page. ".repeat(40),
    bodySample: "Plain text page."
  };
  const report = await auditPage(
    `<!doctype html><html><head><title>Proof page</title></head><body><h1>Proof page</h1><p>${"Plain text page. ".repeat(40)}</p></body></html>`,
    rendered
  );
  assert.ok(
    !report.findings.some((item) => item.aiReadability),
    "content in the first HTML needs no AI-readability warning"
  );
});
