/** @param {unknown} value
 * @returns {string}
 */
function hostOf(value = "") {
  try {
    return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** @param {unknown} value
 * @returns {string}
 */
function pageKey(value = "") {
  try {
    const url = new URL(String(value));
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return "";
  }
}

/** @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** @param {{ url?: string, createdAt?: string }[]} [reports]
 * @param {{ targetUrl?: string, target_url?: string, status?: string, nextRunAt?: string, next_run_at?: string }[]} [schedules]
 * @param {{ limit?: number }} [options]
 * @returns {any[]}
 */
export function buildSiteProgress(reports = [], schedules = [], { limit = 4 } = {}) {
  const byPage = new Map();
  for (const report of reports) {
    const key = pageKey(report.url);
    if (!key) continue;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(report);
  }

  const bestPageByHost = new Map();
  const latestByHost = new Map();
  for (const [key, rows] of byPage) {
    const host = hostOf(rows[0].url);
    const current = bestPageByHost.get(host);
    /** @type {(max: string, row: { createdAt?: string }) => string} */
    const pickLatest = (max, row) => (String(row.createdAt || "") > max ? String(row.createdAt || "") : max);
    const latest = rows.reduce(pickLatest, "");
    if (latest > (latestByHost.get(host) || "")) latestByHost.set(host, latest);
    if (
      !current ||
      rows.length > current.rows.length ||
      (rows.length === current.rows.length && latest > current.latest)
    ) {
      bestPageByHost.set(host, { key, rows, latest });
    }
  }

  const nextCheckByHost = new Map();
  for (const schedule of schedules) {
    if (schedule.status && schedule.status !== "active") continue;
    const host = hostOf(schedule.targetUrl || schedule.target_url);
    const next = schedule.nextRunAt || schedule.next_run_at || "";
    if (host && next && (!nextCheckByHost.has(host) || next < nextCheckByHost.get(host))) {
      nextCheckByHost.set(host, next);
    }
  }

  return [...bestPageByHost.entries()]
    .map(([host, { rows }]) => {
      const points = [...rows]
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map((row) => ({
          score: numberOr(row.score),
          issues: numberOr(row.totalFindings),
          createdAt: row.createdAt,
          reportPath: row.reportPath
        }));
      const first = points[0];
      const last = points[points.length - 1];
      return {
        host,
        url: rows[0].url,
        points,
        checks: points.length,
        scoreNow: last.score,
        scoreChange: last.score - first.score,
        issuesNow: last.issues,
        issuesChange: last.issues - first.issues,
        since: first.createdAt,
        latestAt: latestByHost.get(host) || "",
        reportPath: [...points].reverse().find((point) => point.reportPath)?.reportPath || "",
        nextCheckAt: nextCheckByHost.get(host) || ""
      };
    })
    .sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)))
    .slice(0, limit);
}
