import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import StatusMessage from "../../StatusMessage.jsx";
import { PageHeader } from "../../components/AppShell.jsx";
import { Badge, EmptyState, LoadError, SkeletonRows } from "../../components/AppStates.jsx";
import { CodeBlock } from "../../components/CodeBlock.jsx";
import { CopyButton } from "../../components/CopyButton.jsx";
import { Metric } from "../../components/Metric.jsx";
import { hostKey, formatDate, safeHostnameLabel } from "../../lib/format.js";
import { queryKeys } from "../../lib/queries.js";
import { fetchEmailPreferences, fetchReportsPage, saveEmailPreferences } from "../../lib/requests.js";
import { repairStatusLabel, statusLabel, auditJobDetail, auditScheduleDetail } from "../../lib/labels.js";

// Overview: first-run checklist until the account is set up, the new-audit
// form, and (once there are reports) headline numbers and the repair feed.
export function Overview({ accountData, auditPanel, message, status, onRetry }) {
  const metrics = accountData?.metrics || {};
  const reports = accountData?.recentReports || [];
  const nextActions = accountData?.nextActions || [];
  const primaryAction = nextActions[0] || null;
  const repairAgent = accountData?.repairAgent || {};
  const repairCounts = repairAgent.counts || {};
  const repairItems = repairAgent.nextItems || [];
  const sites = accountData?.sites || [];
  const schedules = accountData?.schedules || [];
  const verifiedCount = metrics.verifiedSites || sites.filter((site) => site.status === "verified").length;
  const monitorCount = metrics.monitors || schedules.length;
  const steps = [
    {
      done: reports.length > 0,
      title: "Run your first audit",
      detail: "Start with your homepage, pricing page or best-selling product page.",
      to: "#new-audit",
      cta: "Run audit"
    },
    {
      done: Number(metrics.repairItems || 0) > 0,
      title: "Review your fixes",
      detail: "Open a report to see each problem, its evidence and the fix.",
      to: reports[0]?.reportPath || "/beta/reports",
      cta: "Open report"
    },
    {
      done: verifiedCount > 0,
      title: "Add and verify your site",
      detail: "Add a DNS record or a small file to show you own it. Until then you can audit your homepage.",
      to: "/beta/sites",
      cta: "Add site"
    },
    {
      done: monitorCount > 0,
      title: "Turn on weekly checks",
      detail: "We rerun the audit every week and show what’s fixed, still open or new.",
      to: "/beta/sites",
      cta: "Turn on"
    }
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const currentStep = steps.find((step) => !step.done);
  const loaded = Boolean(accountData);

  return (
    <div className="app-page">
      <PageHeader title="Overview" description="Run an audit, fix what it finds, then rerun to confirm." />
      {!loaded && status === "loading" && (
        <section className="app-card" aria-label="Loading your dashboard">
          <SkeletonRows rows={4} label="Loading your dashboard" />
        </section>
      )}
      {status === "error" && <LoadError message={message} onRetry={onRetry} />}
      {loaded && doneCount < steps.length && (
        <section className="app-card onboarding" aria-labelledby="onboarding-title">
          <div className="app-card-head">
            <h2 id="onboarding-title">Set up your account</h2>
            <span className="app-progress-label">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <div className="app-progress" aria-hidden="true">
            <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="onboarding-list">
            {steps.map((step) => (
              <li className={step.done ? "done" : ""} key={step.title}>
                <span className="onboarding-check" aria-hidden="true">
                  {step.done ? "✓" : ""}
                </span>
                <div>
                  <strong>
                    {step.title}
                    {step.done && <span className="visually-hidden"> (done)</span>}
                  </strong>
                  <p>{step.detail}</p>
                </div>
                {step.done ? (
                  <span className="onboarding-done">Done</span>
                ) : step !== currentStep ? (
                  <span />
                ) : step.to.startsWith("#") ? (
                  <a
                    className="app-button"
                    href={step.to}
                    onClick={(event) => {
                      const input = document.getElementById("audit-url");
                      if (!input) return;
                      event.preventDefault();
                      document.querySelector(step.to)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      input.focus({ preventScroll: true });
                    }}
                  >
                    {step.cta}
                  </a>
                ) : (
                  <Link discover="none" className="app-button" to={step.to}>
                    {step.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="app-card" id="new-audit" aria-labelledby="new-audit-title">
        <div className="app-card-head">
          <h2 id="new-audit-title">New audit</h2>
        </div>
        {auditPanel}
      </section>
      {reports.length > 0 && (
        <>
          <section className="app-stats" aria-label="Account summary">
            <Metric label="Reports" value={metrics.reports || reports.length} />
            <Metric label="Open fixes" value={metrics.openRepairs || repairCounts.active || 0} />
            <Metric label="Verified sites" value={verifiedCount} />
            <Metric
              label="Weekly checks"
              value={`${monitorCount}/${metrics.monitorLimit || accountData?.monitoring?.limit || 5}`}
            />
          </section>
          <RepairAgentFeed items={repairItems} nextAction={primaryAction} reports={reports} />
          <section className="app-card" aria-labelledby="recent-reports-title">
            <div className="app-card-head">
              <h2 id="recent-reports-title">Recent reports</h2>
              <Link discover="none" className="app-card-link" to="/beta/reports">
                View all
              </Link>
            </div>
            <ReportRows reports={reports.slice(0, 5)} />
          </section>
        </>
      )}
    </div>
  );
}

// "example.com" for a homepage, "example.com/pricing" for any other page, so
// two reports on one site can be told apart.
function reportLabel(item) {
  try {
    const url = new URL(item.url);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return item.targetHost || safeHostnameLabel(item.url) || "Report";
  }
}

function ReportRows({ reports, detailed = false }) {
  if (!reports.length) {
    return <EmptyState icon="file">No reports yet. Run your first audit to see problems here.</EmptyState>;
  }
  const rowClass = detailed ? "app-table-row app-table-row-reports" : "app-table-row";
  return (
    <div className="app-table" role="table" aria-label="Reports">
      <div className={`${rowClass} app-table-headrow`} role="row">
        <span role="columnheader">Page</span>
        <span role="columnheader">Score</span>
        {detailed && <span role="columnheader">Pages</span>}
        {detailed && <span role="columnheader">Problems</span>}
        <span role="columnheader">Date</span>
      </div>
      {reports.map((item) => (
        <Link discover="none" className={rowClass} role="row" to={item.reportPath} key={item.id}>
          <span role="cell" className="app-table-primary">
            {reportLabel(item)}
          </span>
          <span role="cell">
            <ScoreBadge score={item.score} />
          </span>
          {detailed && (
            <span role="cell" className="app-table-num">
              {Number(item.pagesScanned || 0).toLocaleString("en-US")}
            </span>
          )}
          {detailed && (
            <span role="cell" className="app-table-num">
              {Number(item.totalFindings || 0).toLocaleString("en-US")}
            </span>
          )}
          <span role="cell" className="app-table-muted">
            {formatDate(item.createdAt || item.savedAt || item.generatedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ScoreBadge({ score }) {
  const value = Number(score);
  if (score === null || score === undefined || score === "" || !Number.isFinite(value)) {
    return <span className="score-badge">–</span>;
  }
  const tone = value >= 90 ? "good" : value >= 70 ? "ok" : "bad";
  return <span className={`score-badge ${tone}`}>{value}</span>;
}

const JOB_TONES = { queued: "neutral", running: "info", failed: "bad", completed: "good" };

// Reports: audits that are still running, every saved report, and Fix Pack
// status.
export function ReportsPage({ accountData, message, status, onRetry }) {
  // The account summary only carries the newest few; this lists every report.
  const reportPages = useInfiniteQuery({
    queryKey: queryKeys.reports,
    queryFn: ({ pageParam }) => fetchReportsPage(pageParam),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });
  const reports = reportPages.data
    ? reportPages.data.pages.flatMap((page) => page.reports || [])
    : accountData?.recentReports || [];
  const auditJobs = (accountData?.recentAuditJobs || []).filter((job) => !job.reportPath);
  const fixRequests = accountData?.fixRequests || [];
  const loaded = Boolean(accountData);
  const reportsFailed = reportPages.isError && status !== "error";
  return (
    <div className="app-page">
      <PageHeader
        title="Reports"
        description="Every audit you run is saved here for 30 days."
        actions={
          <Link discover="none" className="app-button" to="/beta#new-audit">
            New audit
          </Link>
        }
      />
      {status === "error" && <LoadError message={message} onRetry={onRetry} />}
      {Boolean(auditJobs.length) && (
        <section className="app-card" aria-labelledby="running-title">
          <div className="app-card-head">
            <h2 id="running-title">In progress</h2>
          </div>
          <div className="app-table" role="table" aria-label="Audits in progress">
            {auditJobs.slice(0, 5).map((job) => (
              <div className="app-table-row app-table-row-job" role="row" key={job.id}>
                <span role="cell" className="app-table-primary">
                  {job.targetHost || safeHostnameLabel(job.targetUrl)}
                </span>
                <span role="cell" className="app-table-muted">
                  {auditJobDetail(job)}
                </span>
                <span role="cell">
                  <Badge tone={JOB_TONES[job.status] || "neutral"}>{statusLabel(job.status)}</Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {(loaded || status !== "error") && (
        <section className="app-card" aria-labelledby="all-reports-title">
          <div className="app-card-head">
            <h2 id="all-reports-title">Saved reports</h2>
          </div>
          {reportsFailed && (
            <LoadError
              message="The full list didn’t load, so only your newest reports are showing."
              onRetry={() => reportPages.refetch()}
            />
          )}
          {loaded ? <ReportRows detailed reports={reports} /> : <SkeletonRows label="Loading reports" />}
          {reportPages.hasNextPage && (
            <button
              className="app-button-secondary app-load-more"
              disabled={reportPages.isFetchingNextPage}
              onClick={() => reportPages.fetchNextPage()}
              type="button"
            >
              {reportPages.isFetchingNextPage ? "Loading…" : "Show older reports"}
            </button>
          )}
        </section>
      )}
      {loaded && (
        <section className="app-card" aria-labelledby="fix-packs-title">
          <div className="app-card-head">
            <h2 id="fix-packs-title">Fix Packs</h2>
            <Link discover="none" className="app-card-link" to="/beta/billing">
              Billing
            </Link>
          </div>
          {fixRequests.length ? (
            <div className="app-table" role="table" aria-label="Fix Packs">
              <div className="app-table-row app-table-headrow" role="row">
                <span role="columnheader">Site</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Updated</span>
              </div>
              {fixRequests.map((request) => (
                <Link
                  discover="none"
                  className="app-table-row"
                  role="row"
                  to={request.reportPath || "/beta/billing"}
                  key={request.id}
                >
                  <span role="cell" className="app-table-primary">
                    {request.targetHost || request.targetUrl || "Fix Pack"}
                  </span>
                  <span role="cell">{request.statusLabel || statusLabel(request.status)}</span>
                  <span role="cell" className="app-table-muted">
                    {formatDate(request.updatedAt || request.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="wrench">
              No Fix Packs yet. You can buy one from the Problems tab of any report.
            </EmptyState>
          )}
        </section>
      )}
    </div>
  );
}

// Sites & monitoring: add a site, verify ownership, and turn weekly
// monitoring on or off.
export function SitesPage({
  accountData,
  message,
  onRetry,
  onScheduleCreate,
  onScheduleDelete,
  onSiteClaim,
  onSiteHostChange,
  onSiteVerify,
  scheduleMessage,
  scheduleStatus,
  siteHost,
  siteMessage,
  siteStatus,
  status
}) {
  const sites = accountData?.sites || [];
  const schedules = accountData?.schedules || [];
  const monitoring = accountData?.monitoring || {};
  const isFounder = accountData?.owner?.accessMode === "founder-override";
  const loaded = Boolean(accountData);
  return (
    <div className="app-page">
      <PageHeader
        title="Sites & monitoring"
        description="Verify a site you own to audit all its pages and turn on weekly checks."
      />
      {status === "error" && <LoadError message={message} onRetry={onRetry} />}
      <section className="app-card" aria-labelledby="add-site-title">
        <div className="app-card-head">
          <h2 id="add-site-title">Add a site</h2>
        </div>
        <p className="app-card-text">
          Enter your domain. We’ll give you a DNS record or a small file that shows you own it.
          {isFounder ? " Founder accounts can audit any site without verifying." : ""}
        </p>
        <form className="site-claim-form" onSubmit={onSiteClaim}>
          <label htmlFor="site-host">Domain</label>
          <div className="audit-row">
            <input
              autoCapitalize="none"
              autoComplete="off"
              id="site-host"
              inputMode="url"
              onChange={(event) => onSiteHostChange(event.target.value)}
              placeholder="example.com"
              required
              spellCheck={false}
              type="text"
              value={siteHost}
            />
            <button disabled={siteStatus === "loading"} type="submit">
              {siteStatus === "loading" ? "Adding…" : "Add site"}
            </button>
          </div>
          <StatusMessage tone={siteStatus}>{siteMessage}</StatusMessage>
        </form>
      </section>
      <section className="app-card" aria-labelledby="your-sites-title">
        <div className="app-card-head">
          <h2 id="your-sites-title">Your sites</h2>
          {loaded && (
            <span className="app-progress-label">
              {schedules.length} of {monitoring.limit || 5} weekly checks used
            </span>
          )}
        </div>
        <StatusMessage tone={scheduleStatus}>{scheduleMessage}</StatusMessage>
        {!loaded ? (
          status === "error" ? (
            <p className="app-empty">Your sites will show here once this page loads.</p>
          ) : (
            <SkeletonRows rows={2} label="Loading your sites" />
          )
        ) : sites.length ? (
          <ul className="site-list">
            {sites.map((site) => {
              const monitor = schedules.find(
                (schedule) => hostKey(schedule.targetHost || schedule.targetUrl) === hostKey(site.host)
              );
              const verified = site.status === "verified";
              return (
                <li className="site-row" key={site.id || site.host}>
                  <div className="site-row-main">
                    <div className="site-row-title">
                      <h3>{site.host}</h3>
                      <Badge tone={verified ? "good" : "warn"}>{verified ? "Verified" : "Not verified"}</Badge>
                    </div>
                    <p>
                      {verified
                        ? monitor
                          ? `Checked ${monitor.cadenceLabel?.toLowerCase() || "weekly"}. ${auditScheduleDetail(monitor)}`
                          : "Weekly checks are off."
                        : "Add one of these to your site, then click Verify. DNS changes can take a few minutes to show up."}
                    </p>
                  </div>
                  <div className="site-row-actions">
                    {verified ? (
                      monitor ? (
                        <>
                          {monitor.lastReportPath && (
                            <Link discover="none" className="app-button-secondary" to={monitor.lastReportPath}>
                              Latest report
                            </Link>
                          )}
                          <button
                            className="app-button-secondary"
                            disabled={scheduleStatus === "loading"}
                            onClick={() => onScheduleDelete(monitor.id)}
                            type="button"
                          >
                            Pause weekly checks
                          </button>
                        </>
                      ) : (
                        <button
                          className="app-button"
                          disabled={scheduleStatus === "loading"}
                          onClick={() => onScheduleCreate(`https://${site.host}/`)}
                          type="button"
                        >
                          Turn on weekly checks
                        </button>
                      )
                    ) : (
                      <button
                        className="app-button"
                        disabled={siteStatus === "loading"}
                        onClick={() => onSiteVerify(site.id)}
                        type="button"
                      >
                        Verify
                      </button>
                    )}
                  </div>
                  {!verified && (
                    <dl className="verification-records">
                      <VerificationRecord
                        title="Option 1: DNS TXT record"
                        fields={[
                          ["Name", site.dnsName],
                          ["Value", site.dnsValue]
                        ]}
                      />
                      <VerificationRecord
                        title="Option 2: File on your site"
                        fields={[
                          ["Path", site.filePath || site.fileUrl],
                          ["Contents", site.fileContents]
                        ]}
                      />
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="browser">No sites yet. Add your first one above.</EmptyState>
        )}
        <p className="app-footnote">
          {monitoring.message || "Weekly checks are free for verified sites during the beta."}
        </p>
      </section>
    </div>
  );
}

function VerificationRecord({ title, fields }) {
  return (
    <div className="verification-record">
      <dt>{title}</dt>
      {fields.map(([label, value]) => (
        <dd key={label}>
          <span className="verification-field-label">{label}</span>
          <code>{value}</code>
          <CopyButton className="text-button accent-text" label={`Copy ${label.toLowerCase()}`} value={value} />
        </dd>
      ))}
    </div>
  );
}

export function RepairAgentFeed({ items = [], nextAction = null, reports = [] }) {
  const hasReports = reports.length > 0;
  return (
    <section className="repair-agent-panel" aria-label="Fixes to work on">
      <div className="repair-agent-heading">
        <div>
          <h2>{items.length ? "Fixes to work on" : "No fixes waiting"}</h2>
          <p>
            {items.length
              ? "The highest-priority open fixes across your reports."
              : hasReports
                ? "Open a report to start working through its problems."
                : "Run your first audit to see what needs fixing."}
          </p>
        </div>
        {nextAction?.href && items.length > 0 && (
          <a className="app-card-link" href={nextAction.href}>
            Open report
          </a>
        )}
      </div>
      <div className="repair-agent-list">
        {items.slice(0, 4).map((item) => (
          <a
            className={`repair-agent-card ${item.status || "open"}`}
            href={item.reportPath || nextAction?.href || "/beta"}
            key={item.id}
          >
            <div className="repair-agent-card-head">
              <span className={`status-pill ${item.severity || "notice"}`}>{item.severity || "notice"}</span>
              {item.status && item.status !== "open" && (
                <span className="status-pill">{repairStatusLabel(item.status)}</span>
              )}
            </div>
            <h4>{item.title || item.nextActionLabel}</h4>
            <p>{item.nextActionId === "start-proof-repair" ? item.proof || item.acceptance : item.nextActionDetail}</p>
            <div className="repair-agent-meta">
              <span>{item.targetHost || "Saved report"}</span>
              <span className="repair-agent-cta">
                {item.nextActionLabel || "Open"}
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </a>
        ))}
        {!items.length && (
          <div className="repair-agent-empty">
            <strong>{hasReports ? "Nothing to fix right now." : "No reports yet."}</strong>
            <span>
              {hasReports
                ? "New problems from your next audit will show up here."
                : "Run an audit to see problems here."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// A destructive button that asks "Are you sure?" in place before it acts.
function ConfirmButton({ label, confirmLabel, onConfirm, disabled }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className="text-button" disabled={disabled} onClick={() => setAsking(true)} type="button">
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-inline">
      <button
        className="text-button danger-text"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        type="button"
      >
        {confirmLabel}
      </button>
      <button className="text-button" onClick={() => setAsking(false)} type="button">
        Cancel
      </button>
    </span>
  );
}

function SecretBox({ title, value }) {
  return (
    <div className="secret-box" role="status">
      <span>{title}</span>
      <code>{value}</code>
      <CopyButton className="app-button-secondary" value={value} />
    </div>
  );
}

const API_KEY_LIMIT = 5;

// Audit emails: "report ready" and each weekly check result. On by default;
// every email also carries a one-click unsubscribe link.
function EmailUpdatesCard() {
  const queryClient = useQueryClient();
  const preferences = useQuery({ queryKey: queryKeys.emailPreferences, queryFn: fetchEmailPreferences });
  const save = useMutation({
    mutationFn: saveEmailPreferences,
    onSuccess: (data) => queryClient.setQueryData(queryKeys.emailPreferences, data)
  });
  const enabled = save.isPending ? save.variables : Boolean(preferences.data?.auditEmails);
  return (
    <section className="app-card email-updates" aria-labelledby="email-updates-title">
      <div className="app-card-head">
        <div>
          <h2 id="email-updates-title">Email updates</h2>
          <p className="app-card-subtle">
            Get an email when an audit finishes, and after each weekly check with what you fixed, what’s new and what to
            fix next.
          </p>
        </div>
        {preferences.isSuccess && (
          <button
            aria-checked={enabled}
            aria-labelledby="email-updates-title"
            className={`app-switch${enabled ? " on" : ""}`}
            disabled={save.isPending}
            onClick={() => save.mutate(!enabled)}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        )}
      </div>
      {preferences.isPending && <SkeletonRows rows={1} label="Loading email settings" />}
      {preferences.isError && <LoadError message={preferences.error.message} onRetry={() => preferences.refetch()} />}
      {save.isError && <StatusMessage tone="error">{save.error.message}</StatusMessage>}
    </section>
  );
}

export function DeveloperApiPanel({
  apiTokenSecret,
  developerData,
  developerMessage,
  developerStatus,
  loadError = "",
  loading = false,
  onApiTokenCreate,
  onApiTokenRevoke,
  onRetry,
  onWebhookCreate,
  onWebhookRevoke,
  onWebhookUrlChange,
  webhookSecret,
  webhookUrl
}) {
  const tokens = developerData?.tokens || [];
  const webhooks = developerData?.webhooks || [];
  const busy = developerStatus === "loading";
  const origin = typeof window === "undefined" ? "https://seofixkit.com" : window.location.origin;
  const quickStart = [
    `curl -X POST ${origin}/v1/audits \\`,
    `  -H "Authorization: Bearer YOUR_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"url": "https://example.com/"}'`
  ].join("\n");

  if (loadError && !developerData) {
    return <LoadError message={loadError} onRetry={onRetry} />;
  }

  return (
    <>
      {loadError && <LoadError message={loadError} onRetry={onRetry} />}
      <StatusMessage tone={developerStatus}>{developerMessage}</StatusMessage>
      <EmailUpdatesCard />
      <section className="app-card" aria-labelledby="api-keys-title">
        <div className="app-card-head">
          <div>
            <h2 id="api-keys-title">API keys</h2>
            <p className="app-card-subtle">Run audits and read results from your own code.</p>
          </div>
          <div className="app-card-actions">
            {!loading && (
              <span className="app-progress-label">
                {tokens.length} of {API_KEY_LIMIT} used
              </span>
            )}
            <button
              className="app-button"
              disabled={busy || loading || tokens.length >= API_KEY_LIMIT}
              onClick={onApiTokenCreate}
              type="button"
            >
              Create API key
            </button>
          </div>
        </div>
        {apiTokenSecret && (
          <SecretBox title="Copy this key now. You won’t be able to see it again." value={apiTokenSecret} />
        )}
        {loading ? (
          <SkeletonRows rows={2} label="Loading API keys" />
        ) : tokens.length ? (
          <div className="app-table" role="table" aria-label="API keys">
            <div className="app-table-row app-table-headrow app-table-row-keys" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Key</span>
              <span role="columnheader">Last used</span>
              <span role="columnheader">
                <span className="visually-hidden">Actions</span>
              </span>
            </div>
            {tokens.map((token) => (
              <div className="app-table-row app-table-row-keys" role="row" key={token.id}>
                <span role="cell" className="app-table-primary">
                  {token.label || "API key"}
                </span>
                <span role="cell">
                  <code className="app-code">{token.tokenPrefix ? `${token.tokenPrefix}…` : "hidden"}</code>
                </span>
                <span role="cell" className="app-table-muted">
                  {token.lastUsedAt ? formatDate(token.lastUsedAt) : "Never"}
                </span>
                <span role="cell" className="app-table-action">
                  <ConfirmButton
                    confirmLabel="Revoke key"
                    disabled={busy}
                    label="Revoke"
                    onConfirm={() => onApiTokenRevoke(token.id)}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="lock">No API keys yet. Create one to run audits from your own code.</EmptyState>
        )}
      </section>

      <section className="app-card" aria-labelledby="webhooks-title">
        <div className="app-card-head">
          <div>
            <h2 id="webhooks-title">Alerts and webhooks</h2>
            <p className="app-card-subtle">
              Paste a Slack incoming webhook URL to get a message in a channel when an audit finishes, a rerun confirms
              a fix, or a fixed problem comes back. Any other HTTPS URL gets a signed JSON request instead.
            </p>
          </div>
        </div>
        <form className="developer-webhook-form" onSubmit={onWebhookCreate}>
          <label htmlFor="webhook-url">Slack webhook or endpoint URL</label>
          <div className="audit-row">
            <input
              autoCapitalize="none"
              autoComplete="off"
              id="webhook-url"
              inputMode="url"
              onChange={(event) => onWebhookUrlChange(event.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              required
              spellCheck={false}
              type="url"
              value={webhookUrl}
            />
            <button disabled={busy || loading} type="submit">
              Add
            </button>
          </div>
        </form>
        {webhookSecret && (
          <SecretBox title="Signing secret. Copy it now. You won’t be able to see it again." value={webhookSecret} />
        )}
        {loading ? (
          <SkeletonRows rows={1} label="Loading webhooks" />
        ) : webhooks.length ? (
          <div className="app-table" role="table" aria-label="Webhook endpoints">
            {webhooks.map((webhook) => (
              <div className="app-table-row app-table-row-hooks" role="row" key={webhook.id}>
                <span role="cell" className="app-table-primary">
                  {webhook.kind === "slack" ? "Slack channel" : webhook.url}
                </span>
                <span role="cell" className="app-table-muted">
                  {(webhook.events || []).join(", ")}
                  {webhook.lastDeliveryStatus ? ` · last delivery: ${webhook.lastDeliveryStatus}` : ""}
                </span>
                <span role="cell" className="app-table-action">
                  <ConfirmButton
                    confirmLabel="Remove endpoint"
                    disabled={busy}
                    label="Remove"
                    onConfirm={() => onWebhookRevoke(webhook.id)}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="plug">No alerts yet. Add a Slack webhook URL above to get alerts in a channel.</EmptyState>
        )}
      </section>

      <section className="app-card" aria-labelledby="quick-start-title">
        <div className="app-card-head">
          <h2 id="quick-start-title">Quick start</h2>
        </div>
        <p className="app-card-text">
          Run an audit with your API key. The response includes an audit ID you can check for status.
        </p>
        <CodeBlock code={quickStart} />
        <ul className="api-endpoints" aria-label="Main endpoints">
          <li>
            <code>POST /v1/audits</code>
            <span>Run an audit</span>
          </li>
          <li>
            <code>GET /v1/audits/{"{audit_id}"}</code>
            <span>Check status and score</span>
          </li>
          <li>
            <code>GET /v1/audits/{"{audit_id}"}/issues</code>
            <span>List the problems found</span>
          </li>
          <li>
            <code>GET /v1/projects</code>
            <span>List your projects</span>
          </li>
        </ul>
      </section>
    </>
  );
}
