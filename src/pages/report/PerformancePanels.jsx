import { Metric } from "../../components/Metric.jsx";
import { metricDisplay, performanceOpportunityLabel, formatBytes, formatMs } from "../../lib/format.js";

export function PerformancePanel({ performance }) {
  const metrics = performance.labMetrics || {};
  const opportunities = performance.opportunities || [];
  const score = Number.isFinite(Number(performance.performanceScore))
    ? `${performance.performanceScore}/100`
    : "Not measured";
  return (
    <section className="performance-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Page speed</p>
        <h2>{performance.status === "success" ? "PageSpeed Insights results" : "Load time from our browser"}</h2>
        <p>
          {performance.status === "success"
            ? "Mobile lab results from Google PageSpeed Insights. Slow results show up as problems in this report."
            : performance.reason || "PageSpeed Insights returned no data. These load times come from our own browser."}
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
              Real-user data: <strong>{performance.fieldData.overallCategory}</strong>
              {performance.fieldData.originFallback ? " (whole-site average)" : ""}
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
    { label: "Downloaded", value: formatBytes(summary.totalTransferBytes || 0) },
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
          <p className="beta-eyebrow">Files the page loads</p>
          <h2>No request timing for this page</h2>
          <p>{waterfall.reason || "The browser didn’t report timing for individual requests."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="resource-waterfall-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Files the page loads</p>
        <h2>Requests, file sizes and slow files</h2>
        <p>
          Timing and size of each file the page loaded, plus scripts and stylesheets that may delay the first paint.
        </p>
      </div>
      <div className="resource-waterfall-metrics">
        {rows.map((row) => (
          <Metric key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <div className="resource-waterfall-grid">
        <ResourceTimingList
          title="Slow requests"
          empty="No slow requests."
          resources={slowResources}
          value={(resource) => formatMs(resource.durationMs)}
        />
        <ResourceTimingList
          title="Large files"
          empty="No files over the size limit."
          resources={heavyResources}
          value={(resource) => formatBytes(resource.sizeBytes || 0)}
        />
        <ResourceTimingList
          title="Render blockers"
          empty="No scripts or stylesheets delaying the first paint."
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
            <p>No third-party requests.</p>
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
