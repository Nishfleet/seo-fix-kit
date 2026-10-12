import { Hono } from "hono";
import { isEmailConfigured } from "../shared/fulfillment.js";
import { VERSION, rootSitemap } from "../shared/audit-engine.js";
import { indexNowKeyFileBody, indexNowKeyFilePaths } from "../shared/index-now.js";
import {
  createAdminBetaSession,
  createInvite,
  exportLeadsCsv,
  getAdminSummary,
  getFunnelSummary,
  sendDailyOpsDigest,
  sendUrgentOpsAlerts,
  updateFixRequestAdmin
} from "./routes/admin.js";
import { getAccountSummary, listReports } from "./routes/account.js";
import { json, secureHeaders, withPrivateHeaders, withSecurityHeaders } from "./lib/http.js";
import { getDeepHealth } from "./routes/health.js";
import { isSafeUuid } from "./lib/text.js";
import { createAdminSession, revokeAdminSession } from "./lib/auth.js";
import { cleanupExpiredRows } from "./lib/db.js";
import {
  aiAnswerReadinessHtml,
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  pricingHtml,
  privacyHtml,
  proofCaseHtml,
  proofCaseMarkdown,
  renderedVsStaticAuditHtml,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
} from "./routes/pages.js";
import { checkHtml, runPublicCheck } from "./routes/public-check.js";
import {
  betaLogin,
  betaLogout,
  betaSession,
  createSiteClaim,
  joinWaitlist,
  listSiteClaims,
  recordAccessBeacon,
  requestAccessLink,
  verifyAccessLink,
  verifySiteClaim
} from "./routes/access.js";
import {
  createTeamMember,
  getReportCollaboration,
  getSavedReport,
  getTeamMembers,
  revokeTeamMember,
  saveReportCollaboration,
  updateRepairProposalApproval
} from "./routes/reports.js";
import {
  createRepairAction,
  getRepairActionImplementationPack,
  getRepairActionProofReceipt,
  getRepairQueue,
  saveRepairQueue,
  updateRepairAction
} from "./routes/repair-agent.js";
import {
  createAuditSchedule,
  deleteAuditSchedule,
  failStaleRunningAuditJobs,
  getAuditJob,
  listAuditSchedules,
  processAuditJob,
  renderedFixture,
  resumeStaleQueuedAuditJobs,
  runDueAuditSchedules,
  runPrivateAudit,
  runPrivateDemoAudit
} from "./routes/audits.js";
import {
  apiCreateAudit,
  apiCreateProject,
  apiCreateRepairAction,
  apiDeleteAudit,
  apiGetAudit,
  apiGetAuditIssues,
  apiGetAuditReport,
  apiGetRepairActionImplementationPack,
  apiGetRepairActionProofReceipt,
  apiGetRepairQueue,
  apiSaveRepairQueue,
  apiUpdateRepairAction,
  apiListAudits,
  apiListProjects,
  createDeveloperApiToken,
  createDeveloperWebhook,
  getDeveloperApiSummary,
  revokeDeveloperApiToken,
  revokeDeveloperWebhook
} from "./routes/developer-api.js";
import {
  createReportDomain,
  createReportShare,
  getClientReport,
  getClientReportPdf,
  getPrivateReportPdf,
  getReportBranding,
  getReportDomainChallenge,
  listReportDomains,
  listReportShares,
  revokeReportDomain,
  revokeReportShare,
  saveReportBranding,
  unlockClientReport,
  verifyReportDomain
} from "./routes/shares.js";
import {
  getBillingSummary,
  getFixPackPricingPreview,
  getPublicFixPackPricing,
  handleDodoWebhook,
  requestFixPack,
  requestMonitoringCheckout,
  requestRepairSprintCheckout
} from "./routes/billing.js";
import {
  apiClaimLargeRenderedCrawlBatch,
  apiCreateLargeRenderedCrawl,
  apiGetLargeRenderedCrawl,
  apiListLargeRenderedCrawls,
  apiMarkLargeRenderedCrawlReadyToMerge,
  apiProcessLargeRenderedCrawlBatch,
  apiRetryLargeRenderedCrawl,
  apiSaveLargeRenderedCrawlBatchProof,
  claimLargeRenderedCrawlBatch,
  createLargeRenderedCrawl,
  getLargeRenderedCrawl,
  listLargeRenderedCrawls,
  markLargeRenderedCrawlReadyToMerge,
  processLargeRenderedCrawlBatch,
  retryLargeRenderedCrawl,
  runDueLargeRenderedCrawlWorkers,
  saveLargeRenderedCrawlBatchProof
} from "./routes/large-crawls.js";

