import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  CHATGPT_LLM_SCRAPER_ENDPOINT,
  buildChatgptVisibilityReport,
  chatgptVisibilityReportMarkdown,
  chatgptVisibilityTask,
  deriveBuyerQuestions,
  fetchChatgptLlmScraper,
  summarizeChatgptVisibilityTask,
  topicFromSiteContent
} from "./chatgpt-visibility.js";

const recorded = JSON.parse(
  fs.readFileSync(new URL("../test/fixtures/chatgpt-llm-scraper-response.json", import.meta.url), "utf8")
);

test("buyer questions come from the site's own content and stay deterministic", () => {
  const site = {
    brand: "SEO Fix Kit",
    title: "SEO Fix Kit — proof-backed SEO repair tool",
    description:
      "SEO Fix Kit is a proof-backed SEO repair tool for sites that need clear fixes, not generic audit homework."
  };
  const first = deriveBuyerQuestions(site);
  const second = deriveBuyerQuestions(site);
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  assert.ok(first.every((question) => question.endsWith("?")));
  const topic = topicFromSiteContent(site);
  assert.ok(topic.length > 0 && topic.length <= 80, `topic derived from content: ${topic}`);
  assert.ok(first.slice(0, 4).every((question) => question.includes(topic)));
  assert.match(first[4], /^Is SEO Fix Kit a good choice for /);
  const longDescription = `It ${"gives ".repeat(40)}clear proof.`;
  const capped = topicFromSiteContent({ brand: "Example", description: longDescription });
  assert.ok(capped.length <= 80);
});

test("the description drives the topic and a bare title falls back cleanly", () => {
  const fromDescription = topicFromSiteContent({
    brand: "Tiny Studio",
    description: "Tiny Studio builds tiny websites. We also make videos."
  });
  assert.equal(fromDescription, "builds tiny websites");
  const fromTitle = topicFromSiteContent({ brand: "Tiny Studio", title: "Tiny Studio" });
  assert.equal(fromTitle, "");
});

test("the ChatGPT LLM Scraper task body matches the documented endpoint shape", () => {
  const task = chatgptVisibilityTask("What are the best rendered SEO audit tools?");
  assert.deepEqual(task, {
    keyword: "What are the best rendered SEO audit tools?",
    location_code: 2840,
    language_code: "en",
    force_web_search: true
  });
  assert.match(CHATGPT_LLM_SCRAPER_ENDPOINT, /\/v3\/ai_optimization\/chat_gpt\/llm_scraper\/live\/advanced$/);
});

test("the recorded ChatGPT response parses into a named answer with competitors and cited pages", () => {
  const summary = summarizeChatgptVisibilityTask({
    brand: "SEOFixKit",
    host: "seofixkit.com",
    question: "What are the best rendered SEO audit tools?",
    payload: recorded
  });
  assert.equal(summary.named, true);
  assert.equal(summary.namedByText, false);
  assert.equal(summary.unavailable, false);
  assert.deepEqual(summary.namedInstead, ["Screaming Frog", "Semrush"]);
  assert.equal(summary.ownSiteCited, true);
  const own = summary.citedPages.find((page) => page.ownSite);
  assert.equal(own.url, "https://seofixkit.com/methodology?utm_source=chatgpt.com");
  assert.ok(summary.citedPages.some((page) => page.domain.includes("screamingfrog.co.uk")));
  assert.equal(summary.model, "gpt-4o");
  assert.equal(summary.cost, 0.004);
  assert.ok(String(summary.checkUrl).startsWith("https://chatgpt.com/"));
});

test("a brand only mentioned in the answer text still counts as named", () => {
  const payload = JSON.parse(JSON.stringify(recorded));
  payload.tasks[0].result[0].brand_entities = payload.tasks[0].result[0].brand_entities.filter(
    (entity) => entity.title !== "SEOFixKit"
  );
  payload.tasks[0].result[0].items[0].brand_entities = payload.tasks[0].result[0].items[0].brand_entities.filter(
    (entity) => entity.title !== "SEOFixKit"
  );
  const summary = summarizeChatgptVisibilityTask({
    brand: "SEOFixKit",
    host: "seofixkit.com",
    question: "What are the best rendered SEO audit tools?",
    payload
  });
  assert.equal(summary.named, true);
  assert.equal(summary.namedByText, true);
});

test("a rival brand check reads the same recorded answer as not named", () => {
  const summary = summarizeChatgptVisibilityTask({
    brand: "Rank Prompt",
    host: "rankprompt.example",
    question: "What are the best rendered SEO audit tools?",
    payload: recorded
  });
  assert.equal(summary.named, false);
  assert.equal(summary.namedByText, false);
  assert.deepEqual(summary.namedInstead, ["SEOFixKit", "Screaming Frog", "Semrush"]);
  assert.equal(summary.ownSiteCited, false);
  assert.ok(summary.citedPages.every((page) => !page.ownSite));
});

