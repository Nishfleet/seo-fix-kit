import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CRAWL_DEPTH_TIERS, DEFAULT_CRAWL_PAGES, SELF_SERVE_MAX_CRAWL_PAGES } from "../../../shared/crawl-depth.js";
import { RENDERED_CRAWL_TARGETS } from "../../../shared/rendered-crawl-scale.js";
import { apiFetch, isAbortError } from "../../api.js";
import { storageGet, storageRemove, storageSet } from "../../storage.js";
import { AppShell, PageHeader } from "../../components/AppShell.jsx";
import { LoadingAuditState, ErrorAuditState } from "../../components/AuditStates.jsx";
import { reportIdFromPath, readOrCreateFunnelKey } from "../../lib/browser.js";
import { BETA_SESSION_KEY, BETA_EMAIL_KEY, FUNNEL_KEY } from "../../lib/constants.js";
import { sectionFromPath } from "../../lib/app-sections.js";
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
import { DeveloperApiPanel, Overview, ReportsPage, SitesPage } from "./CustomerDashboard.jsx";
import { SignIn } from "./SignIn.jsx";
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
  const [ownerEmail, setOwnerEmail] = useState(() => inviteParams.get("email") || storageGet(BETA_EMAIL_KEY) || "");
  const [loginEmail, setLoginEmail] = useState(ownerEmail || inviteParams.get("email") || "");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") || "");
  const [isAuthed, setIsAuthed] = useState(() => storageGet(BETA_SESSION_KEY) === "1");
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
    setLoginMessage("Signing you in…");
    const storedFunnelKey = storageGet(FUNNEL_KEY) || "";
    verifyAccessToken(accessToken, storedFunnelKey)
      .then((payload) => {
        if (cancelled) return;
        storageSet(BETA_SESSION_KEY, "1");
        storageSet(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
        setOwnerEmail(payload.ownerEmail || loginEmail);
        setIsAuthed(true);
        setLoginStatus("success");
        setLoginMessage("");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("access");
        cleanUrl.searchParams.delete("email");
        replaceUrl(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoginStatus("error");
        setLoginMessage(error.message || "This sign-in link has expired or was already used. Request a new one below.");
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
    if (!isAuthed || isAdminRoute) return;
    loadAccountSummary(setAccountData, setAccountStatus, setAccountMessage);
    if (reportId || isBillingRoute) return;
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
        fallbackError: "That invite code didn’t work."
      });
      storageSet(BETA_SESSION_KEY, "1");
      storageSet(BETA_EMAIL_KEY, payload.ownerEmail || loginEmail);
      setOwnerEmail(payload.ownerEmail || loginEmail);
      setIsAuthed(true);
      setLoginStatus("success");
      setInviteCode("");
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "We couldn’t sign you in. Please try again.");
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
      setLoginMessage(payload.accessUrl ? "Local access link created." : "");
      if (payload.accessUrl) window.location.assign(payload.accessUrl);
      return true;
    } catch (error) {
      setLoginStatus("error");
      setLoginMessage(error.message || "We couldn’t send the link. Please try again.");
      return false;
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
      setSiteMessage(
        payload.verified
          ? `${payload.site.host} is verified.`
          : payload.message || "Verification proof was not found yet."
      );
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
      competitorUrls.trim() ||
        backlinkRows.trim() ||
        keywordRows.trim() ||
        Object.values(localSeo).some((value) => String(value || "").trim())
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
        body: {
          url: targetUrl,
          maxPages: Number(maxPages),
          renderedCrawlTarget: Number(renderedCrawlTarget),
          competitorUrls,
          backlinkRows,
          keywordRows,
          localSeo
        },
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

  function signOut() {
    fetch("/api/beta/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    storageRemove(BETA_SESSION_KEY);
    storageRemove(BETA_EMAIL_KEY);
    setOwnerEmail("");
    setLoginEmail("");
    setInviteCode("");
    setIsAuthed(false);
    setReport(null);
    setAccountData(null);
    navigate("/beta", { replace: true });
  }

  const showingReport = Boolean(report && auditStatus === "success");
  const section = sectionFromPath(location.pathname);
  const shell = (children) => (
    <AppShell
      onSignOut={signOut}
      ownerEmail={ownerEmail}
      section={section}
      showOps={accountData?.owner?.accessMode === "founder-override" || isAdminRoute}
    >
      {children}
    </AppShell>
  );

  if (isAdminRoute) {
    return shell(
      <div className="app-page app-page-wide">
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
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <SignIn
        email={loginEmail}
        inviteCode={inviteCode}
        message={loginMessage}
        onCodeSubmit={login}
        onEmailChange={setLoginEmail}
        onInviteCodeChange={setInviteCode}
        onLinkRequest={requestGateAccess}
        returningToReport={Boolean(reportId)}
        status={loginStatus}
      />
    );
  }

  if (isBillingRoute) {
    return shell(<BillingPortal />);
  }

  if (section === "report") {
    return shell(
      <div className="app-page app-page-wide">
        <nav className="app-breadcrumb" aria-label="Breadcrumb">
          <Link discover="none" to="/beta/reports">
            Reports
          </Link>
          <span aria-hidden="true">/</span>
          <span>{report?.url ? safeHostnameLabel(report.url) : "Report"}</span>
        </nav>
        <section className="audit-stage" aria-live="polite">
          {auditStatus === "loading" && <LoadingAuditState message={auditMessage} />}
          {auditStatus === "error" && <ErrorAuditState message={auditMessage} />}
          {showingReport && <ReportView report={report} />}
        </section>
      </div>
    );
  }

  if (section === "reports") {
    return shell(<ReportsPage accountData={accountData} message={accountMessage} status={accountStatus} />);
  }

  if (section === "sites") {
    return shell(
      <SitesPage
        accountData={accountData}
        message={accountMessage}
        onScheduleCreate={createSchedule}
        onScheduleDelete={deleteSchedule}
        onSiteClaim={claimSite}
        onSiteHostChange={setSiteHost}
        onSiteVerify={verifySite}
        scheduleMessage={scheduleMessage}
        scheduleStatus={scheduleStatus}
        siteHost={siteHost}
        siteMessage={siteMessage}
        siteStatus={siteStatus}
        status={accountStatus}
      />
    );
  }

  if (section === "developers") {
    return shell(
      <div className="app-page">
        <PageHeader
          title="Developers"
          description="Start audits and read results from your own tools with API keys, and get notified with webhooks."
        />
        <DeveloperApiPanel
          apiTokenSecret={apiTokenSecret}
          developerData={developerData}
          developerMessage={developerMessage}
          developerStatus={developerStatus}
          onApiTokenCreate={createApiToken}
          onApiTokenRevoke={revokeApiToken}
          onWebhookCreate={createWebhook}
          onWebhookRevoke={revokeWebhook}
          onWebhookUrlChange={setWebhookUrl}
          webhookSecret={webhookSecret}
          webhookUrl={webhookUrl}
        />
      </div>
    );
  }

  const auditPanel = (
    <>
      <form className="audit-form" onSubmit={runAudit}>
        <label htmlFor="audit-url">Page or site URL</label>
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
            {auditStatus === "loading" ? "Running…" : "Run audit"}
          </button>
        </div>
        <div className="audit-options">
          <div>
            <label htmlFor="crawl-depth">How many pages</label>
            <select id="crawl-depth" onChange={(event) => setMaxPages(event.target.value)} value={maxPages}>
              {CRAWL_DEPTH_TIERS.map((tier) => (
                <option key={tier.id} value={tier.pages}>
                  {tier.label} - {tier.pages} pages
                </option>
              ))}
            </select>
            <p className="field-note">Up to {formatCount(SELF_SERVE_MAX_CRAWL_PAGES)} pages per audit.</p>
          </div>
        </div>
        <details className="advanced-inputs">
          <summary>More options</summary>
          <label htmlFor="rendered-crawl-target">Very large sites (early access)</label>
          <select
            id="rendered-crawl-target"
            onChange={(event) => setRenderedCrawlTarget(event.target.value)}
            value={renderedCrawlTarget}
          >
            <option value="0">Off</option>
            {RENDERED_CRAWL_TARGETS.slice(1).map((tier) => (
              <option key={tier.id} value={tier.pages}>
                {tier.label} - {formatCount(tier.pages)} pages
              </option>
            ))}
          </select>
          <p className="field-note">
            Large sites are audited in batches in the background over days to weeks. Results say clearly how much has
            been covered so far.
          </p>
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
        </details>
      </form>
      <div className="audit-stage" aria-live="polite">
        {auditStatus === "loading" && <LoadingAuditState message={auditMessage} />}
        {auditStatus === "error" && <ErrorAuditState message={auditMessage} />}
      </div>
    </>
  );

  return shell(
    <Overview accountData={accountData} auditPanel={auditPanel} message={accountMessage} status={accountStatus} />
  );
}