// Canonical host: `www.seofixkit.com` is a serving alias that 301-redirects
// onto the apex host, and every URL the Worker emits (page canonicals, social
// tags, robots.txt, sitemap.xml, llms.txt, fixture URLs) is generated from the
// apex origin. This keeps canonicals, robots, and sitemap apex-only no matter
// which hostname carried the request, while the redirect converges crawlers
// and visitors on one host.
const CANONICAL_HOST = "seofixkit.com";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

// Path prefixes that only ever serve machine responses. Unmatched requests
// under them get a JSON 404 instead of falling through to the SPA shell.
const API_PREFIXES = ["/api/", "/v1/", "/admin/"];

function canonicalOrigin(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === CANONICAL_HOST || hostname === `www.${CANONICAL_HOST}` ? CANONICAL_ORIGIN : url.origin;
}

function executionContext(c) {
  // Hono's getter throws when the runtime passed no ExecutionContext (unit
  // tests, local tooling); route handlers already treat ctx as optional.
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

// Adapts the existing `(request, env, ctx)` route handlers to Hono. Handlers
// keep reading their own path segments from `request.url`; Hono's patterns
// make sure only well-formed paths and the right method ever reach them.
function route(handler) {
  return (c) => handler(c.req.raw, c.env, executionContext(c));
}

function originOf(c) {
  return canonicalOrigin(new URL(c.req.url));
}

function textResponse(body, contentType, extraHeaders = {}) {
  return new Response(body, {
    headers: secureHeaders({ "content-type": contentType, ...extraHeaders })
  });
}

function htmlPage(render) {
  return (c) => textResponse(render(originOf(c)), "text/html; charset=utf-8");
}

const app = new Hono();

app.use("*", async (c, next) => {
  // Canonical host: permanently redirect every www.seofixkit.com request
  // onto the apex host with its path and query intact before any route
  // logic runs, so no content or API response is ever served from www.
  const url = new URL(c.req.url);
  if (url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
    return new Response(null, {
      status: 301,
      headers: secureHeaders({ Location: `${CANONICAL_ORIGIN}${url.pathname}${url.search}` })
    });
  }
  return next();
});

// A JSON body that does not parse is a client error. Handlers read bodies with
// `parseJsonBody()`, which treats a malformed payload as an empty one and
// would otherwise answer with a misleading field-level error.
// Empty bodies stay allowed; the Dodo webhook verifies its own raw body.
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use("*", async (c, next) => {
  const { pathname } = new URL(c.req.url);
  if (
    JSON_BODY_METHODS.has(c.req.method) &&
    (pathname.startsWith("/api/") || pathname.startsWith("/v1/") || pathname.startsWith("/admin/")) &&
    pathname !== "/api/webhooks/dodo" &&
    (c.req.header("content-type") || "").toLowerCase().includes("application/json")
  ) {
    const text = await c.req.raw.clone().text();
    if (text.trim()) {
      try {
        JSON.parse(text);
      } catch {
        return json({ error: "Request body is not valid JSON." }, 400);
      }
    }
  }
  return next();
});

// --- Health -----------------------------------------------------------------
app.get("/api/health", (c) =>
  json({
    ok: true,
    service: "seo-fix-kit",
    runtime: "cloudflare-worker",
    browserRun: Boolean(c.env.BROWSER),
    waitlistDb: Boolean(c.env.WAITLIST_DB),
    emailNotifications: isEmailConfigured(c.env),
    version: VERSION
  })
);
// Deep health owns its method handling (HEAD support, JSON 405).
app.all("/api/deep-health", route(getDeepHealth));

// --- Access, beta session, waitlist ------------------------------------------
app.post("/api/waitlist", route(joinWaitlist));
app.post("/api/access/request", route(requestAccessLink));
app.post("/api/access/verify", route(verifyAccessLink));
app.post("/api/access/track", route(recordAccessBeacon));
app.post("/api/beta/login", route(betaLogin));
app.get("/api/beta/session", route(betaSession));
app.post("/api/beta/logout", route(betaLogout));
app.get("/api/sites", route(listSiteClaims));
app.post("/api/sites/claim", route(createSiteClaim));
app.post("/api/sites/verify", route(verifySiteClaim));

// --- Billing -----------------------------------------------------------------
app.post("/api/beta/fix-request", route(requestFixPack));
app.post("/api/beta/monitoring-checkout", route(requestMonitoringCheckout));
app.post("/api/beta/repair-sprint-checkout", route(requestRepairSprintCheckout));
app.get("/api/pricing-preview", route(getFixPackPricingPreview));
app.get("/api/public-pricing", route(getPublicFixPackPricing));
app.get("/api/billing/summary", route(getBillingSummary));
app.post("/api/webhooks/dodo", route(handleDodoWebhook));

// --- Account, team, branding, developer settings -----------------------------
app.get("/api/account/summary", route(getAccountSummary));
app.get("/api/reports", route(listReports));
app.get("/api/developer", route(getDeveloperApiSummary));
app.post("/api/developer/tokens", route(createDeveloperApiToken));
app.delete("/api/developer/tokens/:id", route(revokeDeveloperApiToken));
app.post("/api/developer/webhooks", route(createDeveloperWebhook));
app.delete("/api/developer/webhooks/:id", route(revokeDeveloperWebhook));
app.get("/api/team", route(getTeamMembers));
app.post("/api/team/members", route(createTeamMember));
app.delete("/api/team/members/:id", route(revokeTeamMember));
app.get("/api/branding", route(getReportBranding));
app.post("/api/branding", route(saveReportBranding));
app.get("/api/report-domains", route(listReportDomains));
app.post("/api/report-domains", route(createReportDomain));
app.post("/api/report-domains/:id/verify", route(verifyReportDomain));
app.delete("/api/report-domains/:id", route(revokeReportDomain));

// --- Audits and schedules ----------------------------------------------------
app.post("/api/audit", route(runPrivateAudit));
app.get("/api/audit/jobs/:id", route(getAuditJob));
app.get("/api/audit/schedules", route(listAuditSchedules));
app.post("/api/audit/schedules", route(createAuditSchedule));
app.delete("/api/audit/schedules/:id", route(deleteAuditSchedule));
app.all("/api/demo-audit", route(runPrivateDemoAudit));
app.post("/api/public-check", route(runPublicCheck));

// --- Saved reports, sharing, collaboration, repair queue ---------------------
app.delete("/api/report-shares/:id", route(revokeReportShare));
app.get("/api/reports/:id/shares", route(listReportShares));
app.post("/api/reports/:id/share", route(createReportShare));
app.get("/api/reports/:id/client.pdf", route(getPrivateReportPdf));
app.get("/api/reports/:id/collaboration", route(getReportCollaboration));
app.patch("/api/reports/:id/collaboration", route(saveReportCollaboration));
app.get("/api/reports/:id/repair-queue", route(getRepairQueue));
app.patch("/api/reports/:id/repair-queue", route(saveRepairQueue));
app.post("/api/reports/:id/repair-actions", route(createRepairAction));
app.get("/api/reports/:id/repair-actions/:actionId/implementation.md", route(getRepairActionImplementationPack));
app.get("/api/reports/:id/repair-actions/:actionId/proof.md", route(getRepairActionProofReceipt));
app.patch("/api/reports/:id/repair-actions/:actionId", route(updateRepairAction));
app.patch("/api/reports/:id/repair-proposals/:proposalId", route(updateRepairProposalApproval));
app.get("/api/reports/:id/brief.md", route(getSavedReport));
app.get("/api/reports/:id/remediation-brief.json", route(getSavedReport));
app.get("/api/reports/:id", route(getSavedReport));

// --- Large rendered crawls (session) -----------------------------------------
app.post("/api/large-crawls", route(createLargeRenderedCrawl));
app.get("/api/large-crawls", route(listLargeRenderedCrawls));
app.get("/api/large-crawls/:id", route(getLargeRenderedCrawl));
app.post("/api/large-crawls/:id/retry", route(retryLargeRenderedCrawl));
app.post("/api/large-crawls/:id/batches/claim", route(claimLargeRenderedCrawlBatch));
app.post("/api/large-crawls/:id/batches/process", route(processLargeRenderedCrawlBatch));
app.post("/api/large-crawls/:id/batches/:batchId/proof", route(saveLargeRenderedCrawlBatchProof));
app.post("/api/large-crawls/:id/merge", route(markLargeRenderedCrawlReadyToMerge));

// --- Public developer API (v1) -----------------------------------------------
app.get("/v1/projects", route(apiListProjects));
app.post("/v1/projects", route(apiCreateProject));
app.get("/v1/audits", route(apiListAudits));
app.post("/v1/audits", route(apiCreateAudit));
app.get("/v1/audits/:id", route(apiGetAudit));
app.delete("/v1/audits/:id", route(apiDeleteAudit));
app.get("/v1/audits/:id/issues", route(apiGetAuditIssues));
app.get("/v1/audits/:id/report", route(apiGetAuditReport));
app.get("/v1/audits/:id/repair-queue", route(apiGetRepairQueue));
app.patch("/v1/audits/:id/repair-queue", route(apiSaveRepairQueue));
app.post("/v1/audits/:id/repair-actions", route(apiCreateRepairAction));
app.get("/v1/audits/:id/repair-actions/:actionId/implementation.md", route(apiGetRepairActionImplementationPack));
app.get("/v1/audits/:id/repair-actions/:actionId/proof.md", route(apiGetRepairActionProofReceipt));
app.patch("/v1/audits/:id/repair-actions/:actionId", route(apiUpdateRepairAction));
app.get("/v1/large-crawls", route(apiListLargeRenderedCrawls));
app.post("/v1/large-crawls", route(apiCreateLargeRenderedCrawl));
app.get("/v1/large-crawls/:id", route(apiGetLargeRenderedCrawl));
app.post("/v1/large-crawls/:id/retry", route(apiRetryLargeRenderedCrawl));
app.post("/v1/large-crawls/:id/batches/claim", route(apiClaimLargeRenderedCrawlBatch));
app.post("/v1/large-crawls/:id/batches/process", route(apiProcessLargeRenderedCrawlBatch));
app.post("/v1/large-crawls/:id/batches/:batchId/proof", route(apiSaveLargeRenderedCrawlBatchProof));
app.post("/v1/large-crawls/:id/merge", route(apiMarkLargeRenderedCrawlReadyToMerge));

// --- Admin -------------------------------------------------------------------
app.post("/admin/session", route(createAdminSession));
app.delete("/admin/session", route(revokeAdminSession));
app.post("/admin/beta-session", route(createAdminBetaSession));
app.get("/admin/summary", route(getAdminSummary));
app.get("/admin/funnel", route(getFunnelSummary));
app.get("/admin/leads.csv", route(exportLeadsCsv));
app.post("/admin/invites", route(createInvite));
app.patch("/admin/fix-requests/:id", route(updateFixRequestAdmin));

// --- White-label client reports ----------------------------------------------
app.get("/.well-known/seofixkit-report-domain.txt", route(getReportDomainChallenge));
app.post("/r/:id/unlock", route(unlockClientReport));
app.get("/r/:file{.+\\.pdf}", route(getClientReportPdf));
app.get("/r/:id", route(getClientReport));

// --- Audit fixtures ------------------------------------------------------------
app.get("/fixture/rendered-page", (c) =>
  textResponse(renderedFixture(originOf(c)), "text/html; charset=utf-8", {
    "x-robots-tag": "noindex, nofollow"
  })
);
app.get("/fixture/robots.txt", (c) =>
  textResponse(`User-agent: *\nAllow: /\n\nSitemap: ${originOf(c)}/fixture/sitemap.xml\n`, "text/plain; charset=utf-8")
);
app.get("/fixture/sitemap.xml", (c) =>
  textResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${originOf(c)}/fixture/rendered-page</loc></url></urlset>`,
    "application/xml; charset=utf-8"
  )
);

// --- Crawler and SEO files -----------------------------------------------------
app.get("/robots.txt", (c) =>
  textResponse(`User-agent: *\nAllow: /\n\nSitemap: ${originOf(c)}/sitemap.xml\n`, "text/plain; charset=utf-8")
);
// IndexNow key file: served at both the spec root and the .well-known alias so
// Bing/Naver/Seznam/Yandex can validate the submission key without any account
// credentials. run_worker_first keeps the SPA asset fallback from shadowing them.
for (const keyPath of indexNowKeyFilePaths()) {
  app.get(keyPath, () =>
    textResponse(indexNowKeyFileBody(), "text/plain; charset=utf-8", {
      "x-robots-tag": "noindex, nofollow"
    })
  );
}
app.get("/sitemap.xml", (c) => textResponse(rootSitemap(originOf(c)), "application/xml; charset=utf-8"));
app.get("/llms.txt", (c) => textResponse(llmsText(originOf(c)), "text/plain; charset=utf-8"));

// --- Server-rendered public pages --------------------------------------------
app.get("/privacy", htmlPage(privacyHtml));
app.get("/support", htmlPage(supportHtml));
app.get("/terms", htmlPage(termsHtml));
app.get("/demo", htmlPage(demoHtml));
app.get("/check", htmlPage(checkHtml));
app.get("/methodology", htmlPage(methodologyHtml));
app.get("/pricing", htmlPage(pricingHtml));
app.get("/small-business-seo-audit", htmlPage(smallBusinessSeoAuditHtml));
app.get("/rendered-vs-static-seo-audit", htmlPage(renderedVsStaticAuditHtml));
app.get("/ai-answer-readiness", htmlPage(aiAnswerReadinessHtml));

function proofPage(c) {
  const acceptsMarkdown =
    new URL(c.req.url).pathname === "/proof.md" || (c.req.header("accept") || "").includes("text/markdown");
  return acceptsMarkdown
    ? textResponse(proofCaseMarkdown(originOf(c)), "text/markdown; charset=utf-8")
    : textResponse(proofCaseHtml(originOf(c)), "text/html; charset=utf-8");
}
app.get("/proof", proofPage);
app.get("/proof.md", proofPage);

// --- Redirects ---------------------------------------------------------------
// /packages was the pricing page's old address; it moves permanently so old
// links and search results land on /pricing. The common account URLs people
// type or bookmark all lead to the sign-in screen at /beta.
function redirectTo(target, status) {
  return (c) => {
    const { search } = new URL(c.req.url);
    return new Response(null, {
      status,
      headers: secureHeaders({ Location: `${target}${search}` })
    });
  };
}
app.get("/packages", redirectTo("/pricing", 301));
for (const path of [
  "/login",
  "/signin",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/register",
  "/dashboard",
  "/app",
  "/account"
]) {
  app.get(path, redirectTo("/beta", 302));
}

// --- Single-page app ---------------------------------------------------------
// The signed-in app gets the empty SPA shell (dist/beta-shell.html, written by
// scripts/prerender.mjs); "/" serves the prerendered homepage instead.
async function betaShell(c) {
  const indexUrl = new URL("/beta-shell", c.req.url);
  const response = await c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
  return withPrivateHeaders(response);
}
app.get("/beta", betaShell);
app.get("/beta/*", betaShell);

app.get("/", async (c) => {
  if ((c.req.header("accept") || "").includes("text/markdown")) {
    return textResponse(homeMarkdown(originOf(c)), "text/markdown; charset=utf-8");
  }
  return withSecurityHeaders(await c.env.ASSETS.fetch(c.req.raw));
});

app.notFound(async (c) => {
  const { pathname } = new URL(c.req.url);
  if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return json({ error: "Not found." }, 404);
  }
  return withSecurityHeaders(await c.env.ASSETS.fetch(c.req.raw));
});

app.onError((error, c) => {
  // A malformed percent-escape in a path segment is a client error.
  if (error instanceof URIError) {
    return json({ error: "Malformed URL." }, 400);
  }
  console.error(`Unhandled error on ${c.req.method} ${new URL(c.req.url).pathname}`, error);
  // Errors tagged with a `code` are deliberate, user-facing failures (for
  // example BROWSER_BUSY); anything else may carry internal detail, so the
  // client gets a generic message and the real one stays in the logs.
  return json(
    {
      error: error?.code && error?.message ? error.message : "Something went wrong on our side. Try again in a moment."
    },
    500
  );
});

export { app };

export default {
  async scheduled(_event, env, ctx) {
    if (env.WAITLIST_DB) {
      ctx.waitUntil(cleanupExpiredRows(env));
      ctx.waitUntil(
        failStaleRunningAuditJobs(env).then(() =>
          resumeStaleQueuedAuditJobs(env, { appOrigin: "https://seofixkit.com" })
        )
      );
      ctx.waitUntil(runDueAuditSchedules(env));
      if (String(env.SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED || "").toLowerCase() === "true") {
        ctx.waitUntil(runDueLargeRenderedCrawlWorkers(env));
      }
      ctx.waitUntil(sendDailyOpsDigest(env));
      ctx.waitUntil(sendUrgentOpsAlerts(env));
    }
  },

  async queue(batch, env) {
    // Settle each message on its own so one failing job is retried (and
    // eventually dead-lettered) without replaying the rest of the batch.
    for (const message of batch.messages) {
      const body = message.body || {};
      try {
        if (body.kind === "audit-job" && isSafeUuid(String(body.jobId || ""))) {
          await processAuditJob(env, body.jobId, { appOrigin: body.appOrigin || "https://seofixkit.com" });
        }
        message.ack();
      } catch (error) {
        console.error(`Audit queue message ${message.id} failed`, error);
        message.retry();
      }
    }
  },

  fetch: (request, env, ctx) => app.fetch(request, env, ctx)
};
