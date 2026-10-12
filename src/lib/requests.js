import { DEFAULT_CRAWL_PAGES } from "../../shared/crawl-depth.js";
import { apiFetch, apiRequest } from "../api.js";
import { developerWebhookRequest } from "../developer-webhooks.js";
import { storageRemove, storageSet } from "../storage.js";
import { fixPackCheckoutBody } from "../fix-pack-checkout.js";
import { repairActionUpdateRequest } from "../repair-action-requests.js";
import { trackingPayload } from "./browser.js";
import { BETA_SESSION_KEY, BETA_EMAIL_KEY } from "./constants.js";

export async function refreshSession(setIsAuthed, setOwnerEmail) {
  try {
    const { response, payload } = await apiRequest("/api/beta/session");
    if (!response.ok) {
      storageRemove(BETA_SESSION_KEY);
      storageRemove(BETA_EMAIL_KEY);
      setOwnerEmail("");
      setIsAuthed(false);
      return;
    }
    storageSet(BETA_SESSION_KEY, "1");
    storageSet(BETA_EMAIL_KEY, payload.ownerEmail || "");
    setOwnerEmail(payload.ownerEmail || "");
    setIsAuthed(true);
  } catch {
    storageRemove(BETA_SESSION_KEY);
    storageRemove(BETA_EMAIL_KEY);
    setOwnerEmail("");
    setIsAuthed(false);
  }
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
    fallbackError: "Could not send the access link."
  });
}

export async function verifyAccessToken(token, funnelKey = "") {
  return apiFetch("/api/access/verify", {
    method: "POST",
    headers: funnelKey ? { "x-seofixkit-funnel-key": funnelKey } : {},
    body: { token, ...(funnelKey ? { funnelKey } : {}) },
    fallbackError: "Access link is expired or already used."
  });
}

export async function loadAccountSummary(setAccountData, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading your workspace.");
  try {
    const payload = await apiFetch("/api/account/summary", { fallbackError: "Could not load your workspace." });
    setAccountData(payload);
    setStatus("success");
    setMessage("");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load your workspace.");
  }
}

export async function loadDeveloperSummary(setDeveloperData, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading developer API.");
  try {
    const payload = await apiFetch("/api/developer", { fallbackError: "Could not load developer API." });
    setDeveloperData(payload);
    setStatus("success");
    setMessage("");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load developer API.");
  }
}

export async function postSiteClaim(host) {
  return apiFetch("/api/sites/claim", { method: "POST", body: { host }, fallbackError: "Could not create site verification." });
}

export async function postSiteVerify(claimId) {
  return apiFetch("/api/sites/verify", { method: "POST", body: { claimId }, fallbackError: "Could not verify site." });
}

export async function postAuditSchedule(url, options = {}) {
  return apiFetch("/api/audit/schedules", {
    method: "POST",
    body: {
      url,
      intervalDays: options.intervalDays || 7,
      maxPages: options.maxPages || DEFAULT_CRAWL_PAGES
    },
    fallbackError: "Could not add monitor."
  });
}

export async function pauseAuditSchedule(scheduleId) {
  return apiFetch(`/api/audit/schedules/${encodeURIComponent(scheduleId)}`, { method: "DELETE", fallbackError: "Could not pause monitor." });
}

export async function postDeveloperToken() {
  return apiFetch("/api/developer/tokens", { method: "POST", body: { label: "Default API key" }, fallbackError: "Could not create API key." });
}

export async function deleteDeveloperToken(tokenId) {
  return apiFetch(`/api/developer/tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE", fallbackError: "Could not revoke API key." });
}

export async function postDeveloperWebhook(url) {
  const request = developerWebhookRequest(url);
  return apiFetch(request.endpoint, { init: request.init, fallbackError: "Could not add webhook." });
}

export async function deleteDeveloperWebhook(webhookId) {
  return apiFetch(`/api/developer/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE", fallbackError: "Could not revoke webhook." });
}

export async function loadReportBranding() {
  return apiFetch("/api/branding", { fallbackError: "Could not load report branding." });
}

export async function saveReportBranding(branding) {
  return apiFetch("/api/branding", { method: "POST", body: branding, fallbackError: "Could not save report branding." });
}

export async function loadReportDomains() {
  return apiFetch("/api/report-domains", { fallbackError: "Could not load report domains." });
}

export async function createReportDomain(domain) {
  return apiFetch("/api/report-domains", { method: "POST", body: { domain }, fallbackError: "Could not create report domain." });
}

export async function verifyReportDomain(domainId) {
  return apiFetch(`/api/report-domains/${encodeURIComponent(domainId)}/verify`, { method: "POST", body: {}, fallbackError: "Could not verify report domain." });
}

export async function revokeReportDomain(domainId) {
  return apiFetch(`/api/report-domains/${encodeURIComponent(domainId)}`, { method: "DELETE", fallbackError: "Could not remove report domain." });
}

export async function loadReportShares(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/shares`, { fallbackError: "Could not load client links." });
}

export async function createReportShare(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/share`, { method: "POST", body, fallbackError: "Could not create client link." });
}

