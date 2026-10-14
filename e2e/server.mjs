import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";
import { createTestD1 } from "../test/support/d1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.E2E_PORT || 4321);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  throw new Error("dist/ is missing: run `npm run build` before the e2e server");
}

function assetFile(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/")
    ? [path.join(clean, "index.html")]
    : [clean, `${clean}.html`, path.join(clean, "index.html")];
  for (const candidate of candidates) {
    const file = path.join(DIST, candidate);
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

const ASSETS = {
  async fetch(input) {
    const { pathname } = new URL(typeof input === "string" ? input : input.url);
    const file = assetFile(pathname);
    if (!file) {
      return new Response(fs.readFileSync(path.join(DIST, "404.html")), {
        status: 404,
        headers: { "content-type": CONTENT_TYPES[".html"] }
      });
    }
    return new Response(fs.readFileSync(file), {
      headers: { "content-type": CONTENT_TYPES[path.extname(file)] || "application/octet-stream" }
    });
  }
};

const REPORT_FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "e2e/fixtures/report.json"), "utf8"));

const sentEmails = [];
const env = {
  WAITLIST_DB: createTestD1(),
  ASSETS,
  SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <support@seofixkit.com>",
  EMAIL: {
    async send(message) {
      sentEmails.push({ ...message, sentAt: Date.now() });
      return { messageId: `e2e-${sentEmails.length}` };
    }
  }
};

function clientIp(request) {
  const client = request.headers["x-e2e-client"];
  if (!client) return "198.51.100.1";
  const digest = createHash("sha256").update(String(client)).digest();
  return `198.51.${digest[0]}.${digest[1] || 1}`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, ORIGIN);
    if (url.pathname === "/__e2e/emails") {
      const to = url.searchParams.get("to");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(sentEmails.filter((email) => !to || email.to === to)));
      return;
    }

    if (url.pathname === "/__e2e/reports" && request.method === "POST") {
      const { ownerEmail, score, daysAgo = 0, reportDelta } = JSON.parse((await readBody(request)).toString());
      const id = `acme-widgets-example-${createHash("sha256").update(`${ownerEmail}:${daysAgo}`).digest("hex").slice(0, 12)}`;
      const report = {
        ...REPORT_FIXTURE,
        id,
        reportPath: `/beta/reports/${id}`,
        ...(score === undefined ? {} : { score }),
        ...(reportDelta ? { reportDelta } : {})
      };
      const now = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      env.WAITLIST_DB.insert("audit_reports", {
        id,
        url: report.url,
        origin: report.origin,
        score: report.score,
        summary_json: JSON.stringify(report.summary),
        report_json: JSON.stringify(report),
        created_at: now,
        updated_at: now,
        owner_email: ownerEmail,
        owner_session_hash: "e2e",
        target_host: new URL(report.url).hostname,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()
      });
      env.WAITLIST_DB.insert("score_history", {
        owner_email: ownerEmail,
        report_id: id,
        url: report.url,
        target_host: new URL(report.url).hostname,
        score: report.score,
        total_findings: report.summary?.totalFindings || 0,
        created_at: now
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id }));
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }
    headers.set("cf-connecting-ip", clientIp(request));
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await readBody(request);
    const pending = [];
    const ctx = { waitUntil: (promise) => pending.push(promise), passThroughOnException() {} };
    const result = await worker.fetch(new Request(url, { method: request.method, headers, body }), env, ctx);

    const outHeaders = {};
    result.headers.forEach((value, key) => {
      if (key === "set-cookie") return;
      outHeaders[key] = value;
    });
    const cookies = result.headers.getSetCookie?.() || [];
    if (cookies.length) outHeaders["set-cookie"] = cookies;
    response.writeHead(result.status, outHeaders);
    response.end(Buffer.from(await result.arrayBuffer()));
    await Promise.allSettled(pending);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("e2e server error");
  }
});

// Keep idle sockets open for the whole run. With Node's 5s default the server
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.listen(PORT, "127.0.0.1", () => console.log(`e2e server on ${ORIGIN}`));
