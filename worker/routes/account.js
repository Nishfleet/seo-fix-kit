import { json, jsonNoStore } from "../lib/http.js";
import { normalizeEmail, parseJson, safeHostname } from "../lib/text.js";
import { betaAccessResponse, betaAccessStatus, clearSessionCookie } from "../lib/auth.js";
import { deleteAccount, deletionBlockedMessage } from "../lib/account-deletion.js";
import { body, parseJsonBody, text } from "../lib/validation.js";
import { repairTableAll } from "../lib/repair-tables.js";
import { agencyWorkspaceAccessForOwner, monitoringAccessForOwner, offerCatalogForOwner } from "../lib/offers.js";
import { uptimeAlertsIncluded } from "../lib/uptime.js";
import {
  auditJobResponse,
  auditScheduleResponse,
  billingFixRequestResponse,
  siteClaimResponse
} from "../lib/serializers.js";
import { reportJsonForRow } from "../lib/report-data.js";
import { deriveRepairQueueItems } from "../../shared/repair-queue.js";
import { repairAccountSummaryFromItems } from "../../shared/account-repair-summary.js";
import { buildSiteProgress } from "../../shared/site-progress.js";

async function getAccountSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json({ error: "Account storage is not set up on this server. Email support@seofixkit.com for help." }, 503);

  const [reports, fixRequests, auditJobs, siteClaims, auditSchedules, progressReports] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, score, summary_json, created_at, expires_at
       FROM audit_reports
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE owner_email = ?
         AND is_test = 0
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_jobs
       WHERE owner_email = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC
       LIMIT 12`
    )
      .bind(access.ownerEmail, new Date().toISOString())
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM site_claims
       WHERE owner_email = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT *
       FROM audit_schedules
       WHERE owner_email = ?
         AND status = 'active'
      ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT h.url, h.score, h.total_findings, h.created_at, h.report_id,
        EXISTS (
          SELECT 1 FROM audit_reports r
          WHERE r.id = h.report_id AND (r.expires_at IS NULL OR r.expires_at > ?)
        ) AS report_exists
       FROM score_history h
       WHERE h.owner_email = ?
       ORDER BY h.created_at DESC
       LIMIT 400`
    )
      .bind(new Date().toISOString(), access.ownerEmail)
      .all()
      .catch(() => ({ results: [] }))
  ]);
  const reportRows = reports.results || [];
  const [repairQueueRows, repairActionRows] = await Promise.all([
    accountRepairQueueRowsForReports(env, access, reportRows),
    accountRepairActionRowsForReports(env, access, reportRows)
  ]);
  const fallbackReports = await accountFallbackRepairReports(
    env,
    access,
    reportRows,
    repairQueueRows.results || [],
    auditSchedules.results || []
  );
  const fallbackReportById = new Map(
    await Promise.all(fallbackReports.map(async (row) => [row.id, parseJson(await reportJsonForRow(env, row), {})]))
  );

  const reportContexts = reportRows.map((row) => {
    const summary = parseJson(row.summary_json, {});
    const report = fallbackReportById.get(row.id) || {};
    const response = {
      id: row.id,
      url: row.url,
      targetHost: row.target_host || safeHostname(row.url),
      score: row.score,
      pagesScanned: summary.pagesScanned || 0,
      totalFindings: summary.totalFindings || 0,
      guardedFalsePositives: summary.guardedFalsePositives || 0,
      reportPath: `/beta/reports/${row.id}`,
      createdAt: row.created_at,
      expiresAt: row.expires_at || ""
    };
    return { row, report, response };
  });
  const recentReports = reportContexts.map((context) => context.response);
  const requests = (fixRequests.results || []).map((row) => billingFixRequestResponse(row));
  const recentAuditJobs = (auditJobs.results || []).map(auditJobResponse);
  const sites = (siteClaims.results || []).map(siteClaimResponse);
  const schedules = (auditSchedules.results || []).map(auditScheduleResponse);
  const verifiedSites = sites.filter((site) => site.status === "verified").length;
  const repairAgentUnavailable = Boolean(repairQueueRows.repairTablesMissing || repairActionRows.repairTablesMissing);
  const repairAgent = {
    ...accountRepairAgentSummary(
      reportContexts,
      repairQueueRows.results || [],
      repairActionRows.results || [],
      schedules
    ),
    unavailable: repairAgentUnavailable
  };
  const offers = await offerCatalogForOwner(env, access.ownerEmail);
  const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, schedules.length);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail);
  const uptimeAlerts = { included: await uptimeAlertsIncluded(env, access.ownerEmail, access) };

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail,
      accessMode: access.accessMode
    },
    metrics: {
      reports: recentReports.length,
      fixRequests: requests.length,
      openFixRequests: requests.filter((request) => !["delivered", "refunded"].includes(request.status)).length,
      runningAudits: recentAuditJobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      verifiedSites,
      monitors: schedules.length,
      monitorLimit: monitoring.limit,
      repairItems: repairAgent.counts.total,
      openRepairs: repairAgent.counts.active,
      draftedActions: repairAgent.counts.awaitingApproval,
      approvedActions: repairAgent.counts.approvedActions,
      appliedRepairs: repairAgent.counts.appliedAwaitingRerun,
      regressedRepairs: repairAgent.counts.regressed + repairAgent.counts.monitorRegressions
    },
    recentReports,
    progress: buildSiteProgress(
      (progressReports.results || []).map((row) => ({
        url: row.url,
        score: row.score,
        totalFindings: row.total_findings,
        createdAt: row.created_at,
        reportPath: row.report_exists ? `/beta/reports/${row.report_id}` : ""
      })),
      schedules
    ),
    recentAuditJobs,
    sites,
    schedules,
    fixRequests: requests,
    repairAgent,
    offers,
    monitoring,
    agencyWorkspace,
    uptimeAlerts,
    nextActions: accountNextActions(recentReports, requests, sites, recentAuditJobs, repairAgent)
  });
}

