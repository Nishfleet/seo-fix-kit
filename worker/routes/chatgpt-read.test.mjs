import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import test from "node:test";
import { robotsAccess } from "../../shared/robots-access.js";
import {
  CHATGPT_READ_BOTS,
  botAllowance,
  buildChatgptReadResult,
  contentEvidence,
  renderVerdict,
  schemaEvidence
} from "../../shared/chatgpt-read/answer-readiness.js";
import { chatgptReadUrlError } from "../../shared/chatgpt-read/client.js";
import { checkHandoffHref } from "../../shared/public-check/check-handoff.js";
import {
  CHATGPT_READ_API_PATH,
  CHATGPT_READ_LIMITS,
  canChatgptReadHtml,
  canChatgptReadJsonLd,
  chatgptReadQuotaChecks,
  runChatgptReadCheck
} from "./chatgpt-read.js";

const origin = "https://seofixkit.com";

test("the tool checks exactly the three crawlers the issue names", () => {
  assert.deepEqual(
    CHATGPT_READ_BOTS.map((bot) => bot.agent),
    ["GPTBot", "ClaudeBot", "PerplexityBot"]
  );
  assert.deepEqual(
    CHATGPT_READ_BOTS.map((bot) => bot.product),
    ["ChatGPT (OpenAI)", "Claude (Anthropic)", "Perplexity"]
  );
});

test("bot allowance comes from robots.txt and keeps the matching rule", () => {
  const access = robotsAccess(
    {
      ok: true,
      url: "https://shop.example/robots.txt",
      body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"
    },
    "https://shop.example/pricing"
  );
  const bots = botAllowance(access);
  assert.equal(bots.length, 3);
  const gpt = bots.find((bot) => bot.agent === "GPTBot");
  assert.equal(gpt.allowed, false);
  assert.match(gpt.rule, /Disallow/i, "the blocking rule is shown as evidence");
  assert.equal(bots.find((bot) => bot.agent === "ClaudeBot").allowed, true);
  assert.equal(bots.find((bot) => bot.agent === "PerplexityBot").allowed, true);
});

test("bot allowance never invents a block when robots.txt could not be read", () => {
  const bots = botAllowance(null);
  assert.equal(bots.length, 3);
  assert.ok(
    bots.every((bot) => bot.allowed === true),
    "an unreadable robots.txt is not reported as a block"
  );
  assert.ok(
    bots.every((bot) => bot.known === false),
    "each bot records that robots.txt said nothing about it"
  );
});

test("content evidence reads the raw HTML facts, not the rendered ones", () => {
  const thin = contentEvidence({ wordCount: 12, h1s: [], title: "", bodySample: "tiny" });
  assert.equal(thin.hasMainContent, false);
  assert.equal(thin.wordCount, 12);
  assert.equal(thin.hasTitle, false);

  const rich = contentEvidence({
    wordCount: 900,
    h1s: ["Pricing"],
    headings: [{ level: "h2", text: "Plans" }],
    title: "Pricing",
    description: "Plans and prices.",
    bodySample: "x".repeat(900)
  });
  assert.equal(rich.hasMainContent, true);
  assert.equal(rich.h1Count, 1);
  assert.equal(rich.headingCount, 1);
  assert.equal(rich.hasTitle, true);
  assert.equal(rich.hasDescription, true);
  assert.ok(rich.bodySample.length <= 280, "the sample stays short");
});

test("schema evidence lists the JSON-LD types found and any parse errors", () => {
  const none = schemaEvidence({ schemaTypes: [], schemaErrors: [] });
  assert.equal(none.hasSchema, false);
  assert.equal(none.typeCount, 0);

  const some = schemaEvidence({ schemaTypes: ["Organization", "Organization", "WebPage"], schemaErrors: [] });
  assert.deepEqual(some.types, ["Organization", "WebPage"], "duplicate types collapse");
  assert.equal(some.hasSchema, true);

  const broken = schemaEvidence({ schemaTypes: ["invalid-json"], schemaErrors: ["block 1"] });
  assert.deepEqual(broken.types, [], "an unparseable block is not counted as a schema type");
  assert.equal(broken.errorCount, 1);
});

