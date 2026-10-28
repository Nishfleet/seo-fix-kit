# Database restore runbook

The production database is D1 `seofixkit_waitlist`
(id `887316c4-ca9d-4068-a7fa-1f530b479437`). The restore path is stock
D1 Time Travel: point-in-time recovery that is always enabled, costs
nothing extra, and has no statement-size limits.

## Restore: D1 Time Travel — point-in-time, last 30 days

1. Find the moment to restore to:

   ```bash
   npx wrangler d1 time-travel info seofixkit_waitlist
   # or with a timestamp:
   npx wrangler d1 time-travel info seofixkit_waitlist --timestamp "2026-06-12T00:00:00Z"
   ```

2. Restore (this rewrites the live database in place — the Worker keeps
   serving, rows revert to the bookmark):

   ```bash
   npx wrangler d1 time-travel restore seofixkit_waitlist --bookmark=<bookmark-id>
   ```

3. Verify: `curl https://seofixkit.com/api/health`, then spot-check
   `/beta/admin` counts.

Time Travel is always on — no enablement, no schedule, no backup job to
remember. Bookmarks older than 30 days cannot be used, and a restore
returns the previous bookmark so the restore itself can be undone.
Reference: https://developers.cloudflare.com/d1/reference/time-travel/

## Why there is no scheduled SQL dump anymore

The weekly dump (`ops/backup-d1.sh` writing to `r2://seofixkit-backups`,
run by a host systemd timer) was retired on 2026-10-23 (issue #304). It
was glue: chained through a temp file, scheduled outside the repo, no
README entry, no test — and it was never a complete restore. The
2026-06-12 rehearsal below hit `SQLITE_TOOBIG` on oversized
`audit_reports.report_json` rows, so a dump import would silently drop
report bodies, and being weekly it could lose up to a week of writes.
Time Travel has neither limitation.

Historical dumps remain in `r2://seofixkit-backups/d1/` for now.

If a copy that outlives the 30-day window (or the deletion of the
database itself) is ever required, do not rebuild the shell glue. The
stock path is the Cloudflare Workflows export guide, which runs inside
the Cloudflare account on a schedule with no host scheduler:
https://developers.cloudflare.com/workflows/examples/backup-d1/

## Rehearsal log

- 2026-06-12 — bucket created, first export uploaded, scratch-DB restore
  attempted: schema/small tables import; oversized report rows hit
  SQLITE_TOOBIG (see above). Scratch DB deleted.