test("a rejected task maps to an unavailable answer, not a crash", () => {
  const payload = {
    status_code: 20000,
    tasks: [{ status_code: 40001, status_message: "Insufficient funds.", cost: 0 }]
  };
  const summary = summarizeChatgptVisibilityTask({ brand: "Example", question: "Q?", payload });
  assert.equal(summary.unavailable, true);
  assert.equal(summary.named, false);
  assert.match(summary.statusMessage, /Insufficient funds/);
});

test("the report aggregates five answers, the cost, and the cited pages", () => {
  const questions = deriveBuyerQuestions({ brand: "SEO Fix Kit", title: "SEO Fix Kit — proof-backed SEO repair tool" });
  const results = questions.map((question, index) => {
    const summary = summarizeChatgptVisibilityTask({
      brand: "SEOFixKit",
      host: "seofixkit.com",
      question,
      payload: recorded
    });
    return { ...summary, cost: index === 4 ? 0 : summary.cost };
  });
  const report = buildChatgptVisibilityReport({ brand: "SEOFixKit", host: "seofixkit.com", results });
  assert.equal(report.named, true);
  assert.equal(report.namedQuestions, 5);
  assert.equal(report.questionCount, 5);
  assert.equal(report.totalCost, 0.016);
  assert.equal(report.ownSiteCited, true);
  assert.ok(report.whoNamedInstead.includes("Screaming Frog"));
  const urls = report.citedPages.map((page) => page.url);
  assert.equal(new Set(urls).size, urls.length, "cited pages are deduplicated across questions");
  const markdown = chatgptVisibilityReportMarkdown(report);
  assert.match(markdown, /\*\*Yes\.\*\* ChatGPT named SEOFixKit when answering 5 of 5 buyer questions/);
  assert.match(markdown, /Screaming Frog, Semrush/);
  assert.match(markdown, /seofixkit\.com\/methodology[^ ]* \(your site\)/);
  assert.match(markdown, /Cost: \$0\.016/);
  assert.match(markdown, /not continuous monitoring/);
});

test("the report says so plainly when ChatGPT never named the brand", () => {
  const results = [1, 2, 3, 4, 5].map((n) => ({
    question: `Question ${n}?`,
    named: false,
    namedByText: false,
    unavailable: false,
    statusMessage: null,
    namedInstead: ["SEOFixKit"],
    citedPages: [],
    ownSiteCited: false,
    model: "gpt-4o",
    checkUrl: null,
    ranAt: "2026-11-12 09:14:52 +00:00",
    cost: 0.004
  }));
  const report = buildChatgptVisibilityReport({ brand: "Tiny Studio", host: "tinystudio.io", results });
  assert.equal(report.named, false);
  const markdown = chatgptVisibilityReportMarkdown(report);
  assert.match(markdown, /\*\*Not yet\.\*\* ChatGPT did not name Tiny Studio in any of the 5 buyer questions/);
  assert.match(markdown, /SEOFixKit/);
  assert.match(markdown, /No pages were cited/);
});

test("the fetcher posts one Basic-authed task to the documented endpoint", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return Response.json(JSON.parse(JSON.stringify(recorded)));
  };
  const payload = await fetchChatgptLlmScraper({
    keyword: "Is SEOFixKit a good choice for rendered SEO audits?",
    login: "login@example.com",
    password: "secret",
    fetchImpl: fetcher
  });
  assert.equal(payload.status_code, 20000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CHATGPT_LLM_SCRAPER_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, `Basic ${btoa("login@example.com:secret")}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), [
    chatgptVisibilityTask("Is SEOFixKit a good choice for rendered SEO audits?")
  ]);
});

test("the fetcher refuses to run without credentials and reports API errors", async () => {
  await assert.rejects(
    fetchChatgptLlmScraper({ keyword: "Q?", login: "", password: "", fetchImpl: async () => Response.json({}) }),
    /DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD/
  );
  await assert.rejects(
    fetchChatgptLlmScraper({
      keyword: "Q?",
      login: "login@example.com",
      password: "secret",
      fetchImpl: async () => new Response("nope", { status: 401 })
    }),
    /HTTP 401/
  );
  await assert.rejects(
    fetchChatgptLlmScraper({
      keyword: "Q?",
      login: "login@example.com",
      password: "secret",
      fetchImpl: async () => Response.json({ status_code: 40101, status_message: "Unauthorized" })
    }),
    /40101.*Unauthorized/s
  );
});
