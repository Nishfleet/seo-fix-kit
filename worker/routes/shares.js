import { serialize as serializeCookie } from "cookie";
import puppeteer from "@cloudflare/puppeteer";
import {
  buildWhiteLabelReportHtml,
  defaultBranding,
  normalizeBrandingInput,
  whiteLabelReportFilename
} from "../../shared/white-label-report.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { cookieValue, json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { agencyWorkspaceAccessForOwner } from "../lib/offers.js";
import { hasPaidFixPack, paidFeatureLockedResponse } from "../lib/paid-features.js";
import { ownerReportRow, reportJsonForRow } from "../lib/report-data.js";
import { checkQuotaSet, constantTimeEqual, hmacSha256Hex, requestIpHash, sha256Hex } from "../lib/security.js";
import {
  cleanReportDomain,
  cleanText,
  hourWindow,
  isSafeUuid,
  isoDaysFromNow,
  normalizeDnsHost,
  normalizeDnsTxt,
  parseJson,
  randomHex,
  safeHostname,
  workerAppHost
} from "../lib/text.js";
import { body, number, parseJsonBody, text, z } from "../lib/validation.js";
import { reportIdFromSuffixPath } from "./reports.js";

const REPORT_SHARE_PASSWORD_MIN_LENGTH = 10;

const REPORT_PDF_RENDERS_PER_HOUR = 10;

const passwordField = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => String(value || ""));

const brandingField = z.string().nullish();
const ReportBrandingBody = body(
  Object.fromEntries(
    [
      "agencyName",
      "agency_name",
      "logoUrl",
      "logo_url",
      "brandColor",
      "brand_color",
      "accentColor",
      "accent_color",
      "customDomain",
      "custom_domain",
      "footerText",
      "footer_text"
    ].map((key) => [key, brandingField])
  )
);

const ReportShareBody = body(
  {
    password: passwordField.transform((password) => password.trim()),
    expiresDays: number(),
    clientName: text(120),
    passwordHint: text(120)
  },
  { expires_days: "expiresDays", client_name: "clientName", password_hint: "passwordHint" }
);

const ReportDomainBody = body({ domain: z.string().nullish() }, { customDomain: "domain" });

const ClientReportUnlockBody = body({ password: passwordField });

const REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS = 120_000;

async function getReportBranding(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  return jsonNoStore({
    ok: true,
    unlocked: await hasPaidFixPack(env, access.ownerEmail, access),
    branding: await savedBrandingForOwner(env, access.ownerEmail)
  });
}

