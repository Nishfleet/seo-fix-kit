import assert from "node:assert/strict";
import test from "node:test";
import { mcpEndpoint } from "./mcp.js";

function mcpRequest(message) {
  return new Request("https://seofixkit.com/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "cf-connecting-ip": "203.0.113.9"
    },
    body: JSON.stringify(message)
  });
}

async function rpc(message, env = {}) {
  const response = await mcpEndpoint(mcpRequest(message), env, { waitUntil() {} });
  assert.equal(response.status, 200);
  const text = await response.text();
  const data = text.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data ? data.slice(5) : text);
}

test("MCP server lists one page_check tool without an API key", async () => {
  const body = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(
    body.result.tools.map((tool) => tool.name),
    ["page_check"]
  );
});

test("MCP page_check reports an exhausted quota as a tool error before any engine work", async () => {
  const engineBindingsRead = [];
  const engineBindingNames = ["BROWSER", "GOOGLE_PAGESPEED_API_KEY", "PAGESPEED_API_KEY", "SEOFIXKIT_PAGESPEED_DISABLED"];
  const env = new Proxy(
    {
      WAITLIST_DB: {
        prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) })
      }
    },
    {
      get(target, property) {
        if (engineBindingNames.includes(property)) engineBindingsRead.push(property);
        return target[property];
      }
    }
  );

  const body = await rpc(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "page_check", arguments: { url: "https://93.184.216.34/" } }
    },
    env
  );
  assert.equal(body.result.isError, true);
  const payload = JSON.parse(body.result.content[0].text);
  assert.ok(!Number.isNaN(Date.parse(payload.resetAt)));
  assert.deepEqual(engineBindingsRead, []);
});

test("MCP page_check refuses private addresses", async () => {
  const body = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "page_check", arguments: { url: "http://127.0.0.1/" } }
  });
  assert.equal(body.result.isError, true);
});
