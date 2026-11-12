import assert from "node:assert/strict";
import test from "node:test";
import { buildChatgptReadResult } from "../shared/chatgpt-read/answer-readiness.js";
import { robotsAccess } from "../shared/robots-access.js";
import { runLiveChatgptReadCheck } from "./chatgpt-read-live-check.mjs";

const origin = "https://seofixkit.com";

function makeEngineShapedReport() {
  return {
    url: "https://example.com/",
    scannedAt: "2026-11-12T00:00:00.000Z",
    durationMs: 1500,
    crawlerAccess: robotsAccess(
      { ok: true, url: "https://example.com/robots.txt", body: "User-agent: *\nAllow: /\n" },
      "https://example.com/"
    ),
    pages: [
      {
        finalUrl: "https://example.com/",
        static: {
          source: "static-html",
          finalUrl: "https://example.com/",
          status: 200,
          title: "Example Domain",
          description: "A short description.",
          h1s: ["Example Domain"],
          headings: [{ level: "h2", text: "More" }],
          schemaTypes: ["Organization"],
          schemaErrors: [],
          wordCount: 640,
          bodySample: "Example Domain. This domain is for use in documentation examples."
        }
      }
    ]
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function passingFetcher(payload, { pageStatus = 200 } = {}) {
  return async (url) => {
    if (String(url).includes("/api/chatgpt-read-check")) return jsonResponse(payload);
    return new Response("<!doctype html><title>Can ChatGPT Read My Page?</title>", {
      status: pageStatus,
      headers: { "content-type": "text/html" }
    });
  };
}

test("the live check passes against the exact payload the API returns", async () => {
  const payload = buildChatgptReadResult(makeEngineShapedReport());
  const result = await runLiveChatgptReadCheck({
    baseUrl: origin,
    targetUrl: "https://example.com/",
    fetcher: passingFetcher(payload)
  });
  assert.equal(result.status, "pass");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.proof.checkedUrl, "https://example.com/");
  assert.equal(result.proof.robotsChecked, true);
  assert.equal(result.proof.bots.length, 3);
  assert.ok(result.proof.bots.every((bot) => bot.allowed));
  assert.equal(result.proof.content.wordCount, 640);
  assert.deepEqual(result.proof.schema.types, ["Organization"]);
  assert.equal(result.proof.verdict.status, "readable");
});

test("the live check fails when the tool page is not deployed", async () => {
  const payload = buildChatgptReadResult(makeEngineShapedReport());
  const result = await runLiveChatgptReadCheck({
    baseUrl: origin,
    targetUrl: "https://example.com/",
    fetcher: passingFetcher(payload, { pageStatus: 404 })
  });
  assert.equal(result.status, "fail");
  assert.equal(result.httpStatus, 404);
  assert.match(result.reason, /returned HTTP 404/);
});

test("the live check reports needs-quota on 429", async () => {
  const result = await runLiveChatgptReadCheck({
    baseUrl: origin,
    targetUrl: "https://example.com/",
    fetcher: async (url) => {
      if (String(url).includes("/api/chatgpt-read-check")) {
        return jsonResponse({ error: "Daily AI read check limit reached for your network. Try again tomorrow." }, 429);
      }
      return new Response("<!doctype html>", { status: 200 });
    }
  });
  assert.equal(result.status, "needs-quota");
  assert.match(result.error, /limit reached/);
});

test("the live check fails when the endpoint is unreachable", async () => {
  const result = await runLiveChatgptReadCheck({
    baseUrl: origin,
    targetUrl: "https://example.com/",
    fetcher: async () => {
      throw new Error("network down");
    }
  });
  assert.equal(result.status, "fail");
  assert.match(result.reason, /network down/);
});
