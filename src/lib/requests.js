import { DEFAULT_CRAWL_PAGES } from "../../shared/crawl-depth.js";
import { apiFetch, apiRequest } from "../api.js";
import { developerWebhookRequest } from "../developer-webhooks.js";
import { storageRemove, storageSet } from "../storage.js";
import { fixPackCheckoutBody } from "../fix-pack-checkout.js";
import { repairActionUpdateRequest } from "../repair-action-requests.js";
import { trackingPayload } from "./browser.js";
import { BETA_SESSION_KEY, BETA_EMAIL_KEY } from "./constants.js";

// Returns the signed-in owner, or null when there is no live session. Keeps
// the local "signed in" hint in step with the server.
export async function fetchSession() {
  let result;
  try {
    result = await apiRequest("/api/beta/session");
  } catch {
    result = { response: { ok: false }, payload: {} };
  }
  const { response, payload } = result;
  if (!response.ok) {
    storageRemove(BETA_SESSION_KEY);
    storageRemove(BETA_EMAIL_KEY);
    return null;
  }
  storageSet(BETA_SESSION_KEY, "1");
  storageSet(BETA_EMAIL_KEY, payload.ownerEmail || "");
  return { ownerEmail: payload.ownerEmail || "" };
}

export async function postAccessRequest({ email, company = "", source, formStartedAt, returnTo = "", funnelKey = "" }) {
  return apiFetch("/api/access/request", {
    method: "POST",
    headers: funnelKey ? { "x-seofixkit-funnel-key": funnelKey } : {},
    body: {
      email,
      company,
      source,
      ...(returnTo ? { returnTo } : {}),
      ...(funnelKey ? { funnelKey } : {}),
      ...trackingPayload(formStartedAt)
    },
    requireOkFlag: false,
    fallbackError: "The sign-in link didn’t send. Check your email address and try again."
  });
}

export async function verifyAccessToken(token, funnelKey = "") {
  return apiFetch("/api/access/verify", {
    method: "POST",
    headers: funnelKey ? { "x-seofixkit-funnel-key": funnelKey } : {},
    body: { token, ...(funnelKey ? { funnelKey } : {}) },
    fallbackError: "This sign-in link expired or was already used. Send yourself a new one."
  });
}

export async function fetchAccountSummary() {
  return apiFetch("/api/account/summary", { fallbackError: "Your dashboard didn’t load. Try again." });
}

export async function fetchReportsPage(cursor = "") {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/api/reports${query}`, { fallbackError: "Your reports didn’t load. Try again." });
}

export async function fetchDeveloperSummary() {
  return apiFetch("/api/developer", { fallbackError: "Your API keys and webhooks didn’t load. Try again." });
}

export async function postSiteClaim(host) {
  return apiFetch("/api/sites/claim", {
    method: "POST",
    body: { host },
    fallbackError: "Couldn’t add this site. Check the domain and try again."
  });
}

export async function postSiteVerify(claimId) {
  return apiFetch("/api/sites/verify", {
    method: "POST",
    body: { claimId },
    fallbackError: "The verification check didn’t run. Try again."
  });
}

export async function postAuditSchedule(url, options = {}) {
  return apiFetch("/api/audit/schedules", {
    method: "POST",
    body: {
      url,
      intervalDays: options.intervalDays || 7,
      maxPages: options.maxPages || DEFAULT_CRAWL_PAGES
    },
    fallbackError: "Weekly checks didn’t turn on. Try again."
  });
}

export async function pauseAuditSchedule(scheduleId) {
  return apiFetch(`/api/audit/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "DELETE",
    fallbackError: "Weekly checks didn’t pause. Try again."
  });
}

export async function postDeveloperToken() {
  return apiFetch("/api/developer/tokens", {
    method: "POST",
    body: { label: "Default API key" },
    fallbackError: "The API key wasn’t created. Try again."
  });
}

