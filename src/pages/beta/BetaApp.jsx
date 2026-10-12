import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "../../lib/queries.js";
import { formatCount, safeHostnameLabel } from "../../lib/format.js";
import {
  fetchSession,
  postAccessRequest,
  verifyAccessToken,
  fetchAccountSummary,
  fetchDeveloperSummary,
  postSiteClaim,
  postSiteVerify,
  postAuditSchedule,
  pauseAuditSchedule,
  postDeveloperToken,
  deleteDeveloperToken,
  postDeveloperWebhook,
  deleteDeveloperWebhook,
  fetchReport,
  pollAuditJob,
  loadAdmin
} from "../../lib/requests.js";
import { AdminDashboard } from "../admin/AdminDashboard.jsx";
import { DeveloperApiPanel, Overview, ReportsPage, SitesPage } from "./CustomerDashboard.jsx";
import { SignIn } from "./SignIn.jsx";
import { BillingPortal } from "../billing/BillingPortal.jsx";
import { ReportView } from "../report/ReportView.jsx";

const SECTION_TITLES = {
  overview: "Overview",
  reports: "Reports",
  sites: "Sites & monitoring",
  developers: "Developers",
  billing: "Billing",
  admin: "Ops"
};

// A sign-out's cookie-clearing response must land before any new sign-in
// sets a fresh session cookie, so sign-ins wait for it.
let pendingSignOut = Promise.resolve();