async function saveReportBranding(request, env) {
  const parsed = await parseJsonBody(request, ReportBrandingBody);
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  if (!(await hasPaidFixPack(env, access.ownerEmail, access))) return paidFeatureLockedResponse();

  const current = await savedBrandingForOwner(env, access.ownerEmail);
  const branding = normalizeBrandingInput(parsed.data, current);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_branding
      (owner_email, agency_name, logo_url, brand_color, accent_color, custom_domain, footer_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET
       agency_name = excluded.agency_name,
       logo_url = excluded.logo_url,
       brand_color = excluded.brand_color,
       accent_color = excluded.accent_color,
       custom_domain = excluded.custom_domain,
       footer_text = excluded.footer_text,
       updated_at = excluded.updated_at`
  )
    .bind(
      access.ownerEmail,
      branding.agencyName,
      branding.logoUrl || null,
      branding.brandColor,
      branding.accentColor,
      branding.customDomain || null,
      branding.footerText || null,
      now,
      now
    )
    .run();

  return jsonNoStore({ ok: true, branding });
}

async function listReportShares(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/shares".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const shares = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(reportId, access.ownerEmail)
    .all();
  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, {
    clientLinks: (shares.results || []).length
  });
  return jsonNoStore({
    ok: true,
    shares: (shares.results || []).map((share) => reportShareResponse(share, url.origin, customDomain, env)),
    agencyWorkspace
  });
}

async function createReportShare(request, env) {
  const parsed = await parseJsonBody(request, ReportShareBody);
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const body = parsed.data;
  const url = new URL(request.url);
  const reportId = decodeURIComponent(url.pathname.slice("/api/reports/".length, -"/share".length));
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM report_share_links
     WHERE report_id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(reportId, access.ownerEmail)
    .first();
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, {
    clientLinks: Number(count?.count || 0)
  });
  if (Number(count?.count || 0) >= agencyWorkspace.limits.clientLinksPerReport) {
    return jsonNoStore(
      {
        error: `This report already has ${agencyWorkspace.limits.clientLinksPerReport} active client links.`,
        code: "AGENCY_CLIENT_LINK_LIMIT",
        agencyWorkspace
      },
      429
    );
  }

  const report = parseJson(row.report_json, {});
  const now = new Date().toISOString();
  const { password } = body;
  if (password && password.length < REPORT_SHARE_PASSWORD_MIN_LENGTH) {
    return jsonNoStore(
      { error: `Client report passwords must be at least ${REPORT_SHARE_PASSWORD_MIN_LENGTH} characters.` },
      400
    );
  }
  const expiresDays = body.expiresDays || 0;
  const share = {
    id: crypto.randomUUID(),
    report_id: reportId,
    owner_email: access.ownerEmail,
    client_name: body.clientName || cleanText(safeHostname(report.url || row.url || ""), 120),
    status: "active",
    password_hash: password ? await hashReportSharePassword(password) : "",
    password_hint: body.passwordHint,
    expires_at: expiresDays > 0 ? isoDaysFromNow(Math.min(Math.max(expiresDays, 1), 180)) : "",
    created_at: now,
    updated_at: now,
    last_viewed_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_share_links
      (id, report_id, owner_email, client_name, status, password_hash, password_hint, expires_at, created_at, updated_at, last_viewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      share.id,
      share.report_id,
      share.owner_email,
      share.client_name || null,
      share.status,
      share.password_hash || null,
      share.password_hint || null,
      share.expires_at || null,
      share.created_at,
      share.updated_at,
      null
    )
    .run();

  const customDomain = await primaryVerifiedReportDomain(env, access.ownerEmail);
  return jsonNoStore({
    ok: true,
    share: reportShareResponse(share, url.origin, customDomain, env)
  });
}

async function getPrivateReportPdf(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const url = new URL(request.url);
  const reportId = reportIdFromSuffixPath(url.pathname, "/client.pdf");
  const row = await ownerReportRow(env, reportId, access);
  if (!row) return json({ error: "Report not found." }, 404);
  const report = parseJson(row.report_json, {});
  const branding = await reportBrandingForOwner(env, access.ownerEmail);
  const share = {
    id: "",
    clientName: cleanText(url.searchParams.get("clientName") || safeHostname(report.url || row.url || ""), 120)
  };
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share,
    origin: url.origin,
    includeDraftBriefs: true,
    cacheKey: `report-pdfs/owner/${row.id || reportId}.pdf`,
    missQuota: () => reportPdfRenderQuotaStatus(env, `owner:${access.ownerEmail}`)
  });
}

async function revokeReportShare(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Client report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-shares/".length));
  if (!isSafeUuid(id))
    return json({ error: "That client link was not found. Refresh to see your current links." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET status = 'revoked', updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND status = 'active'`
  )
    .bind(now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1)
    return json({ error: "That client link was not found. Refresh to see your current links." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getClientReportPdf(request, env) {
  if (!env.WAITLIST_DB)
    return json({ error: "Client reports are not set up on this server. Email support@seofixkit.com for help." }, 503);
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, ".pdf");
  if (!isSafeUuid(id))
    return json({ error: "This report link was not found or has expired. Ask the sender for a new link." }, 404);
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return json({ error: domainCheck.error }, 404);
  if (!share)
    return json({ error: "This report link was not found or has expired. Ask the sender for a new link." }, 404);
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return json({ error: "This report no longer exists. Ask the sender for a new link." }, 404);
  }
  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }
  const report = parseJson(await reportJsonForRow(env, reportRow), {});
  return renderWorkerWhiteLabelPdf(env, {
    report,
    branding,
    share: shareToCamel(share),
    origin: url.origin,
    cacheKey: `report-pdfs/shares/${share.id}.pdf`,
    missQuota: async () => reportPdfRenderQuotaStatus(env, `ip:${await requestIpHash(request)}`)
  });
}