export async function deleteDeveloperToken(tokenId) {
  return apiFetch(`/api/developer/tokens/${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    fallbackError: "The API key wasn’t revoked. Try again."
  });
}

export async function postDeveloperWebhook(url) {
  const request = developerWebhookRequest(url);
  return apiFetch(request.endpoint, {
    init: request.init,
    fallbackError: "The endpoint wasn’t added. Check the URL and try again."
  });
}

export async function deleteDeveloperWebhook(webhookId) {
  return apiFetch(`/api/developer/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
    fallbackError: "The endpoint wasn’t removed. Try again."
  });
}

export async function loadReportBranding() {
  return apiFetch("/api/branding", { fallbackError: "Report branding didn’t load. Try again." });
}

export async function saveReportBranding(branding) {
  return apiFetch("/api/branding", {
    method: "POST",
    body: branding,
    fallbackError: "Branding didn’t save. Try again."
  });
}

export async function loadReportDomains() {
  return apiFetch("/api/report-domains", { fallbackError: "Custom domains didn’t load. Try again." });
}

export async function createReportDomain(domain) {
  return apiFetch("/api/report-domains", {
    method: "POST",
    body: { domain },
    fallbackError: "The domain wasn’t added. Check it and try again."
  });
}

export async function verifyReportDomain(domainId) {
  return apiFetch(`/api/report-domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
    body: {},
    fallbackError: "Domain not verified yet. DNS changes can take a few minutes. Try again shortly."
  });
}

export async function revokeReportDomain(domainId) {
  return apiFetch(`/api/report-domains/${encodeURIComponent(domainId)}`, {
    method: "DELETE",
    fallbackError: "The domain wasn’t removed. Try again."
  });
}

export async function loadReportShares(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/shares`, {
    fallbackError: "Client links didn’t load. Try again."
  });
}

export async function createReportShare(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/share`, {
    method: "POST",
    body,
    fallbackError: "The client link wasn’t created. Try again."
  });
}

export async function revokeReportShare(shareId) {
  return apiFetch(`/api/report-shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    fallbackError: "The client link wasn’t revoked. Try again."
  });
}

export async function loadReportCollaboration(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, {
    fallbackError: "The repair queue didn’t load. Try again."
  });
}

export async function saveReportCollaboration(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, {
    method: "PATCH",
    body,
    fallbackError: "Your changes didn’t save. Try again."
  });
}

export async function loadRepairQueue(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, {
    fallbackError: "The repair queue didn’t load. Try again."
  });
}

export async function saveRepairQueue(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, {
    method: "PATCH",
    body,
    fallbackError: "Your changes didn’t save. Try again."
  });
}

export async function createRepairAction(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-actions`, {
    method: "POST",
    body,
    fallbackError: "The draft wasn’t created. Try again."
  });
}

export async function updateRepairAction(reportId, actionId, body) {
  const request = repairActionUpdateRequest(reportId, actionId, body);
  return apiFetch(request.endpoint, { init: request.init, fallbackError: "The draft wasn’t updated. Try again." });
}

export async function createTeamMember(member) {
  return apiFetch("/api/team/members", {
    method: "POST",
    body: member,
    fallbackError: "The teammate wasn’t added. Check the email and try again."
  });
}

export async function revokeTeamMember(memberId) {
  return apiFetch(`/api/team/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    fallbackError: "The teammate wasn’t removed. Try again."
  });
}

export async function fetchReport(id) {
  return apiFetch(`/api/reports/${encodeURIComponent(id)}`, {
    requireOkFlag: false,
    fallbackError: "This report didn’t load."
  });
}