// Query keys that are not private account data and survive a user switch.
const SESSION_QUERY_ROOTS = new Set(["session", "access-token"]);

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
  const hasInviteParam = inviteParams.has("invite");
  const queryClient = useQueryClient();
  const [loginEmail, setLoginEmail] = useState(() => inviteParams.get("email") || storageGet(BETA_EMAIL_KEY) || "");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") || "");
  const [loginStatus, setLoginStatus] = useState("idle");
  const [loginMessage, setLoginMessage] = useState("");

  // Session: undefined until checked, null when signed out, else the owner.
  // The server is always asked; until it answers, the stored hint decides
  // whether to show the workspace optimistically.
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => {
      const next = await fetchSession();
      const previous = queryClient.getQueryData(queryKeys.session);
      if (!next || (previous && previous.ownerEmail !== next.ownerEmail)) clearPrivateData();
      return next;
    },
    enabled: !accessToken,
    staleTime: 5 * 60_000
  });
  const session = sessionQuery.data;
  const isAuthed = session === undefined ? storageGet(BETA_SESSION_KEY) === "1" : Boolean(session);
  const ownerEmail =
    session === undefined ? inviteParams.get("email") || storageGet(BETA_EMAIL_KEY) || "" : session?.ownerEmail || "";

  // Drop every cached account query so one owner's data never shows to the next.
  function clearPrivateData() {
    queryClient.removeQueries({ predicate: (query) => !SESSION_QUERY_ROOTS.has(query.queryKey[0]) });
  }

  function setSignedIn(email) {
    clearPrivateData();
    storageSet(BETA_SESSION_KEY, "1");
    storageSet(BETA_EMAIL_KEY, email);
    queryClient.setQueryData(queryKeys.session, { ownerEmail: email });
  }

  function markSignedOut() {
    clearPrivateData();
    storageRemove(BETA_SESSION_KEY);
    storageRemove(BETA_EMAIL_KEY);
    queryClient.setQueryData(queryKeys.session, null);
  }

  // One-use sign-in links are verified once per token; the cached result
  // survives remounts so the token is never spent twice.
  const accessQuery = useQuery({
    queryKey: ["access-token", accessToken],
    queryFn: async () => {
      await pendingSignOut;
      const payload = await verifyAccessToken(accessToken, storageGet(FUNNEL_KEY) || "");
      const email = payload.ownerEmail || loginEmail;
      setSignedIn(email);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("access");
      cleanUrl.searchParams.delete("email");
      replaceUrl(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      return { ownerEmail: email };
    },
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity
  });
  const signInStatus =
    loginStatus === "idle" && accessToken && accessQuery.isPending
      ? "submitting"
      : loginStatus === "idle" && accessQuery.isError
        ? "error"
        : loginStatus;
  const signInMessage =
    loginStatus === "idle" && accessToken && accessQuery.isPending
      ? "Signing you in…"
      : loginStatus === "idle" && accessQuery.isError
        ? accessQuery.error?.message || "This sign-in link has expired or was already used. Request a new one below."
        : loginMessage;
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
  const [auditStatus, setAuditStatus] = useState("idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [siteHost, setSiteHost] = useState("");
  const [siteStatus, setSiteStatus] = useState("idle");
  const [siteMessage, setSiteMessage] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("idle");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [developerActionStatus, setDeveloperStatus] = useState("idle");
  const [developerActionMessage, setDeveloperMessage] = useState("");
  const [apiTokenSecret, setApiTokenSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminStatus, setAdminStatus] = useState("idle");
  const [adminMessage, setAdminMessage] = useState("");
  const [accessFormStartedAt] = useState(() => Date.now());

  const reportQuery = useQuery({
    queryKey: queryKeys.report(reportId),
    queryFn: async () => {
      try {
        return await fetchReport(reportId);
      } catch (error) {
        if (error.status === 401) markSignedOut();
        throw error;
      }
    },
    enabled: isAuthed && Boolean(reportId)
  });
  const report = reportQuery.data || null;

  const accountQuery = useQuery({
    queryKey: queryKeys.account,
    queryFn: fetchAccountSummary,
    enabled: isAuthed && !isAdminRoute,
    // Keep the dashboard live while an audit is running.
    refetchInterval: (query) =>
      !reportId && !isBillingRoute && Number(query.state.data?.metrics?.runningAudits || 0) ? 3500 : false
  });
  const accountData = accountQuery.data || null;
  const accountStatus = accountQuery.isError ? "error" : accountQuery.isLoading ? "loading" : "success";
  const accountMessage = accountQuery.isError ? accountQuery.error?.message || "We couldn’t load your workspace." : "";
  const retryAccount = () => accountQuery.refetch();
  const refreshAccount = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.account }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports })
    ]);

  const developerQuery = useQuery({
    queryKey: queryKeys.developer,
    queryFn: fetchDeveloperSummary,
    enabled: isAuthed && !reportId && !isAdminRoute && !isBillingRoute
  });
  const developerData = developerQuery.data || null;
  const developerStatus = developerActionStatus;
  const developerMessage = developerActionMessage;
  const refreshDeveloper = () => queryClient.invalidateQueries({ queryKey: queryKeys.developer });

  const section = sectionFromPath(location.pathname);
  const pageTitle = isAdminRoute
    ? "Ops"
    : !isAuthed
      ? "Sign in"
      : section === "report"
        ? report?.url
          ? `${safeHostnameLabel(report.url)} report`
          : "Report"
        : SECTION_TITLES[section] || "Overview";
  useEffect(() => {
    document.title = `${pageTitle} · SEO Fix Kit`;
  }, [pageTitle]);

  // Drop a consumed ?invite= code from the address bar.
  useEffect(() => {
    if (!hasInviteParam) return;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("invite");
    navigate(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {
      replace: true,
      state: { betaMountKey: mountKey }
    });
  }, [hasInviteParam, navigate, mountKey]);

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
      await pendingSignOut;
      const payload = await apiFetch("/api/beta/login", {
        method: "POST",
        body: { email: loginEmail, inviteCode },
        requireOkFlag: false,
        fallbackError: "That invite code didn’t work."
      });
      setSignedIn(payload.ownerEmail || loginEmail);
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
      await refreshAccount();
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
      await refreshAccount();
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
      await refreshAccount();
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
      await refreshAccount();
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
      await refreshDeveloper();
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
      await refreshDeveloper();
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
      await refreshDeveloper();
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
      await refreshDeveloper();
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
        setAuditStatus("idle");
        setAuditMessage("");
        refreshAccount();
        replaceUrl(job.reportPath || `/beta/reports/${encodeURIComponent(job.reportId)}`);
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
        return;
      }
      if (payload.id) queryClient.setQueryData(queryKeys.report(payload.id), payload);
      setAuditStatus("idle");
      setAuditMessage("");
      refreshAccount();
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
        markSignedOut();
      }
      setAuditStatus("error");
      setAuditMessage(error.message || "The audit failed. Try another URL.");
    }
  }

  function signOut() {
    pendingSignOut = fetch("/api/beta/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    queryClient.clear();
    markSignedOut();
    setLoginEmail("");
    setInviteCode("");
    navigate("/beta", { replace: true });
  }

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

  // No stored hint yet: wait for the server before offering sign-in, so a
  // valid session is never shown the sign-in screen.
  if (!isAuthed && session === undefined && sessionQuery.isFetching) {
    return <div className="app-loading" aria-busy="true" />;
  }

  if (!isAuthed) {
    return (
      <SignIn
        email={loginEmail}
        inviteCode={inviteCode}
        message={signInMessage}
        onCodeSubmit={login}
        onEmailChange={setLoginEmail}
        onInviteCodeChange={setInviteCode}
        onLinkRequest={requestGateAccess}
        returningToReport={Boolean(reportId)}
        status={signInStatus}
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
          {reportQuery.isPending && <LoadingAuditState message="Loading saved report." />}
          {reportQuery.isError && (
            <ErrorAuditState
              hint="It may have expired, or it belongs to a different account."
              message={reportQuery.error?.message || "Could not load report."}
              title="Report unavailable"
            >
              <Link className="app-button-secondary" discover="none" to="/beta/reports">
                Back to reports
              </Link>
            </ErrorAuditState>
          )}
          {report && <ReportView report={report} />}
        </section>
      </div>
    );
  }

  if (section === "reports") {
    return shell(
      <ReportsPage accountData={accountData} message={accountMessage} onRetry={retryAccount} status={accountStatus} />
    );
  }

  if (section === "sites") {
    return shell(
      <SitesPage
        accountData={accountData}
        message={accountMessage}
        onRetry={retryAccount}
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
          loadError={developerQuery.isError ? developerQuery.error?.message || "We couldn’t load your API keys." : ""}
          loading={developerQuery.isLoading}
          onApiTokenCreate={createApiToken}
          onApiTokenRevoke={revokeApiToken}
          onRetry={() => developerQuery.refetch()}
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
    <Overview
      accountData={accountData}
      auditPanel={auditPanel}
      message={accountMessage}
      onRetry={retryAccount}
      status={accountStatus}
    />
  );
}