async function getClientReport(request, env) {
  if (!env.WAITLIST_DB)
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id: "" },
      503,
      "Client reports are not set up on this server. Email support@seofixkit.com for help."
    );
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname);
  if (!isSafeUuid(id))
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id },
      404,
      "This report link was not found or has expired. Ask the sender for a new link."
    );

  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share)
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id },
      404,
      "This report link was not found or has expired. Ask the sender for a new link."
    );
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json, expires_at
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  if (!reportRow?.report_json || (reportRow.expires_at && reportRow.expires_at <= new Date().toISOString())) {
    return clientReportLockedResponse(
      request,
      branding,
      shareToCamel(share),
      404,
      "This report no longer exists. Ask the sender for a new link."
    );
  }
  const report = parseJson(await reportJsonForRow(env, reportRow), {});

  if (share.password_hash && !(await clientReportUnlocked(request, env, share))) {
    return clientReportLockedResponse(request, branding, shareToCamel(share), 401);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_share_links
     SET last_viewed_at = ?, updated_at = updated_at
     WHERE id = ?`
  )
    .bind(new Date().toISOString(), share.id)
    .run();

  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share: shareToCamel(share),
      origin: url.origin
    }),
    {
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function unlockClientReport(request, env) {
  if (!env.WAITLIST_DB)
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id: "" },
      503,
      "Client reports are not set up on this server. Email support@seofixkit.com for help."
    );
  const url = new URL(request.url);
  const id = clientReportShareId(url.pathname, "/unlock");
  if (!isSafeUuid(id))
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id },
      404,
      "This report link was not found or has expired. Ask the sender for a new link."
    );
  const share = await activeReportShare(env, id);
  const domainCheck = await clientReportHostAccess(env, request, share);
  if (!domainCheck.ok) return clientReportLockedResponse(request, defaultBranding(), { id }, 404, domainCheck.error);
  if (!share)
    return clientReportLockedResponse(
      request,
      defaultBranding(),
      { id },
      404,
      "This report link was not found or has expired. Ask the sender for a new link."
    );
  const branding = await reportBrandingForOwner(env, share.owner_email);
  const parsed = await passwordFromRequest(request);
  if (parsed.error) return clientReportLockedResponse(request, branding, shareToCamel(share), 400, parsed.error.error);
  const { password } = parsed.data;
  const quota = await clientReportUnlockQuotaStatus(request, env, share);
  if (!quota.ok) return clientReportLockedResponse(request, branding, shareToCamel(share), 429, quota.error);
  if (!share.password_hash || (await verifyReportSharePassword(password, share.password_hash))) {
    return new Response("", {
      status: 303,
      headers: secureHeaders({
        "cache-control": "no-store",
        location: `/r/${encodeURIComponent(share.id)}`,
        "set-cookie": await clientReportCookie(request, env, share)
      })
    });
  }
  const reportRow = await env.WAITLIST_DB.prepare(
    `SELECT report_json
     FROM audit_reports
     WHERE id = ?
       AND owner_email = ?
     LIMIT 1`
  )
    .bind(share.report_id, share.owner_email)
    .first();
  const report = parseJson(reportRow ? await reportJsonForRow(env, reportRow) : "", {});
  return clientReportLockedResponse(request, branding, shareToCamel(share), 401, "Password did not match.", report);
}

async function reportBrandingForOwner(env, ownerEmail) {
  if (!(await hasPaidFixPack(env, ownerEmail))) return defaultBranding();
  return savedBrandingForOwner(env, ownerEmail);
}

async function savedBrandingForOwner(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_branding
     WHERE owner_email = ?
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return row ? normalizeBrandingInput(reportBrandingFromRow(row), defaultBranding()) : defaultBranding();
}

async function listReportDomains(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Report domain storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 20`
  )
    .bind(access.ownerEmail)
    .all();
  return jsonNoStore({
    ok: true,
    domains: (rows.results || []).map((row) => reportDomainResponse(row, env))
  });
}

