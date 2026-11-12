import assert from "node:assert/strict";
import test from "node:test";
import { buildChatgptReadResult } from "../shared/chatgpt-read/answer-readiness.js";
import { robotsAccess } from "../shared/robots-access.js";
import {
  WALK_STATUS,
  findUnsupportedClaims,
  runChatgptReadWalk,
  validateChatgptReadWalkPayload,
  walkRecord
} from "./chatgpt-read-walk.mjs";

const origin = "https://seofixkit.com";

function makeEngineShapedReport() {
  return {
    url: `${origin}/fixture/rendered-page`,
    scannedAt: "2026-11-12T00:00:00.000Z",
    durationMs: 1234,
    crawlerAccess: robotsAccess(
      {
        ok: true,
        url: `${origin}/robots.txt`,
        body: "User-agent: *\nAllow: /\n"
      },
      `${origin}/fixture/rendered-page`
    ),
    pages: [
      {
        url: `${origin}/fixture/rendered-page`,
        finalUrl: `${origin}/fixture/rendered-page`,
        static: {
          source: "static-html",
          finalUrl: `${origin}/fixture/rendered-page`,
          status: 200,
          title: "Rendered fixture page",
          description: "A fixture page with real content.",
          h1s: ["Rendered fixture page with real content"],
          headings: [{ level: "h2", text: "Plans" }],
          schemaTypes: ["Organization", "WebPage"],
          schemaErrors: [],
          wordCount: 412,
          bodySample: "Rendered fixture page with real content.",
          leadText: "Rendered fixture page with real content."
        },
        rendered: {
          finalUrl: `${origin}/fixture/rendered-page`,
          wordCount: 277,
          title: "Rendered fixture page",
          h1s: ["Rendered fixture page with real content"]
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

function passingPayload() {
  return buildChatgptReadResult(makeEngineShapedReport());
}

test("walk passes against the exact payload shape the API returns for the fixture", async () => {
  const payload = passingPayload();
  assert.deepEqual(validateChatgptReadWalkPayload(payload), []);
  const result = await runChatgptReadWalk({
    baseUrl: origin,
    fetcher: async () => jsonResponse(payload)
  });
  assert.equal(result.status, WALK_STATUS.PASS);
  assert.equal(result.proof.checkedUrl, `${origin}/fixture/rendered-page`);
  assert.equal(result.proof.verdictStatus, "readable");
  assert.equal(result.proof.staticWordCount, 412);
  assert.deepEqual(result.proof.schemaTypes, ["Organization", "WebPage"]);
  assert.equal(result.proof.bots.length, 3);
  assert.ok(result.proof.bots.every((bot) => bot.allowed));
  assert.equal(result.proof.robotsChecked, true);
});

test("walk fails when the three named crawlers are missing", async () => {
  const payload = passingPayload();
  payload.bots = payload.bots.filter((bot) => bot.agent !== "PerplexityBot");
  const failures = validateChatgptReadWalkPayload(payload);
  assert.ok(failures.includes("bots is not a three-bot list"));
});

test("walk fails when a bot carries no robots.txt rule evidence", async () => {
  const payload = passingPayload();
  delete payload.bots[0].rule;
  const failures = validateChatgptReadWalkPayload(payload);
  assert.ok(failures.some((failure) => failure.includes("robots.txt rule evidence")));
});

test("walk fails when the content or schema evidence is missing", async () => {
  const payload = passingPayload();
  delete payload.content;
  delete payload.schema;
  const failures = validateChatgptReadWalkPayload(payload);
  assert.ok(failures.includes("missing content evidence"));
  assert.ok(failures.includes("missing schema evidence"));
});

test("walk fails when the verdict is missing", async () => {
  const payload = passingPayload();
  delete payload.verdict;
  const failures = validateChatgptReadWalkPayload(payload);
  assert.ok(failures.includes("missing verdict"));
});

test("walk fails on unsupported result claims but not on truthful negated copy", () => {
  const payload = passingPayload();
  assert.deepEqual(findUnsupportedClaims(payload), [], "truthful copy must not be flagged");

  const claimed = JSON.parse(JSON.stringify(payload));
  claimed.verdict.detail = "This tool guarantees rankings for your site.";
  assert.deepEqual(findUnsupportedClaims(claimed), ["guarantees rankings"]);

  const promised = JSON.parse(JSON.stringify(payload));
  promised.verdict.headline = "It promises AI citations every week.";
  assert.deepEqual(findUnsupportedClaims(promised), ["promises AI citations"]);
});

test("walk reports needs-quota on 429 with the reset window", async () => {
  const result = await runChatgptReadWalk({
    baseUrl: origin,
    fetcher: async () =>
      jsonResponse(
        {
          error: "Daily AI read check limit reached for your network. Try again tomorrow.",
          resetAt: "2026-11-13T00:00:00.000Z"
        },
        429
      )
  });
  assert.equal(result.status, WALK_STATUS.NEEDS_QUOTA);
  assert.equal(result.resetAt, "2026-11-13T00:00:00.000Z");
});

test("walk fails when the endpoint is unreachable", async () => {
  const result = await runChatgptReadWalk({
    baseUrl: origin,
    fetcher: async () => {
      throw new Error("network down");
    }
  });
  assert.equal(result.status, WALK_STATUS.FAIL);
  assert.match(result.reason, /network down/);
});

test("walk fails on a non-200 non-429 response", async () => {
  const result = await runChatgptReadWalk({
    baseUrl: origin,
    fetcher: async () => jsonResponse({ error: "Check storage is not configured." }, 503)
  });
  assert.equal(result.status, WALK_STATUS.FAIL);
  assert.equal(result.httpStatus, 503);
});

test("walkRecord keeps only the fields the page renders and the verify acceptance names", () => {
  const record = walkRecord(passingPayload());
  assert.deepEqual(Object.keys(record).sort(), [
    "bots",
    "checkedUrl",
    "robotsChecked",
    "schemaTypes",
    "staticWordCount",
    "verdictHeadline",
    "verdictStatus"
  ]);
});
