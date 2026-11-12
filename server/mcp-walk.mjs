import { spawn } from "node:child_process";
import WebSocket from "ws";
import { sha256Hex } from "../worker/lib/security.js";
import { mcpEndpoint } from "../worker/routes/mcp.js";

const WALK_TOKEN = "sfk_live_walk_mcp";
const CHECK_URL = "https://example.com/";
const CHROME_ARGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=0",
  "--user-data-dir=/tmp/mcp-walk-chrome-profile"
];

async function launchChrome() {
  const binary = process.env.CHROME_BIN || "/usr/bin/google-chrome";
  const child = spawn(binary, CHROME_ARGS, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not expose DevTools: ${stderr}`)), 30_000);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", () => reject(new Error(`Chrome exited early: ${stderr}`)));
  });
  return { child, wsUrl };
}

function cloudflareStyleWebSocket(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const listeners = { message: [], close: [], error: [] };
  const queue = [];
  let opened = false;
  ws.on("open", () => {
    opened = true;
    for (const message of queue) ws.send(message);
    queue.length = 0;
  });
  ws.on("message", (data, isBinary) => {
    const payload = isBinary ? data : data.toString("utf8");
    for (const listener of listeners.message) listener({ data: payload });
  });
  ws.on("close", () => {
    for (const listener of listeners.close) listener({});
  });
  ws.on("error", (error) => {
    for (const listener of listeners.error) listener({ message: String(error) });
  });
  return {
    accept() {},
    send: (message) => {
      if (opened) ws.send(message);
      else queue.push(message);
    },
    close: () => ws.close(),
    addEventListener: (type, listener) => listeners[type]?.push(listener)
  };
}

function fakeBrowserBinding(wsUrl) {
  const FAKE_HOST = "https://fake.host";
  return {
    async fetch(url) {
      const path = String(url).slice(FAKE_HOST.length);
      if (path.startsWith("/v1/devtools/browser") && !path.includes("/browser/local")) {
        return jsonResponse({ sessionId: "local" });
      }
      if (path.startsWith("/v1/devtools/browser/local")) {
        return { ok: true, status: 101, webSocket: cloudflareStyleWebSocket(wsUrl) };
      }
      return jsonResponse({}, 404);
    }
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  };
}

async function fakeWalkEnv(wsUrl) {
  const now = new Date().toISOString();
  const reportId = "walk-mcp-report-1";
  const auditId = "33333333-3333-4333-8333-333333333333";
  const report = {
    id: reportId,
    url: CHECK_URL,
    createdAt: now,
    score: 88,
    summary: { pagesScanned: 1, totalFindings: 1, critical: 1, warnings: 0, notices: 0, guardedFalsePositives: 0 },
    pages: [{ url: CHECK_URL }],
    findings: [
      {
        id: "issue-walk-1",
        severity: "critical",
        title: "Missing title",
        pageUrl: CHECK_URL,
        evidence: "Rendered title is missing.",
        fix: "Add a descriptive title.",
        confidence: "verified",
        source: "rendered"
      }
    ],
    repairPlan: []
  };
  const tokenHash = await sha256Hex(WALK_TOKEN);
  const env = {
    tokens: [
      { id: "token-walk", owner_email: "owner@example.com", token_hash: tokenHash, status: "active", revoked_at: null }
    ],
    jobs: [
      {
        id: auditId,
        owner_email: "owner@example.com",
        status: "completed",
        target_url: CHECK_URL,
        target_host: "example.com",
        report_id: reportId,
        created_at: now,
        updated_at: now,
        completed_at: now
      }
    ],
    reports: [
      {
        id: reportId,
        owner_email: "owner@example.com",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        created_at: now,
        updated_at: now,
        url: CHECK_URL,
        target_host: "example.com",
        report_json: JSON.stringify(report)
      }
    ]
  };
  env.WAITLIST_DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM api_tokens"))
                return env.tokens.find((row) => row.token_hash === values[0]) || null;
              if (sql.includes("FROM audit_jobs")) return env.jobs.find((row) => row.id === values[0]) || null;
              if (sql.includes("FROM audit_reports")) return env.reports.find((row) => row.id === values[0]) || null;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } })
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
  env.BROWSER = fakeBrowserBinding(wsUrl);
  env.auditId = auditId;
  return env;
}

function mcpRequest(message, token = WALK_TOKEN) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://seofixkit.com/v1/mcp", { method: "POST", headers, body: JSON.stringify(message) });
}

async function call(env, message) {
  const response = await mcpEndpoint(mcpRequest(message), env);
  const text = await response.text();
  console.log(
    JSON.stringify({
      mcpRequest: message.method,
      httpStatus: response.status,
      mcpResponse: text ? JSON.parse(text) : null
    })
  );
  return text ? JSON.parse(text) : null;
}

async function main() {
  const { child, wsUrl } = await launchChrome();
  try {
    const env = await fakeWalkEnv(wsUrl);

    const initialized = await call(env, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-walk", version: "0" } }
    });
    if (initialized?.result?.protocolVersion !== "2025-06-18") throw new Error("initialize handshake failed");
    await call(env, { jsonrpc: "2.0", method: "notifications/initialized" });

    const tools = await call(env, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = (tools?.result?.tools || []).map((tool) => tool.name);
    if (JSON.stringify(names) !== JSON.stringify(["page_check", "start_audit", "read_report"]))
      throw new Error(`tools/list mismatch: ${names}`);

    const check = await call(env, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "page_check", arguments: { url: CHECK_URL } }
    });
    const checkPayload = JSON.parse(check?.result?.content?.[0]?.text || "{}");
    if (!checkPayload.checkedUrl || typeof checkPayload.score !== "number") {
      throw new Error(`page_check did not return a report: ${JSON.stringify(checkPayload).slice(0, 400)}`);
    }

    const report = await call(env, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_report", arguments: { audit_id: env.auditId } }
    });
    const reportPayload = JSON.parse(report?.result?.content?.[0]?.text || "{}");
    if (reportPayload?.report?.id !== "walk-mcp-report-1") throw new Error("read_report did not return the report");

    const startAudit = await call(env, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "start_audit", arguments: { url: CHECK_URL } }
    });
    const startAuditPayload = JSON.parse(startAudit?.result?.content?.[0]?.text || "{}");
    if (startAuditPayload?.code !== "SITE_VERIFICATION_REQUIRED") {
      throw new Error(`start_audit guard mismatch: ${JSON.stringify(startAuditPayload).slice(0, 400)}`);
    }
  } finally {
    child.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error("mcp walk failed:", error);
  process.exit(1);
});