async function createReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Report domain storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  if (!reportDomainsEnabled(env))
    return jsonNoStore({ error: "Custom report domains are not set up on this server yet." }, 503);
  if (!(await hasPaidFixPack(env, access.ownerEmail, access))) return paidFeatureLockedResponse();
  const parsed = await parseJsonBody(request, ReportDomainBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const domainName = cleanReportDomain(parsed.data.domain);
  if (!domainName) return jsonNoStore({ error: "Enter a valid report subdomain, like reports.example.com." }, 400);
  if (workerAppHost(domainName, env)) {
    return jsonNoStore(
      { error: "Use a subdomain on a domain you own, like reports.example.com. SEO Fix Kit hostnames cannot be used." },
      400
    );
  }

  const existing = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(domainName)
    .first();
  if (existing?.id && existing.owner_email !== access.ownerEmail) {
    return jsonNoStore(
      {
        error:
          "That domain is already connected to another workspace. Remove it there first, or use a different subdomain."
      },
      409
    );
  }
  if (existing?.id) return jsonNoStore({ ok: true, domain: reportDomainResponse(existing, env) });

  const count = await env.WAITLIST_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM report_domains
     WHERE owner_email = ?
       AND revoked_at IS NULL`
  )
    .bind(access.ownerEmail)
    .first();
  const activeDomains = Number(count?.count || 0);
  const agencyWorkspace = await agencyWorkspaceAccessForOwner(env, access.ownerEmail, { reportDomains: activeDomains });
  if (activeDomains >= agencyWorkspace.limits.reportDomains) {
    return jsonNoStore(
      {
        error: `This workspace already has ${agencyWorkspace.limits.reportDomains} active report domain.`,
        code: "AGENCY_REPORT_DOMAIN_LIMIT",
        agencyWorkspace
      },
      429
    );
  }

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_email: access.ownerEmail,
    domain: domainName,
    verification_token: `sfk-report-domain=${randomHex(24)}`,
    status: "pending",
    created_at: now,
    updated_at: now,
    verified_at: "",
    last_checked_at: "",
    last_error: "",
    revoked_at: ""
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO report_domains
      (id, owner_email, domain, verification_token, status, created_at, updated_at, verified_at, last_checked_at, last_error, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.owner_email,
      row.domain,
      row.verification_token,
      row.status,
      row.created_at,
      row.updated_at,
      null,
      null,
      null,
      null
    )
    .run();
  return jsonNoStore({ ok: true, domain: reportDomainResponse(row, env) }, 201);
}

async function verifyReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Report domain storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  if (!reportDomainsEnabled(env))
    return jsonNoStore({ error: "Custom report domains are not set up on this server yet." }, 503);
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/api/report-domains/".length, -"/verify".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(id, access.ownerEmail)
    .first();
  if (!row?.id) return json({ error: "Report domain not found." }, 404);
  if (workerAppHost(row.domain, env)) {
    return jsonNoStore(
      { error: "Use a subdomain on a domain you own, like reports.example.com. SEO Fix Kit hostnames cannot be used." },
      400
    );
  }

  const result = await verifyReportDomainChallenge(row, env);
  const now = new Date().toISOString();
  if (!result.ok) {
    await env.WAITLIST_DB.prepare(
      `UPDATE report_domains
       SET last_checked_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(now, result.error, now, id)
      .run();
    return jsonNoStore(
      {
        ok: false,
        error: result.error,
        domain: reportDomainResponse({ ...row, last_checked_at: now, last_error: result.error, updated_at: now }, env)
      },
      400
    );
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'verified', verified_at = COALESCE(verified_at, ?), last_checked_at = ?, last_error = NULL, updated_at = ?
     WHERE id = ?`
  )
    .bind(now, now, now, id)
    .run();
  return jsonNoStore({
    ok: true,
    verified: true,
    domain: reportDomainResponse(
      {
        ...row,
        status: "verified",
        verified_at: row.verified_at || now,
        last_checked_at: now,
        last_error: "",
        updated_at: now
      },
      env
    )
  });
}

async function revokeReportDomain(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Report domain storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const id = decodeURIComponent(new URL(request.url).pathname.slice("/api/report-domains/".length));
  if (!isSafeUuid(id)) return json({ error: "Report domain not found." }, 404);
  const now = new Date().toISOString();
  const updated = await env.WAITLIST_DB.prepare(
    `UPDATE report_domains
     SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE id = ?
       AND owner_email = ?
       AND revoked_at IS NULL`
  )
    .bind(now, now, id, access.ownerEmail)
    .run();
  if (Number(updated?.meta?.changes || 0) !== 1) return json({ error: "Report domain not found." }, 404);
  return jsonNoStore({ ok: true, id, status: "revoked" });
}

async function getReportDomainChallenge(request, env) {
  if (!env.WAITLIST_DB)
    return new Response("Report domain storage is not set up on this server. Email support@seofixkit.com for help.", {
      status: 503
    });
  const domain = await reportDomainForHost(env, new URL(request.url).host);
  if (!domain?.id) {
    return new Response("Report domain challenge not found.", {
      status: 404,
      headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
    });
  }
  return new Response(domain.verification_token || "", {
    headers: secureHeaders({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" })
  });
}

function reportDomainResponse(row = {}, env = {}) {
  const dnsName = reportDomainDnsName(row.domain || "");
  const cnameTarget = cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "") || "";
  return {
    id: row.id || "",
    domain: row.domain || "",
    status: row.status || "pending",
    verificationToken: row.verification_token || "",
    verificationMethod: "dns_txt",
    verificationPath: "",
    verificationUrl: "",
    dnsName,
    dnsType: "TXT",
    dnsValue: row.verification_token || "",
    cnameTarget,
    shareOrigin: row.status === "verified" && row.domain ? `https://${row.domain}` : "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    verifiedAt: row.verified_at || "",
    lastCheckedAt: row.last_checked_at || "",
    lastError: row.last_error || ""
  };
}

