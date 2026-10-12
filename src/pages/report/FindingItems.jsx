import { CodeBlock } from "../../components/CodeBlock.jsx";
import { findingAnchor, formatLoadMs } from "../../lib/format.js";

function FindingDetails({ finding, plan, compact }) {
  return (
    <>
      {!compact && <p>{finding.why}</p>}
      <dl>
        {finding.pageLabel && (
          <div>
            <dt>Page</dt>
            <dd>{finding.pageLabel}</dd>
          </div>
        )}
        <div>
          <dt>Confidence</dt>
          <dd>{finding.confidence || "verified"}</dd>
        </div>
        <div>
          <dt>Proof</dt>
          <dd>{finding.evidence}</dd>
        </div>
        <div>
          <dt>Fix</dt>
          <dd>{finding.fix}</dd>
        </div>
        {plan?.acceptance && (
          <div>
            <dt>Acceptance</dt>
            <dd>{plan.acceptance}</dd>
          </div>
        )}
      </dl>
      {finding.source && (
        <a className="source-link" href={finding.source} target="_blank" rel="noreferrer">
          Google source
        </a>
      )}
      {finding.snippet && <CodeBlock code={finding.snippet} />}
    </>
  );
}

// One problem. In the full list it is a row that opens to its proof and fix
// (scan the list, open what you are working on, the way Linear lists issues);
// compact items in other tabs stay fully open.
export function FindingItem({ finding, plan, compact = false, collapsible = false, defaultOpen = false }) {
  if (collapsible) {
    return (
      <details
        className={`finding-item finding-row ${finding.severity}`}
        id={findingAnchor(finding)}
        open={defaultOpen}
      >
        <summary>
          <span>{finding.severity}</span>
          <h3>{finding.title}</h3>
          {finding.snippet && <small className="finding-row-tag">Fix ready</small>}
        </summary>
        <div className="finding-row-body">
          <FindingDetails finding={finding} plan={plan} compact={compact} />
        </div>
      </details>
    );
  }
  return (
    <article className={`finding-item ${finding.severity} ${compact ? "compact" : ""}`}>
      <div>
        <span>{finding.severity}</span>
        <h3>{finding.title}</h3>
      </div>
      <FindingDetails finding={finding} plan={plan} compact={compact} />
    </article>
  );
}

export function FixItem({ fix }) {
  return (
    <article className="fix-item">
      <div>
        <span>#{fix.priority}</span>
        <h3>{fix.title}</h3>
      </div>
      <div className="fix-tags">
        <small>{fix.estimatedEffort || "15-30 min"}</small>
        <small>{fix.workType || "review"}</small>
        <small>{fix.confidence || "verified"}</small>
      </div>
      <p>{fix.fix}</p>
      {fix.pageLabel && <p className="proof-line">Page: {fix.pageLabel}</p>}
      <p className="proof-line">Proof: {fix.proof}</p>
      <p className="proof-line">Acceptance: {fix.acceptance}</p>
      {fix.snippet && <CodeBlock code={fix.snippet} />}
    </article>
  );
}

export function PageProof({ page }) {
  const facts = page.rendered || {};
  const staticFacts = page.static || {};
  return (
    <article className="page-proof">
      <p className="beta-eyebrow">Static vs rendered proof</p>
      <h3>{page.url}</h3>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>
            {page.status || "unknown"} {page.redirected ? `· final ${facts.finalUrl || page.finalUrl}` : ""}
          </dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{facts.title || "missing"}</dd>
        </div>
        <div>
          <dt>H1</dt>
          <dd>{facts.h1s?.join(" | ") || "missing"}</dd>
        </div>
        <div>
          <dt>Words</dt>
          <dd>
            {staticFacts.wordCount ?? "unknown"} static → {facts.wordCount ?? "unknown"} rendered
          </dd>
        </div>
        <div>
          <dt>Internal links</dt>
          <dd>
            {staticFacts.internalLinks?.length ?? 0} static → {facts.internalLinks?.length ?? 0} rendered
          </dd>
        </div>
        <div>
          <dt>Broken links</dt>
          <dd>{page.linkChecks?.filter((check) => !check.ok || !check.status || check.status >= 400).length ?? 0}</dd>
        </div>
        <div>
          <dt>Broken images</dt>
          <dd>{page.imageChecks?.filter((check) => !check.ok || !check.status || check.status >= 400).length ?? 0}</dd>
        </div>
        <div>
          <dt>Rendered load</dt>
          <dd>
            {formatLoadMs(facts.loadDurationMs)}
            {facts.loadSettled === false ? " · network idle not reached" : ""}
          </dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{facts.schemaTypes?.join(", ") || "none"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function PageSummaryTable({ pages }) {
  if (!pages?.length) return <p className="quiet-note">No page details were saved for this crawl.</p>;
  return (
    <>
      <div className="page-table" role="table" aria-label="Crawled pages">
        <div className="page-table-row page-table-head" role="row">
          <span>Page</span>
          <span>Score</span>
          <span>Issues</span>
          <span>H1</span>
          <span>Words</span>
          <span>Links</span>
          <span>Broken</span>
          <span>Load</span>
          <span>Schema</span>
        </div>
        {pages.map((page) => (
          <div className="page-table-row" role="row" key={page.url}>
            <span title={page.url}>{page.path || new URL(page.url).pathname || "/"}</span>
            <strong>{page.score}</strong>
            <span>{page.critical + page.warnings + page.notices}</span>
            <span>{page.h1 || "missing"}</span>
            <span>{page.wordCount}</span>
            <span>{page.internalLinks}</span>
            <span>{(page.brokenLinks || 0) + (page.brokenImages || 0)}</span>
            <span>
              {formatLoadMs(page.loadDurationMs)}
              {page.loadSettled === false ? " · wait timed out" : ""}
            </span>
            <span>{page.schemaTypes?.join(", ") || "none"}</span>
          </div>
        ))}
      </div>
      <div className="page-card-list" aria-label="Crawled pages mobile summary">
        {pages.map((page) => (
          <article className="page-summary-card" key={`card-${page.url}`}>
            <div>
              <span>{page.path || new URL(page.url).pathname || "/"}</span>
              <strong>{page.score}/100</strong>
            </div>
            <dl>
              <div>
                <dt>Issues</dt>
                <dd>{page.critical + page.warnings + page.notices}</dd>
              </div>
              <div>
                <dt>H1</dt>
                <dd>{page.h1 || "missing"}</dd>
              </div>
              <div>
                <dt>Words</dt>
                <dd>{page.wordCount}</dd>
              </div>
              <div>
                <dt>Links</dt>
                <dd>{page.internalLinks}</dd>
              </div>
              <div>
                <dt>Broken</dt>
                <dd>{(page.brokenLinks || 0) + (page.brokenImages || 0)}</dd>
              </div>
              <div>
                <dt>Load</dt>
                <dd>
                  {formatLoadMs(page.loadDurationMs)}
                  {page.loadSettled === false ? " · wait timed out" : ""}
                </dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>{page.schemaTypes?.join(", ") || "none"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
