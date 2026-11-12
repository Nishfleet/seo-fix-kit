import { VERSION } from "../../shared/audit-engine.js";
import { apiAccessStatus } from "../lib/auth.js";
import { jsonNoStore, secureHeaders } from "../lib/http.js";
import { apiCreateAudit, apiGetAuditReport } from "./developer-api.js";
import { runPublicCheck } from "./public-check.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SERVER_INFO = { name: "seofixkit", title: "SEO Fix Kit", version: VERSION };
const NO_STORE = secureHeaders({ "cache-control": "no-store" });

const MCP_TOOLS = [
  {
    name: "page_check",
    title: "Run a one-page SEO check",
    description:
      "Check one public page in a real browser: real SEO problems with fixes, plus the false alarms the real page rules out. Same checks, rate limits, and abuse guards as the free check at /check. No report or URL is stored.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public page URL, like https://example.com/about" }
      },
      required: ["url"]
    }
  },
  {
    name: "start_audit",
    title: "Start a full site audit",
    description:
      "Start a multi-page audit of a site you verified in your SEO Fix Kit account (the same authorization as the /v1 API). Returns an audit_id; poll read_report once the audit is completed.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public site URL, like https://example.com" },
        max_pages: { type: "number", description: "Optional page limit between 1 and 1,000. Default 10." }
      },
      required: ["url"]
    }
  },
  {
    name: "read_report",
    title: "Read an audit report",
    description:
      "Read the saved report for one of your audits by audit_id. Returns the score, findings with evidence and fixes, and the repair plan.",
    inputSchema: {
      type: "object",
      properties: {
        audit_id: { type: "string", description: "The audit_id returned by start_audit." }
      },
      required: ["audit_id"]
    }
  }
];

const MCP_TOOL_HANDLERS = {
  page_check: (args, request, env) =>
    runPublicCheck(syntheticPost(request, "/api/public-check", { url: String(args.url || "") }), env),
  start_audit: (args, request, env, ctx) => {
    const body = { url: String(args.url || "") };
    if (args.max_pages !== undefined && args.max_pages !== null) body.max_pages = args.max_pages;
    return apiCreateAudit(syntheticPost(request, "/v1/audits", body), env, ctx);
  },
  read_report: (args, request, env) =>
    apiGetAuditReport(
      syntheticRequest(request, "GET", `/v1/audits/${encodeURIComponent(String(args.audit_id || ""))}/report`),
      env
    )
};

export async function mcpEndpoint(request, env, ctx) {
  if (request.method !== "POST") {
    return jsonNoStore(
      {
        error:
          request.method === "DELETE"
            ? "This MCP server is stateless: there is no session to terminate."
            : "This MCP server accepts JSON-RPC over POST only and does not offer an SSE stream."
      },
      405
    );
  }
  if (!((request.headers.get("content-type") || "").split(";")[0].trim() === "application/json")) {
    return jsonNoStore({ error: "Send the JSON-RPC message with Content-Type: application/json." }, 415);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonNoStore({ error: "The request body is not valid JSON. Send one JSON-RPC message." }, 400);
  }

  if (Array.isArray(payload)) {
    const bodies = [];
    let status = 202;
    for (const message of payload) {
      const handled = await handleMcpMessage(message, request, env, ctx);
      if (handled) {
        bodies.push(handled.body);
        status = handled.status;
      }
    }
    if (!bodies.length) return new Response(null, { status: 202, headers: NO_STORE });
    return jsonNoStore(bodies, status);
  }

  const handled = await handleMcpMessage(payload, request, env, ctx);
  if (!handled) return new Response(null, { status: 202, headers: NO_STORE });
  return jsonNoStore(handled.body, handled.status);
}

async function handleMcpMessage(message, request, env, ctx) {
  const id = message && typeof message === "object" ? message.id : undefined;
  const wellFormed =
    message &&
    typeof message === "object" &&
    message.jsonrpc === "2.0" &&
    typeof message.method === "string" &&
    (id === undefined || id === null || typeof id === "string" || typeof id === "number");
  if (!wellFormed) {
    return id !== undefined && id !== null ? { status: 400, body: rpcErrorBody(id, -32600, "Invalid Request.") } : null;
  }
  if (id === undefined || id === null) return null;

  switch (message.method) {
    case "initialize":
      return {
        status: 200,
        body: {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
            instructions:
              "SEO Fix Kit: run a one-page check on any public URL, or start an audit of a site you verified in your SEO Fix Kit account and read its report. Every call needs your API key as Authorization: Bearer."
          }
        }
      };
    case "ping":
      return { status: 200, body: { jsonrpc: "2.0", id, result: {} } };
    case "tools/list": {
      const access = await requireMcpAccess(request, env, id);
      return access.ok ? { status: 200, body: { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } } } : access.response;
    }
    case "tools/call": {
      const access = await requireMcpAccess(request, env, id);
      if (!access.ok) return access.response;
      const name = typeof message.params?.name === "string" ? message.params.name : "";
      const handler = MCP_TOOL_HANDLERS[name];
      if (!handler)
        return { status: 200, body: rpcErrorBody(id, -32602, `Unknown tool: ${name || "(missing name)"}.`) };
      const args = message.params?.arguments;
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        return { status: 200, body: rpcErrorBody(id, -32602, "Tool arguments must be an object.") };
      }
      try {
        const response = await handler(args, request, env, ctx);
        return { status: 200, body: { jsonrpc: "2.0", id, result: await toolResultFromResponse(response) } };
      } catch (error) {
        console.error(`MCP tool ${name} failed`, error);
        return {
          status: 200,
          body: {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: "The server hit an error. Try again in a minute. If it keeps happening, email support@seofixkit.com."
                }
              ],
              isError: true
            }
          }
        };
      }
    }
    default:
      return { status: 200, body: rpcErrorBody(id, -32601, `Method not found: ${message.method}.`) };
  }
}

async function requireMcpAccess(request, env, id) {
  const access = await apiAccessStatus(request, env);
  if (access.ok) return { ok: true, access };
  return {
    ok: false,
    response: {
      status: access.status || 401,
      body: rpcErrorBody(id, -32000, access.error || "API key required. Send it as Authorization: Bearer YOUR_API_KEY.")
    }
  };
}

async function toolResultFromResponse(response) {
  const body = await response.json().catch(() => ({}));
  const text = JSON.stringify(body, null, 2);
  return {
    content: [{ type: "text", text, mimeType: "application/json" }],
    isError: !response.ok || Boolean(body?.error)
  };
}

function rpcErrorBody(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function forwardedHeaders(request) {
  const headers = new Headers({ "content-type": "application/json" });
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("cf-connecting-ip", ip);
  return headers;
}

function syntheticRequest(request, method, path, body) {
  return new Request(new URL(path, request.url), {
    method,
    headers: forwardedHeaders(request),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function syntheticPost(request, path, body) {
  return syntheticRequest(request, "POST", path, body);
}

export async function apiPageCheck(request, env) {
  const access = await apiAccessStatus(request, env);
  if (!access.ok) {
    return jsonNoStore(
      { error: access.error || "API key required. Send it as Authorization: Bearer YOUR_API_KEY." },
      access.status || 401
    );
  }
  return runPublicCheck(request, env);
}
