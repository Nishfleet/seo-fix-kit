import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  CRAWL_DEPTH_TIERS,
  DEFAULT_CRAWL_PAGES,
  SELF_SERVE_MAX_CRAWL_PAGES
} from "../../../shared/crawl-depth.js";
import { RENDERED_CRAWL_TARGETS } from "../../../shared/rendered-crawl-scale.js";
import { apiFetch, isAbortError } from "../../api.js";
import { storageGet, storageRemove, storageSet } from "../../storage.js";
import {
  EmptyAuditState,
  LoadingAuditState,
  ErrorAuditState
} from "../../components/AuditStates.jsx";
import { BetaTop } from "../../components/BetaTop.jsx";
import { reportIdFromPath, readOrCreateFunnelKey } from "../../lib/browser.js";
import { BETA_SESSION_KEY, BETA_EMAIL_KEY, FUNNEL_KEY } from "../../lib/constants.js";
import { formatCount, safeHostnameLabel } from "../../lib/format.js";
import {
  refreshSession,
  postAccessRequest,
  verifyAccessToken,
  loadAccountSummary,
  loadDeveloperSummary,
  postSiteClaim,
  postSiteVerify,
  postAuditSchedule,
  pauseAuditSchedule,
  postDeveloperToken,
  deleteDeveloperToken,
  postDeveloperWebhook,
  deleteDeveloperWebhook,
  loadReport,
  pollAuditJob,
  loadAdmin
} from "../../lib/requests.js";
import { AdminDashboard } from "../admin/AdminDashboard.jsx";
import { CustomerDashboard } from "./CustomerDashboard.jsx";
import { BillingPortal } from "../billing/BillingPortal.jsx";
import { ReportView } from "../report/ReportView.jsx";

