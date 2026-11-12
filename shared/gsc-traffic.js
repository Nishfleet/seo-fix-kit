function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const MAX_GSC_PAGE_ROWS = 2000;
const GSC_WINDOW_DAYS = 90;
const TOP_REASON_COUNT = 5;

export const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function canonicalPageKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = `${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
    return `${host}${path === "" ? "/" : path}`;
  } catch {
    return "";
  }
}

function pathKey(url) {
  const canonical = canonicalPageKey(url);
  if (!canonical) return "";
  const index = canonical.indexOf("/");
  return index === -1 ? "" : canonical.slice(index);
}

export function normalizeGscPageRows(rawRows, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || MAX_GSC_PAGE_ROWS), 1), MAX_GSC_PAGE_ROWS);
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const byKey = new Map();
  for (const row of rows) {
    const keys = Array.isArray(row?.keys) ? row.keys : [];
    const url = cleanText(row?.pageUrl ?? keys[0] ?? row?.url, 600);
    const canonical = canonicalPageKey(url);
    if (!canonical) continue;
    const normalized = {
      url,
      path: new URL(url).pathname,
      clicks: Math.round(numberFrom(row?.clicks)),
      impressions: Math.round(numberFrom(row?.impressions)),
      ctr: numberFrom(row?.ctr),
      position: numberFrom(row?.position)
    };
    const existing = byKey.get(canonical);
    if (existing) {
      existing.clicks += normalized.clicks;
      existing.impressions += normalized.impressions;
      continue;
    }
    byKey.set(canonical, normalized);
  }
  return [...byKey.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, limit);
}

function trafficIndex(rows) {
  const byPage = new Map();
  const byPath = new Map();
  for (const row of rows || []) {
    const canonical = canonicalPageKey(row.url);
    if (!canonical) continue;
    if (!byPage.has(canonical)) byPage.set(canonical, row);
    if (!byPath.has(row.path)) byPath.set(row.path, row);
  }
  return { byPage, byPath };
}

function trafficForPage(item, index) {
  const canonical = canonicalPageKey(item.pageUrl || item.page_url || "");
  if (canonical && index.byPage.has(canonical)) return index.byPage.get(canonical);
  const path = pathKey(item.pageUrl || item.page_url || "");
  if (path) return index.byPath.get(path) || null;
  return null;
}

function formatClicks(clicks) {
  return clicks === 1 ? "1 click" : `${clicks} clicks`;
}

function trafficReason(item) {
  const clicks = Number(item.trafficClicks || 0);
  const prefix = item.priority <= TOP_REASON_COUNT ? "Ranked first" : "Ranked by traffic";
  return `${prefix}: this page earns ${formatClicks(clicks)} over the last 90 days from Google, and this fault puts that traffic at risk.`;
}

export function applyGscTrafficToQueue(items = [], gscRows = []) {
  const input = Array.isArray(items) ? items : [];
  const rows = normalizeGscPageRows(gscRows);
  if (!input.length || !rows.length) {
    return { items: input, summary: null };
  }
  const index = trafficIndex(rows);
  const originalOrder = new Map(input.map((item, position) => [item, position]));
  const ranked = input.map((item) => {
    const row = trafficForPage(item, index);
    const clicks = row ? row.clicks : 0;
    const impressions = row ? row.impressions : 0;
    return {
      ...item,
      trafficClicks: clicks,
      trafficImpressions: impressions
    };
  });
  ranked.sort((a, b) => {
    const aTraffic = Number(a.trafficClicks || 0);
    const bTraffic = Number(b.trafficClicks || 0);
    if (aTraffic !== bTraffic) {
      if (!aTraffic || !bTraffic) return aTraffic ? -1 : 1;
      return bTraffic - aTraffic;
    }
    if (aTraffic && Number(b.trafficImpressions || 0) !== Number(a.trafficImpressions || 0)) {
      return Number(b.trafficImpressions) - Number(a.trafficImpressions);
    }
    return (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0);
  });
  ranked.forEach((item, position) => {
    item.priority = position + 1;
    item.trafficReason = trafficReason(item);
  });

  const withTraffic = ranked.filter((item) => Number(item.trafficClicks || 0) > 0);
  return {
    items: ranked,
    summary: {
      status: "ready",
      windowDays: GSC_WINDOW_DAYS,
      pages: rows.length,
      pagesWithTraffic: withTraffic.length,
      clicksAtRisk: withTraffic.reduce((total, item) => total + Number(item.trafficClicks || 0), 0),
      topFive: ranked.slice(0, TOP_REASON_COUNT).map((item) => ({
        priority: item.priority,
        title: item.title,
        pageUrl: item.pageUrl,
        trafficClicks: Number(item.trafficClicks || 0),
        trafficImpressions: Number(item.trafficImpressions || 0),
        reason: item.trafficReason
      }))
    }
  };
}

export function gscPageSummary(rows = []) {
  const normalized = normalizeGscPageRows(rows);
  return {
    windowDays: GSC_WINDOW_DAYS,
    pages: normalized.length,
    clicks: normalized.reduce((total, row) => total + row.clicks, 0),
    impressions: normalized.reduce((total, row) => total + row.impressions, 0)
  };
}

export { GSC_WINDOW_DAYS };