test("the verdict names the exact state: blocked, partly blocked, thin, no schema, readable", () => {
  const bots = (allowed) => CHATGPT_READ_BOTS.map((bot) => ({ ...bot, allowed, rule: "" }));
  const content = { ...contentEvidence({ wordCount: 800 }), hasMainContent: true };
  const schema = { ...schemaEvidence({ schemaTypes: ["WebPage"] }), hasSchema: true };

  assert.equal(renderVerdict({ bots: bots(false), content, schema }).status, "blocked");
  assert.equal(
    renderVerdict({ bots: [bots(true)[0], bots(false)[1], bots(false)[2]], content, schema }).status,
    "partly-blocked"
  );
  assert.equal(
    renderVerdict({
      bots: bots(true),
      content: { ...content, hasMainContent: false },
      schema: { ...schema, hasSchema: false }
    }).status,
    "thin"
  );
  assert.equal(
    renderVerdict({ bots: bots(true), content, schema: { ...schema, hasSchema: false } }).status,
    "no-schema"
  );
  assert.equal(renderVerdict({ bots: bots(true), content, schema }).status, "readable");

  const blocked = renderVerdict({ bots: bots(false), content, schema });
  assert.match(blocked.headline, /^No\./, "a blocked verdict answers the question plainly");
  assert.match(blocked.detail, /GPTBot, ClaudeBot, PerplexityBot/);
});