async function accountRepairQueueRowsForReports(env, access, reports = []) {
  const reportIds = accountReportIds(reports);
  if (!reportIds.length) return { results: [] };
  const placeholders = reportIds.map(() => "?").join(", ");
  return repairTableAll(
    env.WAITLIST_DB.prepare(
      `SELECT *
     FROM repair_queue_items
     WHERE owner_email = ?
       AND report_id IN (${placeholders})
     ORDER BY updated_at DESC`
    ).bind(access.ownerEmail, ...reportIds)
  );
}

async function accountRepairActionRowsForReports(env, access, reports = []) {
  const reportIds = accountReportIds(reports);
  if (!reportIds.length) return { results: [] };
  const placeholders = reportIds.map(() => "?").join(", ");
  return repairTableAll(
    env.WAITLIST_DB.prepare(
      `SELECT *
     FROM repair_agent_actions
     WHERE owner_email = ?
       AND report_id IN (${placeholders})
     ORDER BY updated_at DESC`
    ).bind(access.ownerEmail, ...reportIds)
  );
}

function accountReportIds(reports = []) {
  return [...new Set((reports || []).map((row) => row.id).filter(Boolean))];
}

async function accountFallbackRepairReports(env, access, reports = [], queueRows = [], schedules = []) {
  if (!reports.length) return [];
  const monitoredIds = new Set(
    (schedules || [])
      .filter((schedule) => schedule.status === "active")
      .map((schedule) => schedule.last_report_id || schedule.lastReportId)
      .filter(Boolean)
  );
  const queuedReportIds = new Set((queueRows || []).map((row) => row.report_id || row.reportId).filter(Boolean));
  const ids = reports
    .filter((row, index) => (!queuedReportIds.has(row.id) && index < 3) || monitoredIds.has(row.id))
    .map((row) => row.id)
    .filter(Boolean);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, report_json
     FROM audit_reports
     WHERE owner_email = ?
       AND id IN (${placeholders})`
  )
    .bind(access.ownerEmail, ...ids)
    .all();
  return rows.results || [];
}

function accountNextActions(reports, requests, sites = [], jobs = [], repairAgent = {}) {
  if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
    return [
      {
        id: "audit-running",
        label: "Audit running",
        detail: "Your report shows up here when every page has loaded and been checked."
      }
    ];
  }
  if (!reports.length) {
    if (!sites.some((site) => site.status === "verified")) {
      return [
        {
          id: "verify-site",
          label: "Verify your site",
          detail: "Add a DNS TXT record or upload a file to your site. Then you can run full audits."
        }
      ];
    }
    return [
      {
        id: "run-audit",
        label: "Run your first audit",
        detail: "Start with your homepage or the page that earns you the most."
      }
    ];
  }
  const nextRepair = repairAgent.nextItems?.[0];
  if (repairAgent.unavailable && nextRepair) {
    return [
      {
        id: "repair-queue-unavailable",
        label: "Repair queue unavailable",
        detail: "The repair queue is being updated. Try again in a few minutes."
      }
    ];
  }
  if (nextRepair) {
    return [
      {
        id: nextRepair.nextActionId,
        label: nextRepair.nextActionLabel,
        detail: nextRepair.nextActionDetail,
        href: nextRepair.reportPath
      }
    ];
  }
  if (!sites.some((site) => site.status === "verified")) {
    return [
      {
        id: "verify-site",
        label: "Verify your site",
        detail: "Add a DNS TXT record or upload a file to your site. Then you can run full audits."
      }
    ];
  }
  if (reports.some((report) => Number(report.totalFindings || 0) > 0) && !requests.length) {
    return [
      {
        id: "review-fixes",
        label: "Review your report",
        detail: "Open a report and check the problems. Buy a Fix Pack only if you want help fixing them."
      }
    ];
  }
  if (requests.some((request) => ["paid", "in_progress"].includes(request.status))) {
    return [
      {
        id: "watch-delivery",
        label: "Track your Fix Pack",
        detail: "Your billing page shows the due date, notes, delivery link, and rerun results."
      }
    ];
  }
  return [
    {
      id: "rerun-later",
      label: "Rerun after changes",
      detail: "Rerun the audit after you change content, templates, or page titles and descriptions."
    }
  ];
}

function accountRepairAgentSummary(reportContexts = [], queueRows = [], actionRows = [], schedules = []) {
  const reportIds = new Set(reportContexts.map((context) => context.response.id));
  const queueRowsByReport = groupRowsByReport(queueRows.filter((row) => reportIds.has(row.report_id)));
  const actionRowsByReport = groupRowsByReport(actionRows.filter((row) => reportIds.has(row.report_id)));
  const contexts = reportContexts.map((context) => {
    const reportId = context.response.id;
    const report = {
      ...context.report,
      id: reportId,
      url: context.row.url || context.report.url || "",
      reportPath: context.response.reportPath
    };
    return {
      report,
      response: context.response,
      items: deriveRepairQueueItems(
        report,
        queueRowsByReport.get(reportId) || [],
        actionRowsByReport.get(reportId) || []
      )
    };
  });
  return repairAccountSummaryFromItems(contexts, schedules);
}

function groupRowsByReport(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const reportId = row.report_id || row.reportId || "";
    if (!reportId) continue;
    grouped.set(reportId, [...(grouped.get(reportId) || []), row]);
  }
  return grouped;
}

const REPORT_LIST_PAGE_SIZE = 25;

function reportListItem(row) {
  const summary = parseJson(row.summary_json, {});
  return {
    id: row.id,
    url: row.url,
    targetHost: row.target_host || safeHostname(row.url),
    score: row.score,
    pagesScanned: summary.pagesScanned || 0,
    totalFindings: summary.totalFindings || 0,
    guardedFalsePositives: summary.guardedFalsePositives || 0,
    reportPath: `/beta/reports/${row.id}`,
    createdAt: row.created_at,
    expiresAt: row.expires_at || ""
  };
}

async function listReports(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json({ error: "Account storage is not set up on this server. Email support@seofixkit.com for help." }, 503);

  const cursor = new URL(request.url).searchParams.get("cursor") || "";
  const [cursorCreatedAt, cursorId] = cursor.split("|");
  const hasCursor = Boolean(cursorCreatedAt && cursorId);
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, score, summary_json, created_at, expires_at
     FROM audit_reports
     WHERE owner_email = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ${hasCursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )
    .bind(
      access.ownerEmail,
      new Date().toISOString(),
      ...(hasCursor ? [cursorCreatedAt, cursorCreatedAt, cursorId] : []),
      REPORT_LIST_PAGE_SIZE + 1
    )
    .all();
  const results = rows.results || [];
  const page = results.slice(0, REPORT_LIST_PAGE_SIZE);
  const last = page.at(-1);
  return jsonNoStore({
    ok: true,
    reports: page.map(reportListItem),
    nextCursor: results.length > REPORT_LIST_PAGE_SIZE && last ? `${last.created_at}|${last.id}` : ""
  });
}

const DeleteAccountBody = body({ confirmEmail: text(254) });

async function deleteOwnAccount(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (access.accessMode === "founder-override") {
    return jsonNoStore({ error: "Founder sessions can't delete accounts. Use the admin deletion endpoint." }, 403);
  }
  const parsed = await parseJsonBody(request, DeleteAccountBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  if (normalizeEmail(parsed.data.confirmEmail) !== access.ownerEmail) {
    return jsonNoStore({ error: "Type your account email exactly to confirm." }, 400);
  }
  const result = await deleteAccount(env, access.ownerEmail);
  if (!result.ok)
    return jsonNoStore({ error: deletionBlockedMessage(result.blockers), blockers: result.blockers }, 409);
  const response = jsonNoStore({
    ok: true,
    deletedAt: result.deletedAt,
    paymentRecordsKept: result.paymentRecordsKept
  });
  response.headers.append("set-cookie", clearSessionCookie(request));
  return response;
}

export { deleteOwnAccount, getAccountSummary, listReports };
