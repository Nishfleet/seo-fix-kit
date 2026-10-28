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
import {
  confirmUnsubscribe,
  getEmailPreferences,
  saveEmailPreferences,
  showUnsubscribe
} from "./routes/email-preferences.js";
import {
  createScoreBadge,
  getScoreBadgeForReport,
  revokeScoreBadge,
  serveBadgeSvg,
  serveScoreCard,
  showScorePage
} from "./routes/badges.js";
import { downloadFixKit, getFixKit } from "./routes/fix-kit.js";
import {
  createAuditWidget,
  getAuditWidget,
  revokeAuditWidget,
  runWidgetCheck,
  showWidgetPage
} from "./routes/audit-widget.js";
import { json, secureHeaders, withPrivateHeaders, withSecurityHeaders } from "./lib/http.js";
import { getDeepHealth } from "./routes/health.js";
import { isSafeUuid } from "./lib/text.js";
import { createAdminSession, revokeAdminSession } from "./lib/auth.js";
import { cleanupExpiredRows } from "./lib/db.js";
import { runScheduledTasks } from "./lib/scheduled.js";
import { sendFirstAuditNudges } from "./lib/activation-emails.js";
import { runUptimeChecks } from "./lib/uptime.js";
import {
  aboutHtml,
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
import { toolPageHtml, toolsIndexHtml } from "./routes/tools.js";
import { getStatusJson, serviceStatus, statusHtml } from "./routes/status.js";
import { FREE_TOOLS } from "../shared/free-tools/catalog.js";
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

const CANONICAL_HOST = "seofixkit.com";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

const API_PREFIXES = ["/api/", "/v1/", "/admin/"];

function canonicalOrigin(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === CANONICAL_HOST || hostname === `www.${CANONICAL_HOST}` ? CANONICAL_ORIGIN : url.origin;
}

function executionContext(c) {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

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
  const url = new URL(c.req.url);
  if (url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
    return new Response(null, {
      status: 301,
      headers: secureHeaders({ Location: `${CANONICAL_ORIGIN}${url.pathname}${url.search}` })
    });
  }
  return next();
});

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
        return json({ error: "The request body is not valid JSON. Send a JSON object." }, 400);
      }
    }
  }
  return next();
});

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
app.get("/api/status", route(getStatusJson));
app.all("/api/deep-health", route(getDeepHealth));

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

app.post("/api/beta/fix-request", route(requestFixPack));
app.post("/api/beta/monitoring-checkout", route(requestMonitoringCheckout));
app.post("/api/beta/repair-sprint-checkout", route(requestRepairSprintCheckout));
app.get("/api/pricing-preview", route(getFixPackPricingPreview));
app.get("/api/public-pricing", route(getPublicFixPackPricing));
app.get("/api/billing/summary", route(getBillingSummary));
app.post("/api/webhooks/dodo", route(handleDodoWebhook));

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

app.get("/api/account/email-preferences", route(getEmailPreferences));
app.post("/api/account/email-preferences", route(saveEmailPreferences));
app.get("/email/unsubscribe/:token", route(showUnsubscribe));
app.post("/email/unsubscribe/:token", route(confirmUnsubscribe));

app.post("/api/audit", route(runPrivateAudit));
app.get("/api/audit/jobs/:id", route(getAuditJob));
app.get("/api/audit/schedules", route(listAuditSchedules));
app.post("/api/audit/schedules", route(createAuditSchedule));
app.delete("/api/audit/schedules/:id", route(deleteAuditSchedule));
app.all("/api/demo-audit", route(runPrivateDemoAudit));
app.post("/api/public-check", route(runPublicCheck));

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

app.post("/api/large-crawls", route(createLargeRenderedCrawl));
app.get("/api/large-crawls", route(listLargeRenderedCrawls));
app.get("/api/large-crawls/:id", route(getLargeRenderedCrawl));
app.post("/api/large-crawls/:id/retry", route(retryLargeRenderedCrawl));
app.post("/api/large-crawls/:id/batches/claim", route(claimLargeRenderedCrawlBatch));
app.post("/api/large-crawls/:id/batches/process", route(processLargeRenderedCrawlBatch));
app.post("/api/large-crawls/:id/batches/:batchId/proof", route(saveLargeRenderedCrawlBatchProof));
app.post("/api/large-crawls/:id/merge", route(markLargeRenderedCrawlReadyToMerge));

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

app.post("/admin/session", route(createAdminSession));
app.delete("/admin/session", route(revokeAdminSession));
app.post("/admin/beta-session", route(createAdminBetaSession));
app.get("/admin/summary", route(getAdminSummary));
app.get("/admin/funnel", route(getFunnelSummary));
app.get("/admin/leads.csv", route(exportLeadsCsv));
app.post("/admin/invites", route(createInvite));
app.patch("/admin/fix-requests/:id", route(updateFixRequestAdmin));