function reportDomainsEnabled(env = {}) {
  return Boolean(cleanReportDomain(env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || ""));
}

async function verifyReportDomainChallenge(row = {}, env = {}) {
  const ownership = await verifyReportDomainTxt(row.domain || "", row.verification_token || "");
  if (!ownership.ok) return ownership;
  return verifyReportDomainCname(row.domain || "", env.SEOFIXKIT_REPORT_DOMAIN_CNAME_TARGET || "");
}

async function verifyReportDomainTxt(domain = "", token = "") {
  const expected = token || "";
  const dnsName = reportDomainDnsName(domain);
  if (!expected || !dnsName)
    return { ok: false, error: "Custom domain verification is not set up on this server yet." };
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dnsName)}&type=TXT`, {
      headers: { accept: "application/dns-json" }
    });
    if (!response.ok) return { ok: false, error: "The DNS lookup failed. Wait a minute and check again." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsTxt(answer.data).includes(expected));
    return matched
      ? { ok: true }
      : {
          ok: false,
          error:
            "The DNS TXT record is not visible yet. DNS changes can take a while to spread, so check again in a few minutes."
        };
  } catch {
    return { ok: false, error: "The DNS lookup failed. Wait a minute and check again." };
  }
}

async function verifyReportDomainCname(domain = "", cnameTarget = "") {
  const domainName = cleanReportDomain(domain);
  const expected = cleanReportDomain(cnameTarget);
  if (!domainName || !expected) return { ok: false, error: "Custom domain routing is not set up on this server yet." };
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domainName)}&type=CNAME`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!response.ok) return { ok: false, error: "The CNAME lookup failed. Wait a minute and check again." };
    const payload = await response.json().catch(() => ({}));
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    const matched = answers.some((answer) => normalizeDnsHost(answer.data) === expected);
    return matched
      ? { ok: true }
      : {
          ok: false,
          error:
            "The CNAME record is not visible yet. DNS changes can take a while to spread, so check again in a few minutes."
        };
  } catch {
    return { ok: false, error: "The CNAME lookup failed. Wait a minute and check again." };
  }
}

