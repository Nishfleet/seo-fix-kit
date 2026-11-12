import { D1_MAX_CONCURRENCY, runBounded } from "./bounded.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const GROWTH_FUNNEL_STEPS = Object.freeze(["visits", "checks", "accounts", "audits", "checkouts", "paid"]);

function utcMondayStartMs(now) {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - day);
  return date.getTime();
}

function weekOffset(value) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 26) : 0;
}

function growthFunnelWeekBounds(now = new Date(), offsetWeeks = 0) {
  const startMs = utcMondayStartMs(now) - weekOffset(offsetWeeks) * WEEK_MS;
  const start = new Date(startMs);
  const weekEnd = new Date(startMs + WEEK_MS);
  const lastDay = new Date(startMs + WEEK_MS - 1);
  return {
    weekStart: start.toISOString(),
    weekEnd: weekEnd.toISOString(),
    label: `${start.toISOString().slice(0, 10)} to ${lastDay.toISOString().slice(0, 10)}`
  };
}

async function countFromFirst(statement) {
  const row = await statement.first();
  const value = Number(row?.n);
  return Number.isFinite(value) ? value : 0;
}

async function countLandingVisits(env, bounds) {
  const rows =
    (
      await env.WAITLIST_DB.prepare(
        `SELECT funnel_key FROM access_events
         WHERE step = 'beta_view' AND created_at >= ? AND created_at < ?
         GROUP BY funnel_key`
      )
        .bind(bounds.weekStart, bounds.weekEnd)
        .all()
    ).results || [];
  return rows.filter((row) => String(row?.funnel_key || "").trim() !== "").length;
}

async function growthFunnelWeek(env, bounds) {
  const empty = { visits: 0, checks: 0, accounts: 0, audits: 0, checkouts: 0, paid: 0 };
  if (!env?.WAITLIST_DB) return { ...bounds, steps: empty };
  const db = env.WAITLIST_DB;
  const checkStart = bounds.weekStart.slice(0, 10);
  const checkEnd = bounds.weekEnd.slice(0, 10);
  const [visits, checks, accounts, audits, checkouts, paid] = await runBounded(
    [
      () => countLandingVisits(env, bounds),
      () =>
        countFromFirst(
          db
            .prepare(
              `SELECT COALESCE(SUM(count), 0) AS n FROM audit_usage
               WHERE bucket LIKE 'check:ip-hour:%' AND window_start >= ? AND window_start < ?`
            )
            .bind(checkStart, checkEnd)
        ),
      () =>
        countFromFirst(
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM (
                 SELECT owner_email FROM beta_sessions
                 WHERE created_at >= ? AND created_at < ?
                   AND access_mode != 'founder-override' AND owner_email != ''
                 GROUP BY owner_email
               )`
            )
            .bind(bounds.weekStart, bounds.weekEnd)
        ),
      () =>
        countFromFirst(
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM audit_reports
               WHERE created_at >= ? AND created_at < ?
                 AND (owner_email IS NULL OR owner_email NOT IN (
                   SELECT owner_email FROM beta_sessions
                   WHERE access_mode = 'founder-override' AND owner_email != ''
                 ))`
            )
            .bind(bounds.weekStart, bounds.weekEnd)
        ),
      () =>
        countFromFirst(
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM fix_requests
               WHERE checkout_created_at >= ? AND checkout_created_at < ? AND is_test = 0`
            )
            .bind(bounds.weekStart, bounds.weekEnd)
        ),
      () =>
        countFromFirst(
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM fix_requests
               WHERE paid_at >= ? AND paid_at < ? AND is_test = 0`
            )
            .bind(bounds.weekStart, bounds.weekEnd)
        )
    ],
    D1_MAX_CONCURRENCY,
    (query) => query()
  );
  return { ...bounds, steps: { visits, checks, accounts, audits, checkouts, paid } };
}

async function growthFunnelWeeks(env, options = {}) {
  const weeks = Math.max(1, Math.min(Math.trunc(Number(options.weeks)) || 8, 26));
  const now = options.now || new Date();
  const weeksData = [];
  for (let offset = 0; offset < weeks; offset += 1) {
    weeksData.push(await growthFunnelWeek(env, growthFunnelWeekBounds(now, offset)));
  }
  return weeksData;
}

export { GROWTH_FUNNEL_STEPS, growthFunnelWeek, growthFunnelWeekBounds, growthFunnelWeeks };