app.get("/.well-known/seofixkit-report-domain.txt", route(getReportDomainChallenge));
app.post("/r/:id/unlock", route(unlockClientReport));
app.get("/r/:file{.+\\.pdf}", route(getClientReportPdf));
app.get("/r/:id", route(getClientReport));

const badgeRoute = (handler) => (c) => handler(c.req.raw, c.env, c.req.param(), originOf(c), executionContext(c));
app.get("/api/reports/:id/badge", badgeRoute(getScoreBadgeForReport));
app.get("/api/reports/:id/fix-kit", badgeRoute(getFixKit));
app.get("/api/reports/:id/fix-kit.zip", badgeRoute(downloadFixKit));
app.post("/api/reports/:id/badge", badgeRoute(createScoreBadge));
app.delete("/api/badges/:id", badgeRoute(revokeScoreBadge));
app.get("/badge/:file{[a-f0-9]+\\.svg}", badgeRoute(serveBadgeSvg));
app.get("/score/:id/card.png", badgeRoute(serveScoreCard));
app.get("/score/:id", badgeRoute(showScorePage));
app.get("/api/widget", badgeRoute(getAuditWidget));
app.post("/api/widget", badgeRoute(createAuditWidget));
app.delete("/api/widget", badgeRoute(revokeAuditWidget));
app.get("/embed/:id", badgeRoute(showWidgetPage));
app.post("/api/embed/:id/check", badgeRoute(runWidgetCheck));

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

app.get("/robots.txt", (c) =>
  textResponse(`User-agent: *\nAllow: /\n\nSitemap: ${originOf(c)}/sitemap.xml\n`, "text/plain; charset=utf-8")
);
// upstream: https://www.indexnow.org/documentation — the key file is served at the spec root and at the .well-known alias.
for (const keyPath of indexNowKeyFilePaths()) {
  app.get(keyPath, () =>
    textResponse(indexNowKeyFileBody(), "text/plain; charset=utf-8", {
      "x-robots-tag": "noindex, nofollow"
    })
  );
}
app.get("/sitemap.xml", (c) => textResponse(rootSitemap(originOf(c)), "application/xml; charset=utf-8"));
app.get("/llms.txt", (c) => textResponse(llmsText(originOf(c)), "text/plain; charset=utf-8"));

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
app.get("/tools", htmlPage(toolsIndexHtml));
app.get("/about", htmlPage(aboutHtml));
app.get("/status", async (c) =>
  textResponse(statusHtml(originOf(c), await serviceStatus(c.env)), "text/html; charset=utf-8", {
    "cache-control": "no-store"
  })
);
for (const tool of FREE_TOOLS) {
  app.get(
    `/tools/${tool.slug}`,
    htmlPage((origin) => toolPageHtml(origin, tool))
  );
}

function proofPage(c) {
  const acceptsMarkdown =
    new URL(c.req.url).pathname === "/proof.md" || (c.req.header("accept") || "").includes("text/markdown");
  return acceptsMarkdown
    ? textResponse(proofCaseMarkdown(originOf(c)), "text/markdown; charset=utf-8")
    : textResponse(proofCaseHtml(originOf(c)), "text/html; charset=utf-8");
}
app.get("/proof", proofPage);
app.get("/proof.md", proofPage);

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
  if (error instanceof URIError) {
    return json({ error: "This URL is malformed. Check the address and try again." }, 400);
  }
  console.error(`Unhandled error on ${c.req.method} ${new URL(c.req.url).pathname}`, error);
  return json(
    {
      error:
        error?.code && error?.message
          ? error.message
          : "The server hit an error. Try again in a minute. If it keeps happening, email support@seofixkit.com."
    },
    500
  );
});

export { app };

export default {
  async scheduled(_event, env, ctx) {
    if (!env.WAITLIST_DB) return;
    const tasks = [
      ["cleanupExpiredRows", cleanupExpiredRows],
      [
        "auditJobs",
        async (scheduledEnv) => {
          await failStaleRunningAuditJobs(scheduledEnv);
          await resumeStaleQueuedAuditJobs(scheduledEnv, { appOrigin: "https://seofixkit.com" });
        }
      ],
      ["runDueAuditSchedules", runDueAuditSchedules],
      ["runUptimeChecks", runUptimeChecks]
    ];
    tasks.push(
      ["sendFirstAuditNudges", sendFirstAuditNudges],
      ["sendDailyOpsDigest", sendDailyOpsDigest],
      ["sendUrgentOpsAlerts", sendUrgentOpsAlerts]
    );
    if (String(env.SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED || "").toLowerCase() === "true") {
      tasks.push(["runDueLargeRenderedCrawlWorkers", runDueLargeRenderedCrawlWorkers]);
    }
    ctx.waitUntil(runScheduledTasks(env, tasks));
  },

  async queue(batch, env) {
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
