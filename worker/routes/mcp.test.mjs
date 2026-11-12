import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../lib/security.js";
import { apiPageCheck, mcpEndpoint } from "./mcp.js";

const API_TOKEN = "sfk_live_test_mcp";

function mcpRequest(message, token = "") {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://seofixkit.com/v1/mcp", { method: "POST", headers, body: JSON.stringify(message) });
}

function pageCheckRequest(token, url = "https://93.184.216.34/") {
  const headers = { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://seofixkit.com/v1/page-check", {
    method: "POST",
    headers,
    body: JSON.stringify({ url })
  });
}

function fakeMcpDb({ tokens = [], jobs = [], reports = [], usageExhausted = false } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM api_tokens")) {
                return tokens.find((row) => row.token_hash === values[0] && row.status === "active") || null;
              }
              if (sql.includes("FROM audit_jobs")) {
                return jobs.find((row) => row.id === values[0] && row.owner_email === values[1]) || null;
              }
              if (sql.includes("FROM audit_reports")) {
                return reports.find((row) => row.id === values[0] && row.owner_email === values[1]) || null;
              }
              if (sql.includes("FROM fix_requests")) return null;
              throw new Error(`Unexpected first SQL: ${sql}`);
            },
            all: async () => {
              if (sql.includes("FROM repair_queue_items") || sql.includes("FROM repair_agent_actions")) {
                return { results: [] };
              }
              throw new Error(`Unexpected all SQL: ${sql}`);
            },
            run: async () => {
              if (sql.includes("UPDATE api_tokens")) return { meta: { changes: 1 } };
              if (sql.includes("INSERT INTO audit_usage")) {
                return { meta: { changes: usageExhausted ? 0 : 1 } };
              }
              throw new Error(`Unexpected run SQL: ${sql}`);
            }
          };
        }
      };
    },
    batch: async (statements) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };
}

async function fakeMcpEnv(overrides = {}) {
  const tokenHash = await sha256Hex(API_TOKEN);
  const now = new Date().toISOString();
  const env = {
    apiToken: API_TOKEN,
    auditId: "22222222-2222-4222-8222-222222222222",
    reportId: "mcp-example-report-1",
    tokens: [
      {
        id: "token-1",
        owner_email: "owner@example.com",
        token_hash: tokenHash,
        status: "active",
        revoked_at: null
      }
    ],
    jobs: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        owner_email: "owner@example.com",
        status: "completed",
        target_url: "https://example.com/",
        target_host: "example.com",
        report_id: "mcp-example-report-1",
        created_at: now,
        updated_at: now,
        completed_at: now
      }
    ],
    reports: [
      {
        id: "mcp-example-report-1",
        owner_email: "owner@example.com",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        created_at: now,
        updated_at: now,
        url: "https://example.com/",
        target_host: "example.com",
        report_json: JSON.stringify({
          id: "mcp-example-report-1",
          url: "https://example.com/",
          score: 75,
          createdAt: now,
          summary: { pagesScanned: 1, totalFindings: 1 },
          pages: [{ url: "https://example.com/" }],
          findings: [
            {
              id: "issue-1",
              severity: "critical",
              title: "Missing title",
              pageUrl: "https://example.com/",
              evidence: "Rendered title is missing.",
              fix: "Add a descriptive title.",
              confidence: "verified",
              source: "rendered"
            }
          ],
          repairPlan: []
        })
      }
    ],
    ...overrides
  };
  env.WAITLIST_DB = fakeMcpDb(env);
  return env;
}

test("MCP initialize handshake needs no API key and speaks the Streamable HTTP spec", async () => {
  const env = await fakeMcpEnv();
  const response = await mcpEndpoint(mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.equal(body.result.serverInfo.name, "seofixkit");
  assert.deepEqual(body.result.capabilities, { tools: {} });

  const notification = await mcpEndpoint(mcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }), env);
  assert.equal(notification.status, 202, "notifications are answered with 202 and no body");
  assert.equal(await notification.text(), "");
});

test("tools/list requires the account API key and exposes the three calls", async () => {
  const env = await fakeMcpEnv();
  const unauthorized = await mcpEndpoint(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }), env);
  assert.equal(unauthorized.status, 401);
  assert.match((await unauthorized.json()).error.message, /API key required/);

  const response = await mcpEndpoint(mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" }, env.apiToken), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.result.tools.map((tool) => tool.name),
    ["page_check", "start_audit", "read_report"]
  );
});

