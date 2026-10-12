import { Metric } from "../../components/Metric.jsx";
import { metricDisplay, performanceOpportunityLabel, formatBytes, formatMs } from "../../lib/format.js";

export function PerformancePanel({ performance }) {
  const metrics = performance.labMetrics || {};
  const opportunities = performance.opportunities || [];
  const score = Number.isFinite(Number(performance.performanceScore))
    ? `${performance.performanceScore}/100`
    : "local proof";
  return (
    <section className="performance-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Performance proof</p>
        <h2>{performance.status === "success" ? "PageSpeed lab data" : "Rendered load snapshot"}</h2>
        <p>
          {performance.status === "success"
            ? "Mobile Lighthouse metrics from PageSpeed Insights are converted into repair-ready findings."
            : performance.reason || "The rendered browser audit still captured local load proof."}
        </p>
      </div>
      <div className="performance-grid">
        <Metric label="Mobile score" value={score} />
        <Metric label="LCP" value={metricDisplay(metrics.largestContentfulPaint)} />
        <Metric label="TBT" value={metricDisplay(metrics.totalBlockingTime)} />
        <Metric label="CLS" value={metricDisplay(metrics.cumulativeLayoutShift)} />
        <Metric label="Speed Index" value={metricDisplay(metrics.speedIndex)} />
      </div>
      {(performance.fieldData?.overallCategory || opportunities.length > 0) && (
        <div className="performance-details">
          {performance.fieldData?.overallCategory && (
            <p>
              Field data: <strong>{performance.fieldData.overallCategory}</strong>
              {performance.fieldData.originFallback ? " via origin fallback" : ""}
            </p>
          )}
          {opportunities.length > 0 && (
            <ul>
              {opportunities.slice(0, 3).map((item) => (
                <li key={item.id || item.title}>
                  <strong>{item.title}</strong>
                  <span>{performanceOpportunityLabel(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function ResourceWaterfallPanel({ waterfall }) {
  const summary = waterfall.summary || {};
  const slowResources = waterfall.slowResources || [];
  const heavyResources = waterfall.heavyResources || [];
  const blockers = waterfall.renderBlockingCandidates || [];
  const thirdPartyHosts = waterfall.thirdPartyHosts || [];
  const rows = [
    { label: "Requests", value: summary.totalRequests || 0 },
    { label: "Transfer", value: formatBytes(summary.totalTransferBytes || 0) },
    { label: "JavaScript", value: formatBytes(summary.scriptBytes || 0) },
    { label: "CSS", value: formatBytes(summary.stylesheetBytes || 0) },
    { label: "Images", value: formatBytes(summary.imageBytes || 0) },
    { label: "Slow", value: summary.slowRequests || 0 },
    { label: "Blocking", value: summary.renderBlockingCandidates || 0 }
  ];

  if (waterfall.status === "empty") {
    return (
      <section className="resource-waterfall-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Resource waterfall</p>
          <h2>Browser resource timing was unavailable.</h2>
          <p>{waterfall.reason || "The rendered scan did not expose request-level timing rows."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="resource-waterfall-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Resource waterfall</p>
        <h2>Browser-loaded resources with repair proof.</h2>
        <p>Request timing, transfer size, and early render-blocking candidates from the rendered browser pass.</p>
      </div>
      <div className="resource-waterfall-metrics">
        {rows.map((row) => (
          <Metric key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <div className="resource-waterfall-grid">
        <ResourceTimingList
          title="Slow requests"
          empty="No slow resource requests captured."
          resources={slowResources}
          value={(resource) => formatMs(resource.durationMs)}
        />
        <ResourceTimingList
          title="Heavy resources"
          empty="No heavy resources crossed the review threshold."
          resources={heavyResources}
          value={(resource) => formatBytes(resource.sizeBytes || 0)}
        />
        <ResourceTimingList
          title="Render blockers"
          empty="No early script or stylesheet blockers captured."
          resources={blockers}
          value={(resource) => formatMs(resource.durationMs)}
        />
        <div className="resource-waterfall-list">
          <strong>Third-party hosts</strong>
          {thirdPartyHosts.length ? (
            thirdPartyHosts.slice(0, 5).map((host) => (
              <div className="resource-row" key={host.host}>
                <span>{host.host}</span>
                <small>
                  {host.requests} requests · {formatBytes(host.transferBytes || 0)}
                </small>
              </div>
            ))
          ) : (
            <p>No third-party resource hosts captured.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function ResourceTimingList({ title, empty, resources, value }) {
  return (
    <div className="resource-waterfall-list">
      <strong>{title}</strong>
      {resources.length ? (
        resources.slice(0, 5).map((resource) => (
          <div className="resource-row" key={`${title}-${resource.url}`}>
            <span>{resource.label || resource.host || resource.url}</span>
            <small>
              {resource.type || "resource"} · {value(resource)}
            </small>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}
