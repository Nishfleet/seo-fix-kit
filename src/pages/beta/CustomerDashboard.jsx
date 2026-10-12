import { Link } from "react-router";
import StatusMessage from "../../StatusMessage.jsx";
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

export function CustomerDashboard({
  accountData,
  developerData,
  developerMessage,
  developerStatus,
  apiTokenSecret,
  webhookSecret,
  webhookUrl,
  onApiTokenCreate,
  onApiTokenRevoke,
  message,
  onScheduleCreate,
  onScheduleDelete,
  onSiteClaim,
  onSiteHostChange,
  onSiteVerify,
  onWebhookCreate,
  onWebhookRevoke,
  onWebhookUrlChange,
  scheduleMessage,
  scheduleStatus,
  siteHost,
  siteMessage,
  siteStatus,
  status
}) {
  const metrics = accountData?.metrics || {};
  const reports = accountData?.recentReports || [];
  const auditJobs = accountData?.recentAuditJobs || [];
  const fixRequests = accountData?.fixRequests || [];
  const nextActions = accountData?.nextActions || [];
  const primaryAction = nextActions[0] || null;
  const repairAgent = accountData?.repairAgent || {};
  const repairCounts = repairAgent.counts || {};
  const repairItems = repairAgent.nextItems || [];
  const sites = accountData?.sites || [];
  const schedules = accountData?.schedules || [];
  const monitoring = accountData?.monitoring || {};
  const verifiedSites = sites.filter((site) => site.status === "verified");

  return (
    <section className="account-dashboard" aria-label="Account overview">
      <div className="section-heading">
        <p className="beta-eyebrow">Your workspace</p>
        <h2>{verifiedSites.length ? "Recent proof audits" : "Verify a site first"}</h2>
        {message && status !== "success" && <StatusMessage tone={status}>{message}</StatusMessage>}
      </div>
      <section className="metric-strip account-metrics" aria-label="Account summary">
        <Metric label="Reports" value={metrics.reports || 0} />
        <Metric label="Running" value={metrics.runningAudits || 0} />
        <Metric label="Fix Packs" value={metrics.fixRequests || 0} />
        <Metric label="Verified sites" value={metrics.verifiedSites || verifiedSites.length || 0} />
        <Metric
          label="Monitors"
          value={`${metrics.monitors || schedules.length || 0}/${metrics.monitorLimit || monitoring.limit || 5}`}
        />
        <Metric label="Open repairs" value={metrics.openRepairs || repairCounts.active || 0} />
        <Metric label="Drafts" value={metrics.draftedActions || repairCounts.awaitingApproval || 0} />
        <Metric label="Regressed" value={metrics.regressedRepairs || 0} />
      </section>
      <section className="account-panel monitoring-offer-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Proof Monitoring</p>
          <h3>
            {monitoring.status === "active"
              ? "Monitoring entitlement active"
              : monitoring.checkoutLive
                ? "Paid monitoring checkout available"
                : "Beta monitoring allowance"}
          </h3>
        </div>
        <p>
          {monitoring.message ||
            "Weekly monitoring watches verified sites and reports proof deltas without claiming to fix issues."}
        </p>
      </section>
      <RepairAgentFeed items={repairItems} nextAction={primaryAction} reports={reports} />
      <div className="site-verification-panel">
        <div>
          <p className="beta-eyebrow">Site verification</p>
          <h3>Prove you own the host before self-serve audits run.</h3>
          <p>Founder override can still test manually. Customer sessions need an exact verified host.</p>
        </div>
        <form className="site-claim-form" onSubmit={onSiteClaim}>
          <label htmlFor="site-host">Website host</label>
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
              {siteStatus === "loading" ? "Checking" : "Add site"}
            </button>
          </div>
          <StatusMessage tone={siteStatus}>{siteMessage}</StatusMessage>
        </form>
      </div>
      <StatusMessage tone={scheduleStatus}>{scheduleMessage}</StatusMessage>
      {Boolean(sites.length) && (
        <div className="site-claim-list">
          {sites.map((site) => {
            const monitor = schedules.find(
              (schedule) => hostKey(schedule.targetHost || schedule.targetUrl) === hostKey(site.host)
            );
            return (
              <article className={`site-claim-card ${site.status}`} key={site.id || site.host}>
                <div>
                  <span className="status-pill">{site.status}</span>
                  <h3>{site.host}</h3>
                  {site.status === "verified" ? (
                    <p>
                      {monitor
                        ? `Monitoring ${monitor.cadenceLabel?.toLowerCase() || "weekly"}.`
                        : `Verified by ${site.verificationMethod || "site proof"}.`}
                    </p>
                  ) : (
                    <div className="verification-instructions">
                      <p>Add either proof, then click verify.</p>
                      <code>
                        TXT {site.dnsName}: {site.dnsValue}
                      </code>
                      <code>
                        {site.filePath}: {site.fileContents}
                      </code>
                    </div>
                  )}
                </div>
                {site.status === "verified" ? (
                  monitor ? (
                    <button
                      className="action-link"
                      disabled={scheduleStatus === "loading"}
                      onClick={() => onScheduleDelete(monitor.id)}
                      type="button"
                    >
                      Pause monitor
                    </button>
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
                    Verify now
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {Boolean(schedules.length) && (
        <div className="audit-schedule-list">
          {schedules.map((schedule) => (
            <article className={`audit-schedule-card ${schedule.lastError ? "failed" : "active"}`} key={schedule.id}>
              <div>
                <span className="status-pill">{schedule.cadenceLabel || "Weekly"}</span>
                <h3>{schedule.targetHost || safeHostnameLabel(schedule.targetUrl)}</h3>
                <p>{auditScheduleDetail(schedule)}</p>
                {schedule.lastError && <p className="quiet-note">{schedule.lastError}</p>}
              </div>
              <div className="schedule-actions">
                {schedule.lastReportPath ? (
                  <a className="action-link" href={schedule.lastReportPath}>
                    Latest report
                  </a>
                ) : (
                  <span className="quiet-note">Waiting for first run</span>
                )}
                <button
                  className="action-link"
                  disabled={scheduleStatus === "loading"}
                  onClick={() => onScheduleDelete(schedule.id)}
                  type="button"
                >
                  Pause
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {Boolean(auditJobs.length) && (
        <div className="audit-job-list">
          {auditJobs.slice(0, 5).map((job) => (
            <article className={`audit-job-card ${job.status}`} key={job.id}>
              <div>
                <span className="status-pill">{statusLabel(job.status)}</span>
                <h3>{job.targetHost || safeHostnameLabel(job.targetUrl)}</h3>
                <p>{auditJobDetail(job)}</p>
              </div>
              {job.reportPath ? (
                <Link discover="none" className="action-link" to={job.reportPath}>
                  Open report
                </Link>
              ) : (
                <span className="quiet-note">{job.status === "failed" ? "Needs rerun" : "Working"}</span>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="account-grid">
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Next</p>
            <h3>{primaryAction?.label || "Start with a page that matters"}</h3>
          </div>
          <p>{primaryAction?.detail || "Paste your homepage, pricing page, or highest-value product page."}</p>
          {primaryAction?.href && (
            <a className="action-link" href={primaryAction.href}>
              Open next action
            </a>
          )}
        </div>
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Reports</p>
            <h3>{reports.length ? "Latest scans" : "No reports yet"}</h3>
          </div>
          <div className="account-list">
            {reports.slice(0, 4).map((item) => (
              <Link discover="none" to={item.reportPath} key={item.id}>
                <span>{item.targetHost || safeHostnameLabel(item.url)}</span>
                <strong>{item.score}/100</strong>
              </Link>
            ))}
            {!reports.length && (
              <p className="quiet-note">Your saved reports will appear here after the first audit.</p>
            )}
          </div>
        </div>
        <div className="account-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Repair queue</p>
            <h3>{fixRequests.length ? "Fix Pack status" : "Nothing paid yet"}</h3>
          </div>
          <div className="account-list">
            {fixRequests.slice(0, 3).map((request) => (
              <Link discover="none" to={request.reportPath || "/beta/billing"} key={request.id}>
                <span>{request.targetHost || request.targetUrl || "Fix Pack"}</span>
                <strong>{request.statusLabel || statusLabel(request.status)}</strong>
              </Link>
            ))}
            {!fixRequests.length && <p className="quiet-note">Checkout starts from a report with proven fixes.</p>}
          </div>
        </div>
      </div>
      <DeveloperApiPanel
        apiTokenSecret={apiTokenSecret}
        developerData={developerData}
        developerMessage={developerMessage}
        developerStatus={developerStatus}
        onApiTokenCreate={onApiTokenCreate}
        onApiTokenRevoke={onApiTokenRevoke}
        onWebhookCreate={onWebhookCreate}
        onWebhookRevoke={onWebhookRevoke}
        onWebhookUrlChange={onWebhookUrlChange}
        webhookSecret={webhookSecret}
        webhookUrl={webhookUrl}
      />
    </section>
  );
}

export function RepairAgentFeed({ items = [], nextAction = null, reports = [] }) {
  const hasReports = reports.length > 0;
  return (
    <section className="repair-agent-panel" aria-label="Repair agent feed">
      <div className="repair-agent-heading">
        <div>
          <p className="beta-eyebrow">Repair agent</p>
          <h3>{items.length ? nextAction?.label || "Proof-backed next actions" : "Waiting for repair proof"}</h3>
          <p>
            {items.length
              ? nextAction?.detail || "Review the highest-priority repair work across your saved reports."
              : hasReports
                ? "Open a report with proven issues to start the repair queue."
                : "Run the first audit to create a queue."}
          </p>
        </div>
        {nextAction?.href && (
          <a className="action-link" href={nextAction.href}>
            Open action
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
            <strong>{hasReports ? "No active repair queue yet." : "No reports yet."}</strong>
            <span>
              {hasReports
                ? "Latest reports and drafts will appear here once issues are queued."
                : "Verify a site and run an audit first."}
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
      <div className="section-heading">
        <p className="beta-eyebrow">Developer API</p>
        <h3>Run proof audits from your own tools.</h3>
        <StatusMessage tone={developerStatus}>{developerMessage}</StatusMessage>
      </div>
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
              <span>Copy now</span>
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
              <span>Signing secret</span>
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