export function BetaApp({ mountKey }) {
  const location = useLocation();
  const navigate = useNavigate();
  const reportId = reportIdFromPath(location.pathname);
  const isAdminRoute = location.pathname === "/beta/admin";
  const isBillingRoute = location.pathname.startsWith("/beta/billing");
  const inviteParams = new URLSearchParams(location.search);
  // Rewrite the address bar in place (no new history entry) while keeping
  // this BetaApp mounted; see BetaRoute in App.jsx.
  const replaceUrl = (path) => navigate(path, { replace: true, state: { betaMountKey: mountKey } });
  const accessToken = inviteParams.get("access") || "";
  const [ownerEmail, setOwnerEmail] = useState(
    () => inviteParams.get("email") || storageGet(BETA_EMAIL_KEY) || ""
  );
  const [loginEmail, setLoginEmail] = useState(ownerEmail || inviteParams.get("email") || "");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") || "");
  const [isAuthed, setIsAuthed] = useState(
    () => storageGet(BETA_SESSION_KEY) === "1"
  );
  const [loginStatus, setLoginStatus] = useState(accessToken ? "submitting" : "idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [maxPages, setMaxPages] = useState(String(DEFAULT_CRAWL_PAGES));
  const [renderedCrawlTarget, setRenderedCrawlTarget] = useState("0");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const [backlinkRows, setBacklinkRows] = useState("");
  const [keywordRows, setKeywordRows] = useState("");
  const [localBusinessName, setLocalBusinessName] = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const [localAddress, setLocalAddress] = useState("");
  const [googleBusinessProfileUrl, setGoogleBusinessProfileUrl] = useState("");
  const [localKeywords, setLocalKeywords] = useState("");
  const [localCitations, setLocalCitations] = useState("");
  const [auditStatus, setAuditStatus] = useState(reportId ? "loading" : "idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [report, setReport] = useState(null);
  const [accountData, setAccountData] = useState(null);
  const [accountStatus, setAccountStatus] = useState("idle");
  const [accountMessage, setAccountMessage] = useState("");
  const [siteHost, setSiteHost] = useState("");
  const [siteStatus, setSiteStatus] = useState("idle");
  const [siteMessage, setSiteMessage] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("idle");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [developerData, setDeveloperData] = useState(null);
  const [developerStatus, setDeveloperStatus] = useState("idle");
  const [developerMessage, setDeveloperMessage] = useState("");
  const [apiTokenSecret, setApiTokenSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminStatus, setAdminStatus] = useState("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [accessFormStartedAt] = useState(() => Date.now());

  useEffect(() => {
    if (isAdminRoute) {
      document.title = "SEO Fix Kit Ops";
      return;
    }
    if (isBillingRoute) {
      document.title = "SEO Fix Kit Billing";
      return;
    }
    if (report?.url) {
      document.title = `SEO Fix Kit report - ${safeHostnameLabel(report.url)}`;
      return;
    }
    document.title = "SEO Fix Kit Beta";
  }, [isAdminRoute, isBillingRoute, report?.url]);

  useEffect(() => {
    if (storageGet(BETA_SESSION_KEY) === "1" || reportId || isAdminRoute || isBillingRoute) {
      refreshSession(setIsAuthed, setOwnerEmail);
    }
  }, [reportId, isAdminRoute, isBillingRoute]);

  useEffect(() => {
    if (!inviteParams.get("invite")) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("invite");
    replaceUrl(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoginStatus("submitting");
    setLoginMessage("Opening secure access link.");
    const storedFunnelKey = storageGet(FUNNEL_KEY) || "";
    verifyAccessToken(accessToken, storedFunnelKey)
      .then((payload) => {
        if (cancelled) return;
        storageSet(BETA_SESSION_KEY, "1");
        storageSet(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
        setOwnerEmail(payload.ownerEmail || loginEmail);
        setIsAuthed(true);
        setLoginStatus("success");
        setLoginMessage("Access unlocked.");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("access");
        cleanUrl.searchParams.delete("email");
        replaceUrl(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoginStatus("error");
        setLoginMessage(error.message || "Access link is expired or already used.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthed || !reportId) return;
    loadReport(reportId, setReport, setAuditStatus, setAuditMessage, () => {
      setIsAuthed(false);
      storageRemove(BETA_SESSION_KEY);
      storageRemove(BETA_EMAIL_KEY);
    });
  }, [isAuthed, reportId]);

  useEffect(() => {
    if (!isAuthed || reportId || isAdminRoute || isBillingRoute) return;
    loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
  }, [isAuthed, reportId, isAdminRoute, isBillingRoute]);

  useEffect(() => {
    if (!isAuthed || reportId || isAdminRoute || isBillingRoute) return;
    if (!Number(accountData?.metrics?.runningAudits || 0)) return;
    const interval = window.setInterval(() => {
      loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [isAuthed, reportId, isAdminRoute, isBillingRoute, accountData?.metrics?.runningAudits]);

  // Queued audits are polled for minutes; tie that loop to this component so
  // unmounting (or starting another audit) stops it instead of leaking
  // requests and setState calls.
  const auditPollRef = useRef(null);
  useEffect(() => () => auditPollRef.current?.abort(), []);

  async function login(event) {
    event.preventDefault();
    setLoginStatus("submitting");
    setLoginMessage("");

    try {
      const payload = await apiFetch("/api/beta/login", {
        method: "POST",
        body: { email: loginEmail, inviteCode },
        requireOkFlag: false,
        fallbackError: "Private beta invite code required."
      });
      storageSet(BETA_SESSION_KEY, "1");
      storageSet(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
      setOwnerEmail(payload.ownerEmail || loginEmail);
      setIsAuthed(true);
      setLoginStatus("success");
      setInviteCode("");
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "Could not unlock private beta.");
    }
  }

  async function requestGateAccess() {
    setLoginStatus("submitting");
    setLoginMessage("");
    try {
      const gateFunnelKey = readOrCreateFunnelKey();
      const payload = await postAccessRequest({
        email: loginEmail,
        source: "beta-gate-access",
        formStartedAt: accessFormStartedAt,
        returnTo: window.location.pathname.startsWith("/beta") ? window.location.pathname : "",
        funnelKey: gateFunnelKey
      });
      setLoginStatus("success");
      setLoginMessage(
        payload.accessUrl
          ? "Local access link created."
          : payload.message ||
            (reportId
              ? "Check your email — the link will bring you straight back to this report."
              : "Check your email for a secure access link.")
      );
      if (payload.accessUrl) window.location.assign(payload.accessUrl);
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "Could not send the access link.");
    }
  }

  async function claimSite(event) {
    event.preventDefault();
    setSiteStatus("loading");
    setSiteMessage("Creating verification challenge.");
    try {
      const payload = await postSiteClaim(siteHost);
      setSiteStatus("success");
      setSiteMessage(`Verification challenge ready for ${payload.site?.host || siteHost}.`);
      setSiteHost("");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setSiteStatus("error");
      setSiteMessage(error.message || "Could not create site verification.");
    }
  }

  async function verifySite(claimId) {
    setSiteStatus("loading");
    setSiteMessage("Checking DNS and HTTPS proof.");
    try {
      const payload = await postSiteVerify(claimId);
      setSiteStatus(payload.verified ? "success" : "error");
      setSiteMessage(payload.verified ? `${payload.site.host} is verified.` : payload.message || "Verification proof was not found yet.");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setSiteStatus("error");
      setSiteMessage(error.message || "Could not verify site.");
    }
  }

  async function createSchedule(url) {
    setScheduleStatus("loading");
    setScheduleMessage("Adding weekly monitor.");
    try {
      const payload = await postAuditSchedule(url, { intervalDays: 7, maxPages: DEFAULT_CRAWL_PAGES });
      setScheduleStatus("success");
      setScheduleMessage(`${payload.schedule?.targetHost || safeHostnameLabel(url)} will be checked weekly.`);
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setScheduleStatus("error");
      setScheduleMessage(error.message || "Could not add monitor.");
    }
  }

  async function deleteSchedule(scheduleId) {
    setScheduleStatus("loading");
    setScheduleMessage("Pausing monitor.");
    try {
      await pauseAuditSchedule(scheduleId);
      setScheduleStatus("success");
      setScheduleMessage("Monitor paused.");
      await loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    } catch (error) {
      setScheduleStatus("error");
      setScheduleMessage(error.message || "Could not pause monitor.");
    }
  }

  async function createApiToken() {
    setDeveloperStatus("loading");
    setDeveloperMessage("Creating API key.");
    setApiTokenSecret("");
    try {
      const payload = await postDeveloperToken();
      setApiTokenSecret(payload.tokenSecret || "");
      setDeveloperStatus("success");
      setDeveloperMessage(payload.message || "API key created.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not create API key.");
    }
  }

  async function revokeApiToken(tokenId) {
    setDeveloperStatus("loading");
    setDeveloperMessage("Revoking API key.");
    try {
      await deleteDeveloperToken(tokenId);
      setDeveloperStatus("success");
      setDeveloperMessage("API key revoked.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not revoke API key.");
    }
  }

  async function createWebhook(event) {
    event.preventDefault();
    setDeveloperStatus("loading");
    setDeveloperMessage("Adding webhook.");
    setWebhookSecret("");
    try {
      const payload = await postDeveloperWebhook(webhookUrl);
      setWebhookUrl("");
      setWebhookSecret(payload.signingSecret || "");
      setDeveloperStatus("success");
      setDeveloperMessage("Webhook added.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not add webhook.");
    }
  }

  async function revokeWebhook(webhookId) {
    setDeveloperStatus("loading");
    setDeveloperMessage("Revoking webhook.");
    try {
      await deleteDeveloperWebhook(webhookId);
      setDeveloperStatus("success");
      setDeveloperMessage("Webhook revoked.");
      await loadDeveloperSummary(setDeveloperData, setDeveloperStatus, setDeveloperMessage);
    } catch (error) {
      setDeveloperStatus("error");
      setDeveloperMessage(error.message || "Could not revoke webhook.");
    }
  }

  async function runAudit(event) {
    event.preventDefault();
    setAuditStatus("loading");
    const localSeo = {
      businessName: localBusinessName,
      phone: localPhone,
      address: localAddress,
      googleBusinessProfileUrl,
      localKeywords,
      citations: localCitations
    };
    setAuditMessage(
      competitorUrls.trim() || backlinkRows.trim() || keywordRows.trim() || Object.values(localSeo).some((value) => String(value || "").trim())
        ? "Rendering the site, checking comparison inputs, and collecting proof."
        : "Rendering the site, crawling same-site links, and collecting proof."
    );
    setReport(null);
    auditPollRef.current?.abort();
    const auditPoll = new AbortController();
    auditPollRef.current = auditPoll;

    try {
      const payload = await apiFetch("/api/audit", {
        method: "POST",
        body: { url: targetUrl, maxPages: Number(maxPages), renderedCrawlTarget: Number(renderedCrawlTarget), competitorUrls, backlinkRows, keywordRows, localSeo },
        requireOkFlag: false,
        fallbackError: "The audit failed."
      });
      if (payload.mode === "queued" && (payload.jobId || payload.job?.id)) {
        const jobId = payload.jobId || payload.job.id;
        setAuditMessage("Audit queued. Waiting for proof collection to start.");
        const job = await pollAuditJob(jobId, setAuditMessage, { signal: auditPoll.signal });
        if (!job.reportId) {
          throw new Error("Audit finished without a saved report.");
        }
        if (job.reportPath) {
          replaceUrl(job.reportPath);
        }
        await loadReport(job.reportId, setReport, setAuditStatus, setAuditMessage, () => {
          setIsAuthed(false);
          storageRemove(BETA_SESSION_KEY);
          storageRemove(BETA_EMAIL_KEY);
        });
        loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
        return;
      }
      setReport(payload);
      setAuditStatus("success");
      setAuditMessage("Audit saved. Private report URL is ready.");
      loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
      if (payload.reportPath) {
        replaceUrl(payload.reportPath);
      }
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
    } catch (error) {
      if (isAbortError(error) || auditPoll.signal.aborted) return;
      if (
        error.message.toLowerCase().includes("session") ||
        error.message.toLowerCase().includes("password") ||
        error.message.toLowerCase().includes("invite")
      ) {
        setIsAuthed(false);
        storageRemove(BETA_SESSION_KEY);
        storageRemove(BETA_EMAIL_KEY);
      }
      setAuditStatus("error");
      setAuditMessage(error.message || "The audit failed. Try another URL.");
    }
  }

  function lock() {
    fetch("/api/beta/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    storageRemove(BETA_SESSION_KEY);
    storageRemove(BETA_EMAIL_KEY);
    setOwnerEmail("");
    setLoginEmail("");
    setInviteCode("");
    setIsAuthed(false);
    setReport(null);
    setAccountData(null);
    replaceUrl("/beta");
  }

  const showingReport = Boolean(report && auditStatus === "success");

  if (isAdminRoute) {
    return (
      <main className="beta-shell">
        <BetaTop onLock={lock} showBilling showOps />
        <AdminDashboard
          adminData={adminData}
          adminMessage={adminMessage}
          adminStatus={adminStatus}
          adminToken={adminToken}
          onLoad={() => loadAdmin(adminToken, setAdminData, setAdminStatus, setAdminMessage, () => setAdminToken(""))}
          onTokenChange={(value) => {
            setAdminToken(value);
          }}
          onInviteCreated={() => loadAdmin("", setAdminData, setAdminStatus, setAdminMessage)}
        />
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="beta-shell beta-gate">
        <BetaTop />
        <section className="gate-panel" aria-labelledby="beta-title">
          <p className="beta-eyebrow">Private beta</p>
          <h1 id="beta-title">Enter your beta invite</h1>
          <p>
            Run evidence-backed audits, save private reports, and generate the
            repair brief a developer can ship from.
          </p>
          <form className="gate-form" onSubmit={login}>
            <label htmlFor="beta-email">Invite email</label>
            <input
              autoComplete="email"
              id="beta-email"
              inputMode="email"
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={loginEmail}
            />
            <label htmlFor="beta-password">Invite code</label>
            <div className="gate-row">
              <input
                autoComplete="current-password"
                id="beta-password"
                onChange={(event) => setInviteCode(event.target.value)}
                required
                type="password"
                value={inviteCode}
              />
              <button disabled={loginStatus === "submitting"} type="submit">
                {loginStatus === "submitting" ? "Checking" : "Enter"}
              </button>
            </div>
            <p className={`form-message ${loginStatus}`} aria-live="polite">
              {loginMessage || "Use an invite code, or email yourself a secure one-use link."}
            </p>
            <div className="access-request-row">
              <span>Need access?</span>
              <button
                className="text-button accent-text"
                disabled={loginStatus === "submitting" || !loginEmail}
                onClick={requestGateAccess}
                type="button"
              >
                Email access link
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  if (isBillingRoute) {
    return (
      <main className="beta-shell">
        <BetaTop onLock={lock} showBilling />
        <BillingPortal ownerEmail={ownerEmail} />
      </main>
    );
  }

  return (
    <main className="beta-shell">
      <BetaTop onLock={lock} showBilling />

      <section
        className={`beta-hero ${showingReport ? "beta-hero-compact" : ""}`}
        aria-labelledby="beta-workspace-title"
      >
        <div>
          <p className="beta-eyebrow">Audit workspace</p>
          <h1 id="beta-workspace-title">
            {showingReport ? "Proof-backed SEO audit" : "Find the SEO problem. Prove it. Generate the fix."}
          </h1>
          {ownerEmail && <p className="session-note">Private beta session: {ownerEmail}</p>}
        </div>
        <form className="audit-form" onSubmit={runAudit}>
          <label htmlFor="audit-url">Website URL</label>
          <div className="audit-row">
            <input
              id="audit-url"
              inputMode="url"
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://example.com"
              required
              type="url"
              value={targetUrl}
            />
            <button disabled={auditStatus === "loading"} type="submit">
              {auditStatus === "loading" ? "Auditing" : "Run audit"}
            </button>
          </div>
          <label htmlFor="crawl-depth">Crawl depth</label>
          <select
            id="crawl-depth"
            onChange={(event) => setMaxPages(event.target.value)}
            value={maxPages}
          >
            {CRAWL_DEPTH_TIERS.map((tier) => (
              <option key={tier.id} value={tier.pages}>
                {tier.label} - {tier.pages} pages
              </option>
            ))}
          </select>
          <p className="field-note">Self-serve deep crawls currently run up to {formatCount(SELF_SERVE_MAX_CRAWL_PAGES)} pages.</p>
          <label htmlFor="rendered-crawl-target">Rendered scale target</label>
          <select
            id="rendered-crawl-target"
            onChange={(event) => setRenderedCrawlTarget(event.target.value)}
            value={renderedCrawlTarget}
          >
            <option value="0">No staged target</option>
            {RENDERED_CRAWL_TARGETS.slice(1).map((tier) => (
              <option key={tier.id} value={tier.pages}>
                {tier.label} - {formatCount(tier.pages)} pages
              </option>
            ))}
          </select>
          <p className="field-note">Early access: large targets create a staged batch plan that renders gradually in the background over days to weeks. No full-coverage claim is made until every batch completes.</p>
          <label htmlFor="competitor-urls">Competitors</label>
          <textarea
            id="competitor-urls"
            onChange={(event) => setCompetitorUrls(event.target.value)}
            placeholder="https://competitor.com"
            rows="3"
            value={competitorUrls}
          />
          <label htmlFor="backlink-rows">Backlinks</label>
          <textarea
            id="backlink-rows"
            onChange={(event) => setBacklinkRows(event.target.value)}
            placeholder="https://source.com/page,https://example.com/page,anchor text"
            rows="4"
            value={backlinkRows}
          />
          <label htmlFor="keyword-rows">Keyword rows</label>
          <textarea
            id="keyword-rows"
            onChange={(event) => setKeywordRows(event.target.value)}
            placeholder="query,page,clicks,impressions,ctr,position,previous_clicks,previous_position"
            rows="4"
            value={keywordRows}
          />
          <div className="local-seo-fields">
            <label htmlFor="local-business-name">Local business</label>
            <input
              id="local-business-name"
              onChange={(event) => setLocalBusinessName(event.target.value)}
              placeholder="Bright Dental Austin"
              type="text"
              value={localBusinessName}
            />
            <label htmlFor="local-phone">Phone</label>
            <input
              id="local-phone"
              onChange={(event) => setLocalPhone(event.target.value)}
              placeholder="+1 512 555 0199"
              type="tel"
              value={localPhone}
            />
            <label htmlFor="local-address">Address</label>
            <textarea
              id="local-address"
              onChange={(event) => setLocalAddress(event.target.value)}
              placeholder="123 Main St, Austin, TX 78701"
              rows="2"
              value={localAddress}
            />
            <label htmlFor="google-business-profile-url">Google Business Profile</label>
            <input
              id="google-business-profile-url"
              inputMode="url"
              onChange={(event) => setGoogleBusinessProfileUrl(event.target.value)}
              placeholder="https://maps.google.com/?cid=..."
              type="url"
              value={googleBusinessProfileUrl}
            />
            <label htmlFor="local-keywords">Local keywords</label>
            <textarea
              id="local-keywords"
              onChange={(event) => setLocalKeywords(event.target.value)}
              placeholder="dentist Austin"
              rows="3"
              value={localKeywords}
            />
            <label htmlFor="local-citations">Citations</label>
            <textarea
              id="local-citations"
              onChange={(event) => setLocalCitations(event.target.value)}
              placeholder="https://directory.com/profile,Bright Dental Austin,+1 512 555 0199,123 Main St Austin TX"
              rows="3"
              value={localCitations}
            />
          </div>
        </form>
      </section>

      {!showingReport && (
        <CustomerDashboard
          accountData={accountData}
          developerData={developerData}
          developerMessage={developerMessage}
          developerStatus={developerStatus}
          apiTokenSecret={apiTokenSecret}
          webhookSecret={webhookSecret}
          webhookUrl={webhookUrl}
          onApiTokenCreate={createApiToken}
          onApiTokenRevoke={revokeApiToken}
          onScheduleCreate={createSchedule}
          onScheduleDelete={deleteSchedule}
          onSiteClaim={claimSite}
          onSiteHostChange={setSiteHost}
          onSiteVerify={verifySite}
          onWebhookCreate={createWebhook}
          onWebhookRevoke={revokeWebhook}
          onWebhookUrlChange={setWebhookUrl}
          message={accountMessage}
          scheduleMessage={scheduleMessage}
          scheduleStatus={scheduleStatus}
          siteHost={siteHost}
          siteMessage={siteMessage}
          siteStatus={siteStatus}
          status={accountStatus}
        />
      )}

      <section className="audit-stage" aria-live="polite">
        {auditStatus === "idle" && <EmptyAuditState />}
        {auditStatus === "loading" && <LoadingAuditState message={auditMessage} />}
        {auditStatus === "error" && <ErrorAuditState message={auditMessage} />}
        {report && auditStatus === "success" && (
          <ReportView report={report} />
        )}
      </section>
    </main>
  );
}