function reportDomainDnsName(domain = "") {
  const clean = cleanReportDomain(domain);
  return clean ? `_seofixkit-report-domain.${clean}` : "";
}

async function reportDomainForHost(env, hostValue, { verifiedOnly = false } = {}) {
  const host = cleanReportDomain(hostValue);
  if (!host) return null;
  const statusClause = verifiedOnly ? "status = 'verified'" : "status IN ('pending', 'verified')";
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE domain = ?
       AND ${statusClause}
       AND revoked_at IS NULL
     LIMIT 1`
  )
    .bind(host)
    .first();
  return row?.id ? row : null;
}

async function primaryVerifiedReportDomain(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_domains
     WHERE owner_email = ?
       AND status = 'verified'
       AND revoked_at IS NULL
     ORDER BY verified_at DESC, updated_at DESC
     LIMIT 1`
  )
    .bind(ownerEmail)
    .first();
  return row?.id ? row : null;
}

async function clientReportHostAccess(env, request, share) {
  const host = cleanReportDomain(new URL(request.url).host);
  if (!host || workerAppHost(host, env)) return { ok: true };
  const domain = await reportDomainForHost(env, host, { verifiedOnly: true });
  if (!domain) return { ok: false, error: "This report domain is not verified yet." };
  if (share && domain.owner_email !== share.owner_email)
    return { ok: false, error: "This report link was not found on this domain. Ask the sender for a new link." };
  return { ok: true, domain };
}

function reportBrandingFromRow(row = {}) {
  return {
    agencyName: row?.agency_name || "",
    logoUrl: row?.logo_url || "",
    brandColor: row?.brand_color || "",
    accentColor: row?.accent_color || "",
    customDomain: row?.custom_domain || "",
    footerText: row?.footer_text || ""
  };
}

function reportShareResponse(row = {}, origin = "", customDomain = null, env = {}) {
  const shareOrigin = customDomain?.domain ? `https://${customDomain.domain}` : origin;
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordProtected: Boolean(row.password_hash),
    passwordHint: row.password_hint || "",
    sharePath: row.id ? `/r/${row.id}` : "",
    shareUrl: row.id ? `${shareOrigin}/r/${row.id}` : "",
    pdfPath: row.id ? `/r/${row.id}.pdf` : "",
    pdfUrl: row.id ? `${shareOrigin}/r/${row.id}.pdf` : "",
    customDomain: customDomain ? reportDomainResponse(customDomain, env) : null,
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

function shareToCamel(row = {}) {
  return {
    id: row.id || "",
    reportId: row.report_id || "",
    ownerEmail: row.owner_email || "",
    clientName: row.client_name || "",
    status: row.status || "active",
    passwordHint: row.password_hint || "",
    expiresAt: row.expires_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastViewedAt: row.last_viewed_at || ""
  };
}

async function activeReportShare(env, id) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM report_share_links
     WHERE id = ?
     LIMIT 1`
  )
    .bind(id)
    .first();
  if (!row?.id || row.status !== "active") return null;
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    await env.WAITLIST_DB.prepare(`UPDATE report_share_links SET status = 'expired', updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), row.id)
      .run();
    return null;
  }
  return row;
}