test("the result payload carries the checked URL, the bots and both evidence blocks", () => {
  const payload = buildChatgptReadResult({
    url: "https://example.com/pricing",
    scannedAt: "2026-11-12T00:00:00.000Z",
    durationMs: 900,
    crawlerAccess: robotsAccess(
      { ok: true, url: "https://example.com/robots.txt", body: "User-agent: *\nAllow: /\n" },
      "https://example.com/pricing"
    ),
    pages: [
      {
        finalUrl: "https://example.com/pricing",
        static: {
          source: "static-html",
          wordCount: 640,
          h1s: ["Pricing"],
          headings: [{ level: "h2", text: "Plans" }],
          title: "Pricing",
          description: "Plans and prices.",
          schemaTypes: ["Organization", "Product"],
          schemaErrors: [],
          bodySample: "Plans and prices for every team."
        },
        rendered: { wordCount: 900 }
      }
    ]
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "ai-read-check");
  assert.equal(payload.checkedUrl, "https://example.com/pricing");
  assert.equal(payload.finalUrl, "https://example.com/pricing");
  assert.equal(payload.robotsChecked, true);
  assert.equal(payload.bots.length, 3);
  assert.ok(payload.bots.every((bot) => bot.allowed));
  assert.equal(payload.content.wordCount, 640);
  assert.equal(payload.content.hasMainContent, true);
  assert.equal(payload.schema.typeCount, 2);
  assert.equal(payload.schema.hasSchema, true);
  assert.equal(payload.verdict.status, "readable");
  assert.equal(payload.content.wordCount, 640, "the evidence comes from the static HTML, not the rendered page");
});

test("a report without pages still produces a truthful answer", () => {
  const payload = buildChatgptReadResult({ url: "https://example.com/" });
  assert.equal(payload.ok, true);
  assert.equal(payload.content.wordCount, 0);
  assert.equal(payload.schema.hasSchema, false);
  assert.equal(payload.robotsChecked, false);
  assert.equal(payload.bots.length, 3);
});

test("a missing robots.txt is never described as robots.txt allowing the crawlers", () => {
  const payload = buildChatgptReadResult({
    url: "https://example.com/",
    pages: [
      {
        finalUrl: "https://example.com/",
        static: { wordCount: 640, title: "Example", schemaTypes: ["Organization"] }
      }
    ]
  });
  assert.equal(payload.robotsChecked, false);
  assert.ok(
    payload.bots.every((bot) => bot.allowed),
    "a missing robots.txt blocks nobody"
  );
  assert.ok(
    payload.bots.every((bot) => bot.robotsKnown === false),
    "each bot records that robots.txt said nothing about it"
  );
  assert.match(
    payload.verdict.detail,
    /no robots\.txt was found/,
    "the verdict must not claim robots.txt allowed the crawlers"
  );
  assert.doesNotMatch(
    payload.verdict.detail,
    /robots\.txt allows all three/,
    "a missing robots.txt must not be reported as an allow rule"
  );
});

test("quota buckets cover per-network and per-site windows without storing the target host", async () => {
  const checks = await chatgptReadQuotaChecks("iphash123", "Example.COM");
  const keys = checks.map((check) => check.bucket);
  assert.ok(
    keys.some((key) => key.startsWith("chatgpt-read:ip-hour:") && key.endsWith(":iphash123")),
    "per-network hourly bucket"
  );
  assert.ok(
    keys.some((key) => key.startsWith("chatgpt-read:ip-day:")),
    "per-network daily bucket"
  );
  assert.ok(
    keys.some((key) => key.startsWith("chatgpt-read:target-hour:")),
    "per-site hourly bucket"
  );
  assert.ok(
    keys.some((key) => key.startsWith("chatgpt-read:target-day:")),
    "per-site daily bucket"
  );
  const targetHourKey = keys.find((key) => key.startsWith("chatgpt-read:target-hour:"));
  assert.doesNotMatch(targetHourKey, /example\.com/i, "the target host must never be stored in plaintext");
  assert.match(targetHourKey, /[0-9a-f]{32}$/, "the target bucket ends in a 32-hex host hash");
  const same = await chatgptReadQuotaChecks("iphash123", "example.com");
  assert.deepEqual(
    same.map((check) => check.bucket),
    keys,
    "the same host hashes to the same bucket keys"
  );
  assert.ok(checks.every((check) => Number(check.limit) > 0));
  assert.deepEqual(CHATGPT_READ_LIMITS, { ipHour: 6, ipDay: 15, targetHour: 3, targetDay: 10 });
});

test("the API rejects private, malformed and non-http targets before any render", async () => {
  const prepared = [];
  const env = {
    WAITLIST_DB: {
      prepare(sql) {
        prepared.push(sql);
        return {
          bind() {
            return {
              async run() {
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    }
  };

  for (const url of [
    "",
    "not a url",
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "ftp://example.com/"
  ]) {
    const response = await runChatgptReadCheck(
      new Request(`https://seofixkit.com${CHATGPT_READ_API_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      }),
      env
    );
    assert.equal(response.status, 400, `must reject: ${url}`);
    const payload = await response.json();
    assert.ok(payload.error, `must carry an error for: ${url}`);
  }
  assert.equal(prepared.length, 0, "no quota row is written for a rejected URL");
});

test("an exhausted quota bucket returns 429 without touching the audit engine", async () => {
  const sqlSeen = [];
  const env = {
    WAITLIST_DB: {
      prepare(sql) {
        sqlSeen.push(sql);
        return {
          bind() {
            return {
              async run() {
                return { meta: { changes: 0 } };
              }
            };
          }
        };
      }
    }
  };

  const response = await runChatgptReadCheck(
    new Request(`https://seofixkit.com${CHATGPT_READ_API_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
      body: JSON.stringify({ url: "https://93.184.216.34/" })
    }),
    env
  );

  assert.equal(response.status, 429);
  const payload = await response.json();
  assert.ok(payload.error);
  assert.ok(typeof payload.resetAt === "string" && !Number.isNaN(Date.parse(payload.resetAt)));
  assert.ok(sqlSeen.some((sql) => sql.includes("INSERT INTO audit_usage") && sql.includes("ON CONFLICT(bucket)")));
});

test("the tool needs no account, no email and no sign-up before the result", async () => {
  const html = canChatgptReadHtml(origin);
  assert.doesNotMatch(html, /type="email"/i, "there is no email field");
  assert.doesNotMatch(html, /name="email"/i, "the page never asks for an email address");
  assert.doesNotMatch(html, /type="password"/i, "the page never asks for a password");
  assert.doesNotMatch(html, /create an account|sign up|sign-up/i, "the page never asks for an account");
  assert.match(html, /No account, no email/i);

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ ok: true, mode: "ai-read-check", bots: [], content: {}, schema: {}, verdict: {} }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };
  try {
    const { runChatgptReadTool } = await import("../../shared/chatgpt-read/client.js");
    await runChatgptReadTool(
      { url: "https://example.com/" },
      {
        apiPath: "/api/chatgpt-read-check"
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1, "the tool makes exactly one request");
  assert.equal(calls[0], "/api/chatgpt-read-check");
});

test("the page shows the URL form, the result region and one CTA into the full check", () => {
  const html = canChatgptReadHtml(origin);
  assert.match(html, /id="chatgpt-read-form"/);
  assert.match(html, /id="chatgpt-read-url" name="url" type="text" inputmode="url"/);
  assert.match(html, /id="chatgpt-read-result"/);
  assert.match(html, /<script type="module" src="https:\/\/seofixkit\.com\/chatgpt-read\.js"><\/script>/);
  assert.match(html, /<a class="cta" href="https:\/\/seofixkit\.com\/check">Run the full free page check<\/a>/);
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  assert.doesNotMatch(main, /href="[^"]*\/beta/, "the tool body does not push a sign-up");
  assert.doesNotMatch(main, /href="[^"]*\/pricing#/, "the tool body has one CTA only");
  assert.equal([...main.matchAll(/class="cta"/g)].length, 1, "the tool body ends with exactly one CTA");
});

test("the page carries its own title, description, canonical URL and share image", () => {
  const html = canChatgptReadHtml(origin);
  assert.match(html, /<title>Can ChatGPT Read My Page\? - SEO Fix Kit<\/title>/);
  assert.match(html, /<meta name="description" content="Check if ChatGPT, Claude and Perplexity can read your page\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/seofixkit\.com\/can-chatgpt-read-my-page" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/seofixkit\.com\/can-chatgpt-read-my-page" \/>/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/seofixkit\.com\/can-chatgpt-read-og-image\.png" \/>/,
    "the page uses its own share image"
  );
  assert.match(
    html,
    /<meta name="twitter:image" content="https:\/\/seofixkit\.com\/can-chatgpt-read-og-image\.png" \/>/,
    "the page uses its own share image for X"
  );
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  assert.doesNotMatch(html, /noindex/i, "the page must stay searchable");
});

test("the page JSON-LD describes the tool, the page and the FAQ", () => {
  const blocks = [
    ...canChatgptReadHtml(origin).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  ].map((match) => JSON.parse(match[1]));
  assert.ok(blocks.length >= 1, "the page emits structured data");
  const graph = blocks.flatMap((block) => (Array.isArray(block["@graph"]) ? block["@graph"] : [block]));
  const webpage = graph.find((node) => node["@type"] === "WebPage");
  const app = graph.find((node) => node["@type"] === "SoftwareApplication");
  const faq = graph.find((node) => node["@type"] === "FAQPage");

  assert.ok(webpage, "WebPage JSON-LD is present");
  assert.equal(webpage.url, "https://seofixkit.com/can-chatgpt-read-my-page");
  assert.equal(webpage.publisher["@type"], "Organization");
  assert.ok(app, "SoftwareApplication JSON-LD is present");
  assert.match(app.description, /GPTBot, ClaudeBot and PerplexityBot/);
  assert.ok(faq, "FAQPage JSON-LD is present");
  assert.ok(faq.mainEntity.length >= 4);
  for (const question of faq.mainEntity) {
    assert.ok(question.acceptedAnswer?.text, "every FAQ question has an answer");
  }
  const serialized = JSON.stringify(graph);
  assert.doesNotMatch(serialized, /guarantees rankings|guaranteed traffic|guarantee citations/i);
});

test("the standalone JSON-LD helper matches the page's structured data", () => {
  const block = JSON.parse(
    canChatgptReadJsonLd(origin)
      .replace(/^<script type="application\/ld\+json">/, "")
      .replace(/<\/script>$/, "")
  );
  const graph = block["@graph"];
  assert.equal(graph.length, 3);
  assert.equal(graph.find((node) => node["@type"] === "WebPage").url, "https://seofixkit.com/can-chatgpt-read-my-page");
  assert.equal(
    graph.find((node) => node["@type"] === "FAQPage")["@id"],
    "https://seofixkit.com/can-chatgpt-read-my-page#faq"
  );
});

test("the visible FAQ matches the JSON-LD FAQ questions and answers", () => {
  const html = canChatgptReadHtml(origin);
  const block = JSON.parse(
    canChatgptReadJsonLd(origin)
      .replace(/^<script type="application\/ld\+json">/, "")
      .replace(/<\/script>$/, "")
  );
  const faq = block["@graph"].find((node) => node["@type"] === "FAQPage");
  for (const question of faq.mainEntity) {
    assert.ok(html.includes(question.name), `the page shows the question: ${question.name}`);
    assert.ok(html.includes(question.acceptedAnswer.text), `the page shows the answer for: ${question.name}`);
  }
});

test("the page copy keeps the honest boundary about citations and rankings", () => {
  const html = canChatgptReadHtml(origin);
  assert.match(
    html,
    /does not sample live answer engines, track citations, or promise rankings, traffic, indexing, revenue or AI citations/i
  );
  assert.match(html, /no stored report/i);
  assert.match(html, /rate-limit/i);
});

test("the client validator applies the server's public URL rules", () => {
  for (const input of [
    "notaurl",
    "example",
    "intranet",
    "http://printer/",
    "",
    "https://",
    "ftp://example.com",
    "javascript:alert(1)"
  ]) {
    assert.equal(chatgptReadUrlError(input), "Enter a valid public website URL.", `client rejects: ${input}`);
  }
  for (const input of ["example.com", "https://example.com/x", "example.com/about?q=1", "//example.com/a"]) {
    assert.equal(chatgptReadUrlError(input), "", `client accepts: ${input}`);
  }
});

test("the CTA hands the checked URL into the full check", () => {
  assert.equal(checkHandoffHref("https://example.com/pricing"), "/beta?url=https%3A%2F%2Fexample.com%2Fpricing");
});

test("the client script posts to the dedicated endpoint and renders the verdict", () => {
  const client = fs.readFileSync(new URL("../../shared/chatgpt-read/client.js", import.meta.url), "utf8");
  assert.match(client, /\/api\/chatgpt-read-check/);
  assert.doesNotMatch(client, /\/api\/public-check/, "the focused tool has its own endpoint");
  assert.match(client, /checkHandoffHref/);
});

test("the dedicated share image exists and is a 1200x630 PNG", () => {
  const imagePath = new URL("../../public/can-chatgpt-read-og-image.png", import.meta.url);
  assert.ok(fs.existsSync(imagePath), "the share image is committed");
  const bytes = fs.readFileSync(imagePath);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
});

test("the page is listed for search engines", () => {
  const sitemap = fs.readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /<loc>https:\/\/seofixkit\.com\/can-chatgpt-read-my-page<\/loc>/);
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod>/);
});

test("the tool answers a real page end to end against a local fixture", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n`);
      return;
    }
    if (req.url === "/pricing") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html lang="en"><head><title>Pricing</title><meta name="description" content="Plans and prices."><script type="application/ld+json">${JSON.stringify(
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Starter"
          }
        )}</script></head><body><h1>Pricing</h1><p>${"Plans and prices for every team. ".repeat(12)}</p></body></html>`
      );
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
    const { auditUrl } = await import("../../server/audit/engine.js");
    const report = await auditUrl(`${fixtureOrigin}/pricing`, {
      maxPages: 1,
      pageSpeed: false,
      appOrigin: "https://seofixkit.com"
    });
    const payload = buildChatgptReadResult(report);
    assert.equal(payload.ok, true);
    assert.equal(payload.checkedUrl, `${fixtureOrigin}/pricing`);
    assert.equal(payload.bots.find((bot) => bot.agent === "GPTBot").allowed, false);
    assert.equal(payload.bots.find((bot) => bot.agent === "ClaudeBot").allowed, true);
    assert.equal(payload.verdict.status, "partly-blocked");
    assert.ok(payload.content.wordCount >= 50, "the fixture page has real text in the raw HTML");
    assert.equal(payload.schema.types.includes("Product"), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
