import { Link } from "react-router";
import StatusMessage from "../../StatusMessage.jsx";
import { PageHeader } from "../../components/AppShell.jsx";
import { Metric } from "../../components/Metric.jsx";
import { copyText } from "../../lib/browser.js";
import { hostKey, formatDate, safeHostnameLabel, safeUrlLabel } from "../../lib/format.js";
import {
  repairStatusLabel,
  repairActionModeLabel,
  statusLabel,
  auditJobDetail,
  auditScheduleDetail
} from "../../lib/labels.js";

// Overview: first-run checklist until the account is set up, the new-audit
// form, and (once there are reports) headline numbers and the repair feed.
export function Overview({ accountData, auditPanel, message, status }) {
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
      done: verifiedCount > 0,
      title: "Add and verify your site",
      detail: "Prove you own it with a DNS record or a small file. Until then you can check your homepage.",
      to: "/beta/sites",
      cta: "Add site"
    },
    {
      done: reports.length > 0,
      title: "Run your first audit",
      detail: "Start with your homepage, pricing page, or best-selling product page.",
      to: "#new-audit",
      cta: "Start audit"
    },
    {
      done: Number(metrics.repairItems || 0) > 0,
      title: "Review your fixes",
      detail: "Open a report to see each proven problem with its evidence and fix.",
      to: reports[0]?.reportPath || "/beta/reports",
      cta: "Open report"
    },
    {
      done: monitorCount > 0,
      title: "Turn on weekly monitoring",
      detail: "We rerun the audit every week and flag anything that breaks again.",
      to: "/beta/sites",
      cta: "Set up"
    }
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const currentStep = steps.find((step) => !step.done);
  const loading = status === "loading" && !accountData;

  return (
    <div className="app-page">
      <PageHeader title="Overview" description="Find what is broken on your site, fix it, and prove it worked." />
      {message && status === "error" && <StatusMessage tone={status}>{message}</StatusMessage>}
      {!loading && doneCount < steps.length && (
        <section className="app-card onboarding" aria-labelledby="onboarding-title">
          <div className="app-card-head">
            <h2 id="onboarding-title">Get set up</h2>
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
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
                {step.done ? (
                  <span className="onboarding-done">Done</span>
                ) : step !== currentStep ? (
                  <span />
                ) : step.to.startsWith("#") ? (
                  <a className="app-button" href={step.to}>
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
              label="Weekly monitors"
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

function ReportRows({ reports }) {
  if (!reports.length) {
    return <p className="app-empty">Your reports will show up here after your first audit.</p>;
  }
  return (
    <div className="app-table" role="table" aria-label="Reports">
      <div className="app-table-row app-table-headrow" role="row">
        <span role="columnheader">Site</span>
        <span role="columnheader">Score</span>
        <span role="columnheader">Date</span>
      </div>
      {reports.map((item) => (
        <Link discover="none" className="app-table-row" role="row" to={item.reportPath} key={item.id}>
          <span role="cell" className="app-table-primary">
            {item.targetHost || safeHostnameLabel(item.url)}
          </span>
          <span role="cell">
            <ScoreBadge score={item.score} />
          </span>
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
  if (!Number.isFinite(value)) return <span className="score-badge">–</span>;
  const tone = value >= 90 ? "good" : value >= 70 ? "ok" : "bad";
  return <span className={`score-badge ${tone}`}>{value}</span>;
}

// Reports: audits that are still running, every saved report, and Fix Pack
// status.
export function ReportsPage({ accountData, message, status }) {
  const reports = accountData?.recentReports || [];
  const auditJobs = (accountData?.recentAuditJobs || []).filter((job) => !job.reportPath);
  const fixRequests = accountData?.fixRequests || [];
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
      {message && status === "error" && <StatusMessage tone={status}>{message}</StatusMessage>}
      {Boolean(auditJobs.length) && (
        <section className="app-card" aria-labelledby="running-title">
          <div className="app-card-head">
            <h2 id="running-title">In progress</h2>
          </div>
          <div className="audit-job-list">
            {auditJobs.slice(0, 5).map((job) => (
              <article className={`audit-job-card ${job.status}`} key={job.id}>
                <div>
                  <span className="status-pill">{statusLabel(job.status)}</span>
                  <h3>{job.targetHost || safeHostnameLabel(job.targetUrl)}</h3>
                  <p>{auditJobDetail(job)}</p>
                </div>
                <span className="quiet-note">{job.status === "failed" ? "Needs rerun" : "Working"}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="app-card" aria-labelledby="all-reports-title">
        <div className="app-card-head">
          <h2 id="all-reports-title">Saved reports</h2>
        </div>
        <ReportRows reports={reports} />
      </section>
      <section className="app-card" aria-labelledby="fix-packs-title">
        <div className="app-card-head">
          <h2 id="fix-packs-title">Fix Packs</h2>
          <Link discover="none" className="app-card-link" to="/beta/billing">
            Billing
          </Link>
        </div>
        {fixRequests.length ? (
          <div className="app-table" role="table" aria-label="Fix Packs">
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
          <p className="app-empty">No Fix Packs yet. You can start one from any report that finds real problems.</p>
        )}
      </section>
    </div>
  );
}

// Sites & monitoring: add a site, verify ownership, and turn weekly
// monitoring on or off.
export function SitesPage({
  accountData,
  message,
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
  return (
    <div className="app-page">
      <PageHeader
        title="Sites & monitoring"
        description="Verify the sites you own to unlock full audits and weekly monitoring."
      />
      {message && status === "error" && <StatusMessage tone={status}>{message}</StatusMessage>}
      <section className="app-card" aria-labelledby="add-site-title">
        <div className="app-card-head">
          <h2 id="add-site-title">Add a site</h2>
        </div>
        <p className="app-card-text">
          Enter your domain and we’ll give you a DNS record or a small file to prove you own it.
          {isFounder ? " Founder accounts can audit any site without verifying." : ""}
        </p>
        <form className="site-claim-form" onSubmit={onSiteClaim}>
          <label htmlFor="site-host">Domain</label>
          <div className="audit-row">
            <input
              id="site-host"
              inputMode="url"
              onChange={(event) => onSiteHostChange(event.target.value)}
              placeholder="example.com"
              required
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
          <span className="app-progress-label">
            {schedules.length}/{monitoring.limit || 5} weekly monitors
          </span>
        </div>
        <StatusMessage tone={scheduleStatus}>{scheduleMessage}</StatusMessage>
        {sites.length ? (
          <div className="site-claim-list">
            {sites.map((site) => {
              const monitor = schedules.find(
                (schedule) => hostKey(schedule.targetHost || schedule.targetUrl) === hostKey(site.host)
              );
              return (
                <article className={`site-claim-card ${site.status}`} key={site.id || site.host}>
                  <div>
                    <span className="status-pill">{site.status === "verified" ? "Verified" : "Not verified"}</span>
                    <h3>{site.host}</h3>
                    {site.status === "verified" ? (
                      <p>
                        {monitor
                          ? `Checked ${monitor.cadenceLabel?.toLowerCase() || "weekly"}. ${auditScheduleDetail(monitor)}`
                          : "Weekly monitoring is off."}
                      </p>
                    ) : (
                      <div className="verification-instructions">
                        <p>Add one of these, then select Verify.</p>
                        <span className="verification-label">DNS TXT record</span>
                        <code>
                          {site.dnsName}: {site.dnsValue}
                        </code>
                        <span className="verification-label">Or a file on your site</span>
                        <code>
                          {site.filePath}: {site.fileContents}
                        </code>
                      </div>
                    )}
                  </div>
                  {site.status === "verified" ? (
                    monitor ? (
                      <div className="schedule-actions">
                        {monitor.lastReportPath && (
                          <a className="action-link" href={monitor.lastReportPath}>
                            Latest report
                          </a>
                        )}
                        <button
                          className="action-link secondary"
                          disabled={scheduleStatus === "loading"}
                          onClick={() => onScheduleDelete(monitor.id)}
                          type="button"
                        >
                          Pause monitoring
                        </button>
                      </div>
                    ) : (
                      <button
                        className="action-link"
                        disabled={scheduleStatus === "loading"}
                        onClick={() => onScheduleCreate(`https://${site.host}/`)}
                        type="button"
                      >
                        Monitor weekly
                      </button>
                    )
                  ) : (
                    <button
                      className="action-link"
                      disabled={siteStatus === "loading"}
                      onClick={() => onSiteVerify(site.id)}
                      type="button"
                    >
                      Verify
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="app-empty">No sites yet. Add your first one above.</p>
        )}
        <p className="app-footnote">
          {monitoring.message || "Weekly monitoring is included free for verified sites during the beta."}
        </p>
      </section>
    </div>
  );
}

export function RepairAgentFeed({ items = [], nextAction = null, reports = [] }) {
  const hasReports = reports.length > 0;
  return (
    <section className="repair-agent-panel" aria-label="Repair agent feed">
      <div className="repair-agent-heading">
        <div>
          <h2>{items.length ? "Fixes to work on" : "No fixes waiting"}</h2>
          <p>
            {items.length
              ? "The most important open fixes across your reports."
              : hasReports
                ? "Open a report with proven problems to start working through them."
                : "Run your first audit to see what needs fixing."}
          </p>
        </div>
        {nextAction?.href && items.length > 0 && (
          <a className="app-card-link" href={nextAction.href}>
            Open
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
              <span className="status-pill">{repairStatusLabel(item.status)}</span>
            </div>
            <h4>{item.nextActionLabel || item.title}</h4>
            <p>{item.nextActionDetail || item.proof || item.acceptance}</p>
            <div className="repair-agent-meta">
              <span>{item.targetHost || "Saved report"}</span>
              <span>{repairActionModeLabel(item.actionMode)}</span>
            </div>
          </a>
        ))}
        {!items.length && (
          <div className="repair-agent-empty">
            <strong>{hasReports ? "Nothing to fix right now." : "No reports yet."}</strong>
            <span>
              {hasReports ? "New problems from your next audit will show up here." : "Run an audit to get started."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export function DeveloperApiPanel({
  apiTokenSecret,
  developerData,
  developerMessage,
  developerStatus,
  onApiTokenCreate,
  onApiTokenRevoke,
  onWebhookCreate,
  onWebhookRevoke,
  onWebhookUrlChange,
  webhookSecret,
  webhookUrl
}) {
  const tokens = developerData?.tokens || [];
  const webhooks = developerData?.webhooks || [];
  return (
    <section className="developer-api-panel" aria-label="Developer API">
      <StatusMessage tone={developerStatus}>{developerMessage}</StatusMessage>
      <div className="developer-api-grid">
        <div className="developer-api-column">
          <div className="developer-api-header">
            <div>
              <span>API keys</span>
              <strong>{tokens.length}/5 active</strong>
            </div>
            <button
              className="action-link"
              disabled={developerStatus === "loading"}
              onClick={onApiTokenCreate}
              type="button"
            >
              Create API key
            </button>
          </div>
          {apiTokenSecret && (
            <div className="secret-box">
              <span>Copy this key now. You won’t see it again.</span>
              <code>{apiTokenSecret}</code>
              <button className="text-button accent-text" onClick={() => copyText(apiTokenSecret)} type="button">
                Copy
              </button>
            </div>
          )}
          <div className="developer-api-list">
            {tokens.map((token) => (
              <div className="developer-api-row" key={token.id}>
                <div>
                  <strong>{token.label || "API key"}</strong>
                  <span>
                    {token.tokenPrefix || "hidden"}
                    {token.lastUsedAt ? ` · used ${formatDate(token.lastUsedAt)}` : ""}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={developerStatus === "loading"}
                  onClick={() => onApiTokenRevoke(token.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
            {!tokens.length && <p className="quiet-note">No active API keys.</p>}
          </div>
        </div>
        <div className="developer-api-column">
          <form className="developer-webhook-form" onSubmit={onWebhookCreate}>
            <label htmlFor="webhook-url">Webhook URL</label>
            <div className="audit-row">
              <input
                id="webhook-url"
                inputMode="url"
                onChange={(event) => onWebhookUrlChange(event.target.value)}
                placeholder="https://example.com/seofixkit-webhook"
                required
                type="url"
                value={webhookUrl}
              />
              <button disabled={developerStatus === "loading"} type="submit">
                Add webhook
              </button>
            </div>
          </form>
          {webhookSecret && (
            <div className="secret-box">
              <span>Signing secret. Copy it now; you won’t see it again.</span>
              <code>{webhookSecret}</code>
              <button className="text-button accent-text" onClick={() => copyText(webhookSecret)} type="button">
                Copy
              </button>
            </div>
          )}
          <div className="developer-api-list">
            {webhooks.map((webhook) => (
              <div className="developer-api-row" key={webhook.id}>
                <div>
                  <strong>{safeUrlLabel(webhook.url)}</strong>
                  <span>
                    {(webhook.events || []).join(", ")}
                    {webhook.lastDeliveryStatus ? ` · ${webhook.lastDeliveryStatus}` : ""}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={developerStatus === "loading"}
                  onClick={() => onWebhookRevoke(webhook.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
            {!webhooks.length && <p className="quiet-note">No active webhooks.</p>}
          </div>
        </div>
      </div>
      <div className="api-command-strip">
        <code>POST /v1/audits</code>
        <code>GET /v1/audits/{"{audit_id}"}</code>
        <code>GET /v1/audits/{"{audit_id}"}/issues</code>
        <code>GET /v1/projects</code>
      </div>
    </section>
  );
}
