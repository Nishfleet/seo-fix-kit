import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";
import { createTestD1 } from "../test/support/d1.mjs";
import { projectedScore, withScoreGains } from "../shared/audit-engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".cloudflare/output/v0/workers/default/assets");
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
  throw new Error("the built assets are missing: run `npm run build` before the e2e server");
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
const FIXTURE_PLAN = withScoreGains(REPORT_FIXTURE.repairPlan, REPORT_FIXTURE.findings);

const DODO_API = "https://test.dodopayments.com";
const DODO_WEBHOOK_SECRET = `whsec_${randomBytes(24).toString("base64")}`;
let dodoSessions = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === `${DODO_API}/checkouts/preview`) {
    return Response.json({ display_price: "$99.00", currency: "USD", total_amount: 9900 });
  }
  if (url === `${DODO_API}/checkouts`) {
    dodoSessions += 1;
    return Response.json({
      checkout_url: `${DODO_API}/session/cs_e2e_${dodoSessions}`,
      session_id: `cs_e2e_${dodoSessions}`
    });
  }
  return realFetch(input, options);
};

function signedDodoWebhook(payload, webhookId) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(DODO_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const signature = `v1,${createHmac("sha256", key).update(`${webhookId}.${timestamp}.${body}`).digest("base64")}`;
  return new Request(`${ORIGIN}/api/webhooks/dodo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature
    },
    body
  });
}

const sentEmails = [];
const env = {
  DODO_SEOFIXKIT_API_KEY: "dodo-e2e-key",
  DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: "pdt_fix_pack",
  DODO_SEOFIXKIT_BRAND_ID: "brand-e2e",
  DODO_SEOFIXKIT_ENVIRONMENT: "test",
  DODO_SEOFIXKIT_WEBHOOK_SECRET: DODO_WEBHOOK_SECRET,
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

    if (url.pathname === "/__e2e/dodo/pay" && request.method === "POST") {
      const { ownerEmail } = JSON.parse((await readBody(request)).toString());
      const [fixRequest] = env.WAITLIST_DB.rows(
        "SELECT * FROM fix_requests WHERE owner_email = ? ORDER BY created_at DESC LIMIT 1",
        ownerEmail
      );
      const [item] = env.WAITLIST_DB.rows(
        "SELECT * FROM repair_queue_items WHERE report_id = ? ORDER BY created_at LIMIT 1",
        fixRequest.report_id
      );
      const payload = {
        type: "payment.succeeded",
        data: {
          payment_id: `pay_${fixRequest.id}`,
          checkout_session_id: fixRequest.checkout_session_id,
          status: "succeeded",
          total_amount: 9900,
          currency: "USD",
          brand_id: "brand-e2e",
          customer: { email: ownerEmail },
          product_cart: [{ product_id: "pdt_fix_pack", quantity: 1 }],
          metadata: {
            product_key: "seofixkit_fix_pack",
            fix_request_id: fixRequest.id,
            report_id: fixRequest.report_id,
            repair_issue_id: item?.issue_id || "",
            repair_queue_item_id: item?.id || "",
            repair_title: item?.title || ""
          }
        }
      };
      const result = await worker.fetch(signedDodoWebhook(payload, `wh_${fixRequest.id}`), env, {
        waitUntil() {},
        passThroughOnException() {}
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(await result.text());
      return;
    }

    if (url.pathname === "/__e2e/paid-fix-pack" && request.method === "POST") {
      const { ownerEmail } = JSON.parse((await readBody(request)).toString());
      const now = new Date().toISOString();
      env.WAITLIST_DB.insert("fix_requests", {
        id: `fr-paid-${createHash("sha256").update(ownerEmail).digest("hex").slice(0, 12)}`,
        report_id: "acme-widgets-example-paid",
        owner_email: ownerEmail,
        target_url: "https://acme-widgets.example/",
        target_host: "acme-widgets.example",
        status: "paid",
        created_at: now,
        updated_at: now
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/__e2e/reports" && request.method === "POST") {
      const { ownerEmail, score, daysAgo = 0, reportDelta } = JSON.parse((await readBody(request)).toString());
      const id = `acme-widgets-example-${createHash("sha256").update(`${ownerEmail}:${daysAgo}`).digest("hex").slice(0, 12)}`;
      const report = {
        ...REPORT_FIXTURE,
        repairPlan: FIXTURE_PLAN,
        projectedScore: projectedScore(FIXTURE_PLAN, REPORT_FIXTURE.findings),
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
