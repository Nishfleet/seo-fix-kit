export function metricDisplay(metric) {
  return metric?.display || "unknown";
}

export function performanceOpportunityLabel(item) {
  const parts = [];
  if (item.savingsMs) parts.push(`${Math.round(item.savingsMs)}ms`);
  if (item.savingsBytes) parts.push(formatBytes(item.savingsBytes));
  if (item.displayValue) parts.push(item.displayValue);
  if (item.score !== null && item.score !== undefined) parts.push(`${item.score}/100`);
  return parts.join(" · ") || "needs review";
}

export function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 B";
  if (number < 1024) return `${Math.round(number)} B`;
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`;
  return `${(number / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0ms";
  if (number < 1000) return `${Math.round(number)}ms`;
  return `${(number / 1000).toFixed(1)}s`;
}

export function hostKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function beforeAfterText(summary) {
  if (!summary) return "";
  const beforeScore = Number(summary.beforeScore || 0);
  const afterScore = Number(summary.afterScore || 0);
  const beforeFindings = Number(summary.beforeFindings || 0);
  const afterFindings = Number(summary.afterFindings || 0);
  const scoreDelta = afterScore - beforeScore;
  const fixed = Math.max(0, beforeFindings - afterFindings);
  return `Score ${beforeScore} to ${afterScore} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta}). Problems ${beforeFindings} to ${afterFindings} (${fixed} fewer).`;
}

export function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

// One locale for every count in the UI, so numbers read the same regardless
// of the viewer's browser locale (matches the en-US copy elsewhere).
export const COUNT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return COUNT_FORMAT.format(number);
}

export function formatPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number * 1000) / 10}%`;
}

export function formatPosition(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "n/a";
  return String(Math.round(number * 10) / 10);
}

export function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${formatCount(number)}` : formatCount(number);
}

export function datetimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function formatLoadMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "unknown";
  if (number < 1000) return `${Math.round(number)}ms`;
  return `${(number / 1000).toFixed(1)}s`;
}

export function safeHostnameLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "saved report";
  }
}

export function safeUrlLabel(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "page";
  }
}

export function pathLabel(url, startUrl) {
  try {
    const parsed = new URL(url);
    if (startUrl && new URL(startUrl).pathname === parsed.pathname) return "home";
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

// The anchor id a finding row answers to, so "Fix these first" can jump to it.
export function findingAnchor(finding) {
  return `finding-${String(finding.id || finding.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
}