export async function revokeReportShare(shareId) {
  return apiFetch(`/api/report-shares/${encodeURIComponent(shareId)}`, { method: "DELETE", fallbackError: "Could not revoke client link." });
}

export async function loadReportCollaboration(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, { fallbackError: "Could not load repair board." });
}

export async function saveReportCollaboration(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/collaboration`, { method: "PATCH", body, fallbackError: "Could not save repair board." });
}

export async function loadRepairQueue(reportId) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, { fallbackError: "Could not load repair queue." });
}

export async function saveRepairQueue(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-queue`, { method: "PATCH", body, fallbackError: "Could not save repair queue." });
}

export async function createRepairAction(reportId, body) {
  return apiFetch(`/api/reports/${encodeURIComponent(reportId)}/repair-actions`, { method: "POST", body, fallbackError: "Could not draft agent action." });
}

export async function updateRepairAction(reportId, actionId, body) {
  const request = repairActionUpdateRequest(reportId, actionId, body);
  return apiFetch(request.endpoint, { init: request.init, fallbackError: "Could not update agent action." });
}

export async function createTeamMember(member) {
  return apiFetch("/api/team/members", { method: "POST", body: member, fallbackError: "Could not add teammate." });
}

export async function revokeTeamMember(memberId) {
  return apiFetch(`/api/team/members/${encodeURIComponent(memberId)}`, { method: "DELETE", fallbackError: "Could not remove teammate." });
}

export async function loadReport(id, setReport, setStatus, setMessage, onUnauthorized) {
  setStatus("loading");
  setMessage("Loading saved report.");
  try {
    const payload = await apiFetch(`/api/reports/${encodeURIComponent(id)}`, {
      requireOkFlag: false,
      fallbackError: "Could not load report."
    });
    setReport(payload);
    setStatus("success");
    setMessage("Report loaded.");
  } catch (error) {
    if (error.status === 401) onUnauthorized();
    setStatus("error");
    setMessage(error.message || "Could not load report.");
  }
}

export async function pollAuditJob(jobId, setMessage, { signal } = {}) {
  const attempts = 80;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    const payload = await apiFetch(`/api/audit/jobs/${encodeURIComponent(jobId)}`, {
      signal,
      fallbackError: "Could not check audit progress."
    });
    signal?.throwIfAborted();

    const job = payload.job || {};
    if (job.status === "completed") {
      setMessage("Audit complete. Loading private report.");
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "The audit failed. Try another URL.");
    }

    setMessage(
      job.status === "queued"
        ? "Audit queued. Waiting for proof collection to start."
        : "Rendering the site, crawling same-site links, and collecting proof."
    );
    await delay(Math.min(1500 + attempt * 100, 3500), signal);
  }

  throw new Error("The audit is still running. Refresh this page in a moment.");
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
    return { ok: false, error: error.message || "Checkout could not open." };
  }
}

export async function patchRepairProposalApproval(reportId, proposalId, body) {
  try {
    return await apiFetch(
      `/api/reports/${encodeURIComponent(reportId)}/repair-proposals/${encodeURIComponent(proposalId)}`,
      { method: "PATCH", body, fallbackError: "Could not update repair proposal." }
    );
  } catch (error) {
    return { ok: false, error: error.message || "Could not update repair proposal." };
  }
}

export async function loadBillingSummary(setBilling, setStatus, setMessage) {
  setStatus("loading");
  setMessage("Loading billing.");
  try {
    const payload = await apiFetch("/api/billing/summary", { fallbackError: "Could not load billing." });
    setBilling(payload);
    setStatus("success");
    setMessage("");
  } catch (error) {
    setStatus("error");
    setMessage(error.message || "Could not load billing.");
  }
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
