import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { VERSION } from "../../shared/audit-engine.js";
import { runPublicCheck } from "./public-check.js";

export const MCP_PATH = "/mcp";

// The free check needs no account, so this tool needs none: runPublicCheck keeps
// its per-network and per-site rate limits and its private-address guard.
function createServer(request, env) {
  const server = new McpServer({ name: "seofixkit", title: "SEO Fix Kit", version: VERSION });
  server.registerTool(
    "page_check",
    {
      title: "Run a one-page SEO check",
      description:
        "Check one public page in a real browser: real SEO problems with fixes, plus the false alarms the real page rules out. Same checks, rate limits, and abuse guards as the free check at /check. No report or URL is stored.",
      inputSchema: z.object({ url: z.string().describe("Public page URL, like https://example.com/about") })
    },
    async ({ url }) => {
      const headers = new Headers({ "content-type": "application/json" });
      const ip = request.headers.get("cf-connecting-ip");
      if (ip) headers.set("cf-connecting-ip", ip);
      const check = new Request(new URL("/api/public-check", request.url), {
        method: "POST",
        headers,
        body: JSON.stringify({ url })
      });
      const response = await runPublicCheck(check, env);
      const result = await response.json().catch(() => ({}));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !response.ok || Boolean(result?.error)
      };
    }
  );
  return server;
}

export function mcpEndpoint(request, env, ctx) {
  return createMcpHandler(() => createServer(request, env), { route: MCP_PATH })(request, env, ctx);
}