function clientReportShareId(pathname, suffix = "") {
  const relative = pathname.slice("/r/".length);
  const id = suffix && relative.endsWith(suffix) ? relative.slice(0, -suffix.length) : relative;
  return decodeURIComponent(id || "");
}

function clientReportLockedResponse(request, branding, share, status = 401, error = "", report = {}) {
  const url = new URL(request.url);
  return new Response(
    buildWhiteLabelReportHtml({
      report,
      branding,
      share,
      origin: url.origin,
      locked: true,
      error
    }),
    {
      status,
      headers: secureHeaders({
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      })
    }
  );
}

async function whiteLabelPdfVersionForHtml(html) {
  return (await sha256Hex(`white-label-pdf:v1:${html}`)).slice(0, 32);
}

async function whiteLabelPdfCacheVersion(args) {
  return whiteLabelPdfVersionForHtml(buildWhiteLabelReportHtml(args));
}

function whiteLabelPdfResponse(body, { report, branding, share }) {
  const headers = secureHeaders();
  headers.set("cache-control", "no-store");
  headers.set("content-disposition", `attachment; filename="${whiteLabelReportFilename({ report, branding, share })}"`);
  headers.set("content-type", "application/pdf");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(body, { headers });
}

async function renderWorkerWhiteLabelPdf(
  env,
  { report, branding, share, origin, includeDraftBriefs = false, cacheKey = "", missQuota = null }
) {
  const args = { report, branding, share, origin, includeDraftBriefs };
  const html = buildWhiteLabelReportHtml(args);
  const version = cacheKey ? await whiteLabelPdfVersionForHtml(html) : "";
  if (cacheKey && env.REPORTS) {
    const cached = await env.REPORTS.get(cacheKey).catch(() => null);
    if (cached && cached.customMetadata?.version === version) return whiteLabelPdfResponse(cached.body, args);
  }
  if (missQuota) {
    const quota = await missQuota();
    if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }
  if (!env.BROWSER) {
    return jsonNoStore(
      { error: "PDF export is not set up on this server yet. Email support@seofixkit.com for a PDF copy." },
      503
    );
  }
  let browser = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "24px",
        right: "24px",
        bottom: "28px",
        left: "24px"
      }
    });
    if (cacheKey && env.REPORTS) {
      await env.REPORTS.put(cacheKey, pdf, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { version }
      }).catch(() => {});
    }
    return whiteLabelPdfResponse(pdf, args);
  } catch (error) {
    return jsonNoStore({ error: error?.message || "PDF export failed." }, 500);
  } finally {
    await browser?.close?.().catch(() => {});
  }
}

async function reportPdfRenderQuotaStatus(env, bucketKey) {
  const hour = hourWindow(new Date());
  return checkQuotaSet(env, [
    {
      bucket: `report-pdf:${bucketKey}:${hour.key}`,
      limit: REPORT_PDF_RENDERS_PER_HOUR,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many PDF downloads right now. Try again in an hour."
    }
  ]);
}

function clientReportCookieName(share) {
  return `sfk_report_${String(share.id || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 36)}`;
}

async function clientReportCookieValue(env, share) {
  const secret = String(env.SEOFIXKIT_COOKIE_SECRET || "");
  if (!secret) {
    throw new Error("Report cookie signing is not configured. Set the SEOFIXKIT_COOKIE_SECRET secret.");
  }
  return hmacSha256Hex(secret, `${share.id}:${share.password_hash || ""}:client-report`);
}

async function clientReportCookie(request, env, share) {
  return serializeCookie(clientReportCookieName(share), await clientReportCookieValue(env, share), {
    path: "/r",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30,
    secure: new URL(request.url).protocol === "https:"
  });
}

