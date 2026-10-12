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
        <p className="beta-eyebrow">Audit history</p>
        <h2>
          {firstRun
            ? "First saved audit for this host."
            : scoreDelta > 0
              ? `Score improved by ${scoreDelta} points.`
              : scoreDelta < 0
                ? `Score dropped by ${Math.abs(scoreDelta)} points.`
                : "Score held steady since the last audit."}
        </h2>
        <p>
          {firstRun
            ? "Future reruns will show fixed, new, and still-open issues here."
            : "Compares this report with the previous saved audit for the same owner and host."}
        </p>
      </div>

      <div className="report-delta-metrics" aria-label="Audit history delta">
        <Metric label="Score change" value={firstRun ? "New" : signedNumber(scoreDelta)} />
        <Metric label="Issue change" value={firstRun ? summary.issuesNow || 0 : signedNumber(issueDelta)} />
        <Metric label="Fixed" value={summary.fixedIssuesCount || 0} />
        <Metric label="New" value={summary.newIssuesCount || 0} />
        <Metric label="Still open" value={summary.persistentIssuesCount || 0} />
      </div>

      {!firstRun && (
        <div className="report-delta-grid">
          <DeltaIssueColumn
            title="Fixed since last audit"
            empty="No proven issues disappeared yet."
            issues={fixedIssues}
            tone="fixed"
          />
          <DeltaIssueColumn
            title="New since last audit"
            empty="No new proven issues appeared."
            issues={newIssues}
            tone="new"
          />
        </div>
      )}
    </section>
  );
}

export function RemediationBriefPanel({ brief, reportId }) {
  const queue = brief.priorityQueue || [];
  const history = brief.proofHistory || {};
  return (
    <section className="remediation-brief-panel" aria-label="Agent remediation brief">
      <div className="section-heading">
        <p className="beta-eyebrow">Agent repair brief</p>
        <h2>{queue.length ? "Turn proven issues into a repair queue" : "No priority repair queue"}</h2>
        <p>{brief.support?.safeHandoff || "Use the report proof and acceptance checks before closing repairs."}</p>
      </div>
      <div className="remediation-brief-grid">
        <div className="remediation-next-actions">
          <strong>Next actions</strong>
          <ol>
            {(brief.nextActions || []).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
        <div className="remediation-proof-history">
          <Metric label="Fixed" value={history.fixedIssues || 0} />
          <Metric label="New" value={history.newIssues || 0} />
          <Metric label="Persistent" value={history.persistentIssues || 0} />
        </div>
      </div>
      {queue.length ? (
        <div className="remediation-queue">
          {queue.slice(0, 4).map((item) => (
            <article key={item.id}>
              <span className={`status-pill ${item.severity}`}>{item.severity}</span>
              <h3>{item.title}</h3>
              <p>{item.proof || item.fix}</p>
              <ul>
                {(item.acceptanceChecks || []).slice(0, 2).map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p className="quiet-note">Keep monitoring and rerun after meaningful site changes.</p>
      )}
      {reportId && (
        <a className="action-link" href={`/api/reports/${encodeURIComponent(reportId)}/remediation-brief.json`}>
          Download remediation JSON
        </a>
      )}
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