export async function pollAuditJob(jobId, setMessage, { signal } = {}) {
  const attempts = 80;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    const payload = await apiFetch(`/api/audit/jobs/${encodeURIComponent(jobId)}`, {
      signal,
      fallbackError: "We lost track of the audit’s progress. Check Reports in a minute."
    });
    signal?.throwIfAborted();

    const job = payload.job || {};
    if (job.status === "completed") {
      setMessage("Audit done. Opening your report…");
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "The audit didn’t finish. Check the URL and run it again.");
    }

    setMessage(
      job.status === "queued"
        ? "Audit queued. Waiting to start…"
        : "Loading your pages in a browser and following links on your site…"
    );
    await delay(Math.min(1500 + attempt * 100, 3500), signal);
  }

  throw new Error("The audit is still running. Check Reports in a few minutes.");
}

export function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchBrief(id) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/brief.md`, {
    credentials: "same-origin"
  });
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `seofixkit-${id}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function requestFixQuote(reportId, selectedRepair = null) {
  try {
    const { response, payload } = await apiRequest("/api/beta/fix-request", {
      method: "POST",
      body: fixPackCheckoutBody(reportId, selectedRepair)
    });
    return {
      ok: response.ok,
      checkoutUrl: response.ok ? payload.checkoutUrl || "" : "",
      mode: payload.mode || "",
      message: payload.message || "",
      error: payload.error || "",
      selectedRepair: payload.selectedRepair || null
    };
  } catch (error) {
    return { ok: false, error: error.message || "Checkout didn’t open. Try again or email support@seofixkit.com." };
  }
}

export async function patchRepairProposalApproval(reportId, proposalId, body) {
  try {
    return await apiFetch(
      `/api/reports/${encodeURIComponent(reportId)}/repair-proposals/${encodeURIComponent(proposalId)}`,
      { method: "PATCH", body, fallbackError: "That change didn’t save. Try again." }
    );
  } catch (error) {
    return { ok: false, error: error.message || "That change didn’t save. Try again." };
  }
}

export async function fetchBillingSummary() {
  return apiFetch("/api/billing/summary", { fallbackError: "Billing details didn’t load. Try again." });
}

export async function fetchPricingPreview() {
  const payload = await apiFetch("/api/pricing-preview", {
    credentials: "include",
    requireOkFlag: false,
    errorKeys: ["message"],
    fallbackError: "The price didn’t load. Try again."
  });
  return payload.pricing || {};
}

export async function loadAdmin(token, setAdminData, setAdminStatus, setAdminMessage, onSessionReady = null) {
  setAdminStatus("loading");
  setAdminMessage("");
  try {
    if (token) {
      const session = await createAdminSession(token);
      if (!session.ok) throw new Error(session.error || "Could not unlock admin session.");
      onSessionReady?.();
    }
    const payload = await apiFetch("/admin/summary", {
      headers: adminRequestHeaders(""),
      fallbackError: "Could not load ops."
    });
    setAdminData(payload);
    setAdminStatus("success");
    setAdminMessage("");
  } catch (error) {
    setAdminStatus("error");
    setAdminMessage(error.message || "Could not load ops.");
  }
}

export async function createAdminSession(token) {
  try {
    return await apiFetch("/admin/session", {
      method: "POST",
      body: { token },
      fallbackError: "Could not unlock admin session."
    });
  } catch (error) {
    return { ok: false, error: error.message || "Could not unlock admin session." };
  }
}

export async function postAdminInvite(token, body) {
  try {
    return await apiFetch("/admin/invites", {
      method: "POST",
      headers: adminRequestHeaders(token, true),
      body,
      fallbackError: "Could not create invite."
    });
  } catch (error) {
    return { ok: false, error: error.message || "Could not create invite." };
  }
}

export async function patchAdminFixRequest(token, id, body) {
  try {
    return await apiFetch(`/admin/fix-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: adminRequestHeaders(token, true),
      body,
      fallbackError: "Could not update Fix Pack request."
    });
  } catch (error) {
    return { ok: false, error: error.message || "Could not update Fix Pack request." };
  }
}

export function adminRequestHeaders(token, json = false) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers["content-type"] = "application/json";
  return headers;
}
