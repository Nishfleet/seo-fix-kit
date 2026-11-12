# Weekly funnel scorecard

Six weekly numbers, counted from what already exists, read where the owner
already reads numbers. No new visitor tracker, no cookie, no third-party
script, no new polling service: the numbers ride the existing 15-minute cron
tick (`worker/lib/scheduled.js`) and land in the existing daily ops digest
email, which carries a "Last week (Mon–Sun)" block. The same rows are served
by the existing admin funnel endpoint:

```
GET /admin/funnel?windowDays=7&weeks=8
```

(`weeks` defaults to 8, capped at 26. Each entry: `weekStart`, `weekEnd`
(exclusive), `label`, and `steps`.)

Counting code: `worker/lib/growth-funnel.js`. Weeks are UTC, Monday 00:00 to
next Monday 00:00.

## The six numbers

| Step | Counted from | Definition and exclusions |
| --- | --- | --- |
| Visits | `access_events` (first-party `beta_view` beacon on the landing page) | Distinct funnel keys in the week. Site-wide visits stay in Cloudflare Web Analytics (already on, sets no cookie) — read the dashboard for the zone-wide number; this automated figure is the landing-page subset and reads lower. |
| Free page checks | `audit_usage` rate-limit buckets (`check:ip-hour:*`) | Sum of the per-network-hour counters in the week = completed one-page checks. Rate-limit-blocked attempts never increment, so they are not counted. Buckets expire automatically; no URL or IP is stored. |
| Accounts | `beta_sessions` | Distinct `owner_email` with a session created in the week, `access_mode` `self-serve` or `invite`. Sessions made with the founder password (`founder-override`) are the owner's own sessions and are excluded. |
| Site audits | `audit_reports` | Reports saved in the week, minus reports whose `owner_email` has ever signed in with the founder password (owner's own audit runs). Unattributed legacy rows count as real audits. |
| Checkouts started | `fix_requests.checkout_created_at` | Fix Pack checkout links created in the week, `is_test = 0`. |
| Fix Packs paid | `fix_requests.paid_at` | Payments captured in the week, `is_test = 0`. (Refunds and disputes are tracked separately by the AGENTS.md success query, which also requires delivery.) |

### Test and fleet traffic exclusion

- **Test orders**: every fix_requests-based step filters `is_test = 0`
  (migration 0009 flag; admin-created test rows carry it).
- **Owner's own sessions**: any email that signs in with the founder password
  (`BETA_ACCESS_PASSWORD`, session `access_mode = 'founder-override'`) is
  excluded from accounts and audits.
- **e2e and CI runs** never touch the production D1: the Playwright suite runs
  against a local server with a local database, so no production row can come
  from a test run. The `is_test` flag is the second line of defense for any
  manually created test order.
- **No new collection**: visits reuse the existing cookie-less first-party
  beacon; checks reuse the existing auto-expiring rate-limit counters. If a
  step ever needs a new visitor tracker, cookie, or third-party script to be
  counted, it stops here and says so instead.

## Baseline: last four complete weeks (UTC)

| Week (Mon–Sun) | Visits | Free checks | Accounts | Site audits | Checkouts | Paid |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-12 – 2026-10-18 | — | — | — | — | — | — |
| 2026-10-19 – 2026-10-25 | — | — | — | — | — | — |
| 2026-10-26 – 2026-11-01 | — | — | — | — | — | — |
| 2026-11-02 – 2026-11-08 | — | — | — | — | — | — |

Fill it from the first production read of the numbers (this agent run has no
Cloudflare credentials, so production D1 was not reachable). Either source
works:

1. `GET /admin/funnel?windowDays=7&weeks=8` with the admin bearer token
   (`ADMIN_EXPORT_TOKEN`) — the `growthFunnel.weeks` array holds these rows.
2. Read-only D1 queries, one per step, week bounded
   (`npx cf d1 query 887316c4-ca9d-4068-a7fa-1f530b479437 --sql "..."`,
   substituting the Monday dates):

```sql
-- visits
SELECT COUNT(DISTINCT funnel_key) AS n FROM access_events
WHERE step = 'beta_view' AND funnel_key != ''
  AND created_at >= '2026-11-02' AND created_at < '2026-11-09';
-- free page checks
SELECT COALESCE(SUM(count), 0) AS n FROM audit_usage
WHERE bucket LIKE 'check:ip-hour:%'
  AND window_start >= '2026-11-02' AND window_start < '2026-11-09';
-- accounts
SELECT COUNT(*) AS n FROM (
  SELECT owner_email FROM beta_sessions
  WHERE created_at >= '2026-11-02' AND created_at < '2026-11-09'
    AND access_mode != 'founder-override' AND owner_email != ''
  GROUP BY owner_email
);
-- site audits (owner sessions excluded)
SELECT COUNT(*) AS n FROM audit_reports
WHERE created_at >= '2026-11-02' AND created_at < '2026-11-09'
  AND (owner_email IS NULL OR owner_email NOT IN (
    SELECT owner_email FROM beta_sessions
    WHERE access_mode = 'founder-override' AND owner_email != ''));
-- checkouts started / Fix Packs paid
SELECT COUNT(*) AS n FROM fix_requests
WHERE checkout_created_at >= '2026-11-02' AND checkout_created_at < '2026-11-09'
  AND is_test = 0;
SELECT COUNT(*) AS n FROM fix_requests
WHERE paid_at >= '2026-11-02' AND paid_at < '2026-11-09' AND is_test = 0;
```

Site-wide visits for the same weeks are in Cloudflare Web Analytics
(dashboard → Web Analytics → date range), which is the number the 2026-10-13
to 2026-11-12 "about 30 people saw it" figure came from.

From the first filled table onward, the ops digest email carries the previous
week's row every morning, and each weekly scorecard posts it forward.