async function clientReportUnlocked(request, env, share) {
  const value = cookieValue(request, clientReportCookieName(share));
  return Boolean(value) && constantTimeEqual(value, await clientReportCookieValue(env, share));
}

async function passwordFromRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return parseJsonBody(request, ClientReportUnlockBody);
  let fields;
  if (contentType.includes("form")) {
    const form = await request.formData().catch(() => null);
    fields = form ? Object.fromEntries(form) : {};
  } else {
    fields = Object.fromEntries(new URLSearchParams(await request.text().catch(() => "")));
  }
  const result = ClientReportUnlockBody.safeParse(fields);
  if (result.success) return { data: result.data };
  return { error: { error: "password must be text.", field: "password" } };
}

async function clientReportUnlockQuotaStatus(request, env, share = {}) {
  if (!env.WAITLIST_DB) return { ok: true };
  const hour = hourWindow(new Date());
  const ipHash = await requestIpHash(request);
  const shareKey = String(share.id || "")
    .replace(/[^a-f0-9-]/gi, "")
    .slice(0, 40);
  return checkQuotaSet(env, [
    {
      bucket: `client-report-unlock:ip:${hour.key}:${shareKey}:${ipHash}`,
      limit: 10,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many wrong password attempts for this report link. Try again in an hour."
    },
    {
      bucket: `client-report-unlock:share:${hour.key}:${shareKey}`,
      limit: 50,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many wrong password attempts for this report link. Try again in an hour."
    }
  ]);
}

async function hashReportSharePassword(password = "") {
  const salt = randomHex(16);
  const hash = await deriveReportSharePasswordHash(password, salt, REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function verifyReportSharePassword(password = "", storedHash = "") {
  const stored = String(storedHash || "");
  if (stored.startsWith("pbkdf2$")) {
    const [, algorithm, iterations, salt, expected] = stored.split("$");
    const iterationCount = Number(iterations || 0);
    if (algorithm !== "sha256" || !iterationCount || !salt || !expected) return false;
    const actual = await deriveReportSharePasswordHash(password, salt, iterationCount);
    return constantTimeEqual(actual, expected);
  }
  return constantTimeEqual(await sha256Hex(password), stored);
}

async function deriveReportSharePasswordHash(
  password = "",
  saltHex = "",
  iterations = REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS
) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password || "")), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function hexToBytes(hex = "") {
  const clean = String(hex || "").replace(/[^a-f0-9]/gi, "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes = new Uint8Array()) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export {
  REPORT_SHARE_PASSWORD_MIN_LENGTH,
  REPORT_SHARE_PASSWORD_PBKDF2_ITERATIONS,
  activeReportShare,
  bytesToHex,
  clientReportCookie,
  clientReportCookieName,
  clientReportCookieValue,
  clientReportHostAccess,
  clientReportLockedResponse,
  clientReportShareId,
  clientReportUnlockQuotaStatus,
  clientReportUnlocked,
  createReportDomain,
  createReportShare,
  deriveReportSharePasswordHash,
  getClientReport,
  getClientReportPdf,
  getPrivateReportPdf,
  getReportBranding,
  getReportDomainChallenge,
  hashReportSharePassword,
  hexToBytes,
  listReportDomains,
  listReportShares,
  passwordFromRequest,
  primaryVerifiedReportDomain,
  renderWorkerWhiteLabelPdf,
  whiteLabelPdfCacheVersion,
  reportBrandingForOwner,
  reportBrandingFromRow,
  reportDomainDnsName,
  reportDomainForHost,
  reportDomainResponse,
  reportDomainsEnabled,
  reportShareResponse,
  revokeReportDomain,
  revokeReportShare,
  saveReportBranding,
  shareToCamel,
  unlockClientReport,
  verifyReportDomain,
  verifyReportDomainChallenge,
  verifyReportDomainCname,
  verifyReportDomainTxt,
  verifyReportSharePassword
};