test("MCP page_check runs behind the same web-check rate limits with zero engine work", async () => {
  const engineBindingsRead = [];
  const engineBindingNames = [
    "BROWSER",
    "GOOGLE_PAGESPEED_API_KEY",
    "PAGESPEED_API_KEY",
    "SEOFIXKIT_PAGESPEED_DISABLED"
  ];
  const env = await fakeMcpEnv({ usageExhausted: true });
  const proxiedEnv = new Proxy(env, {
    get(target, property) {
      if (engineBindingNames.includes(property)) engineBindingsRead.push(property);
      return target[property];
    }
  });

  const response = await mcpEndpoint(
    mcpRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "page_check", arguments: { url: "https://93.184.216.34/" } }
      },
      env.apiToken
    ),
    proxiedEnv
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.isError, true, "an exhausted quota surfaces as a tool error, not a crash");
  const text = body.result.content[0].text;
  const payload = JSON.parse(text);
  assert.equal(payload.error, "You have reached this hour's page check limit for your network. Try again in an hour.");
  assert.ok(typeof payload.resetAt === "string" && !Number.isNaN(Date.parse(payload.resetAt)));
  assert.deepEqual(
    engineBindingsRead,
    [],
    "the audit engine must never be constructed when the web-check quota is exhausted"
  );
});

test("MCP read_report returns the owner's report for an audit id", async () => {
  const env = await fakeMcpEnv();
  const response = await mcpEndpoint(
    mcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "read_report", arguments: { audit_id: env.auditId } }
      },
      env.apiToken
    ),
    env
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.isError, false);
  const report = JSON.parse(body.result.content[0].text);
  assert.equal(report.report.id, env.reportId);
  assert.equal(report.report.score, 75);
  assert.equal(report.report.findings[0].title, "Missing title");

  env.tokens[0].owner_email = "someone-else@example.com";
  const otherOwner = await mcpEndpoint(
    mcpRequest(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "read_report", arguments: { audit_id: env.auditId } }
      },
      env.apiToken
    ),
    env
  );
  const otherOwnerBody = await otherOwner.json();
  assert.equal(otherOwnerBody.result.isError, true, "reports stay owner-scoped through MCP");
  assert.match(JSON.parse(otherOwnerBody.result.content[0].text).error, /Audit not found|Report not found/);
});

test("MCP rejects unknown methods, unknown tools, and malformed messages", async () => {
  const env = await fakeMcpEnv();
  const unknownMethod = await mcpEndpoint(mcpRequest({ jsonrpc: "2.0", id: 7, method: "resources/list" }), env);
  assert.equal((await unknownMethod.json()).error.code, -32601);

  const unknownTool = await mcpEndpoint(
    mcpRequest(
      { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "rank_track", arguments: {} } },
      env.apiToken
    ),
    env
  );
  assert.equal((await unknownTool.json()).error.code, -32602);

  const malformed = await mcpEndpoint(
    new Request("https://seofixkit.com/v1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json"
    }),
    env
  );
  assert.equal(malformed.status, 400);

  const wrongType = await mcpEndpoint(
    new Request("https://seofixkit.com/v1/mcp", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}"
    }),
    env
  );
  assert.equal(wrongType.status, 415);

  const get = await mcpEndpoint(
    new Request("https://seofixkit.com/v1/mcp", { method: "GET", headers: { accept: "text/event-stream" } }),
    env
  );
  assert.equal(get.status, 405, "no SSE stream is offered, so GET is 405 per the spec");
});

test("API page-check endpoint requires an API key and reuses the web-check guards", async () => {
  const env = await fakeMcpEnv({ usageExhausted: true });

  const unauthorized = await apiPageCheck(pageCheckRequest(""), env);
  assert.equal(unauthorized.status, 401);
  assert.match((await unauthorized.json()).error, /API key required/);

  const exhausted = await apiPageCheck(pageCheckRequest(env.apiToken), env);
  assert.equal(exhausted.status, 429);
  const payload = await exhausted.json();
  assert.equal(payload.error, "You have reached this hour's page check limit for your network. Try again in an hour.");
  assert.ok(typeof payload.resetAt === "string" && !Number.isNaN(Date.parse(payload.resetAt)));
});
