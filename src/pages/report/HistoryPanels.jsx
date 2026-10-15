import { CopyButton } from "../../components/CopyButton.jsx";
import { Metric } from "../../components/Metric.jsx";
import { signedNumber, safeHostnameLabel } from "../../lib/format.js";

export function ReportDeltaPanel({ delta }) {
  const summary = delta.summary || {};
  const firstRun = delta.status === "first_run";
  const scoreDelta = Number(summary.scoreDelta || 0);
  const issueDelta = Number(summary.issuesDelta || 0);
  const fixedIssues = delta.fixedIssues || [];
  const newIssues = delta.newIssues || [];

  return (
    <section className="report-delta-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Since your last audit</p>
        <h2>
          {firstRun
            ? "First audit of this site"
            : scoreDelta > 0
              ? `Score up ${scoreDelta} points`
              : scoreDelta < 0
                ? `Score down ${Math.abs(scoreDelta)} points`
                : "Score unchanged since the last audit"}
        </h2>
        <p>
          {firstRun
            ? "Rerun the audit to see what’s fixed, still open or new."
            : "Compared with your previous audit of this site."}
        </p>
      </div>

      <div className="report-delta-metrics" aria-label="Changes since last audit">
        <Metric label="Score change" value={firstRun ? "New" : signedNumber(scoreDelta)} />
        <Metric label="Problem change" value={firstRun ? summary.issuesNow || 0 : signedNumber(issueDelta)} />
        <Metric label="Fixed" value={summary.fixedIssuesCount || 0} />
        <Metric label="New" value={summary.newIssuesCount || 0} />
        <Metric label="Still open" value={summary.persistentIssuesCount || 0} />
      </div>

      {!firstRun && (
        <div className="report-delta-grid">
          <DeltaIssueColumn
            title="Fixed since last audit"
            empty="Nothing fixed yet."
            issues={fixedIssues}
            tone="fixed"
          />
          <DeltaIssueColumn title="New since last audit" empty="No new problems." issues={newIssues} tone="new" />
        </div>
      )}
    </section>
  );
}

export function RemediationBriefPanel({ brief, developerBrief, reportId }) {
  const queue = brief.priorityQueue || [];
  const history = brief.proofHistory || {};
  return (
    <section className="remediation-brief-panel" aria-label="Repair brief">
      <div className="section-heading">
        <p className="beta-eyebrow">Repair brief</p>
        <h2>{queue.length ? "Hand it off" : "No priority fixes"}</h2>
        <p>{brief.support?.safeHandoff || "Check each fix against its evidence before you close it."}</p>
      </div>
      <div className="remediation-brief-grid">
        <div className="remediation-next-actions">
          <strong>Next steps</strong>
          <ol>
            {(brief.nextActions || []).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
        <div className="remediation-proof-history">
          <Metric label="Fixed" value={history.fixedIssues || 0} />
          <Metric label="New" value={history.newIssues || 0} />
          <Metric label="Still open" value={history.persistentIssues || 0} />
        </div>
      </div>
      {!queue.length && <p className="quiet-note">Nothing queued. Rerun the audit after you change the site.</p>}
      <div className="remediation-brief-actions">
        {developerBrief && (
          <CopyButton className="app-button-secondary" label="Copy developer brief" value={developerBrief} />
        )}
        {reportId && (
          <a className="action-link" href={`/api/reports/${encodeURIComponent(reportId)}/remediation-brief.json`}>
            Download brief (JSON)
          </a>
        )}
      </div>
    </section>
  );
}

export function DeltaIssueColumn({ title, empty, issues, tone }) {
  return (
    <article className={`report-delta-column ${tone}`}>
      <strong>{title}</strong>
      {issues.slice(0, 5).map((issue) => (
        <div className="report-delta-issue" key={`${issue.title}-${issue.pageUrl}-${issue.severity}`}>
          <span>{issue.severity || "notice"}</span>
          <b>{issue.title}</b>
          <small>{issue.pageLabel || safeHostnameLabel(issue.pageUrl || "")}</small>
        </div>
      ))}
      {!issues.length && <p>{empty}</p>}
    </article>
  );
}
