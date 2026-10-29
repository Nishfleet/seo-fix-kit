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

## The weekly SQL dump — secondary copy, not the restore path

A weekly export runs in this repo's own CI
(`.github/workflows/backup-d1.yml`, Sundays 03:30 UTC), landing as an
age-sealed GitHub Actions artifact named `d1-backup-seofixkit_waitlist`
and kept 90 days, which is 13 weekly points. It moved here from the
retired Mac task on 2026-10-24 (Nishfleet/fleet-ops#9527) after the
host-scheduler copy was retired as glue on 2026-10-23 (issue #304).
One-off runs: the workflow's Run workflow button, or
`gh workflow run backup-d1.yml`.

To restore from a dump, download the artifact from the run, unseal it with
the fleet backup key's private half (it lives on the fleet host, at
`~/.config/drive/d1-backup-key.txt`, and never in this repository), and
import the SQL file:

```bash
gh run download <run-id> -n d1-backup-seofixkit_waitlist -D /tmp/d1-backup
age -d -i ~/.config/drive/d1-backup-key.txt \
  -o /tmp/d1-backup/seofixkit-backup-YYYY-MM-DD.sql \
  /tmp/d1-backup/seofixkit-backup-YYYY-MM-DD.sql.age
```

The dump does not land in object storage: the Cloudflare token this
repository holds carries no object-storage permission
(`infra/cloudflare-tokens`, `main.tf`, key "seo-fix-kit"), and the bucket
the retired script wrote to is inside the same Cloudflare account as the
database itself. An artifact is outside both. The dump is sealed with age
before it leaves the runner because this repository is public and the
plaintext dump holds customer rows.

Retention is a policy decision, not a technical one. The 90 days outlast
Time Travel's 30-day restore window, which is what makes a dump worth
making at all, but it also means a customer deletion that only reaches
the live database is not yet gone from these sealed copies. Whether the
product keeps this copy at all is Nishfleet/seo-fix-kit#308.

Everything the retirement recorded about the dump still holds: being
weekly it can lose up to a week of writes, and the 2026-06-12 rehearsal
below hit `SQLITE_TOOBIG` on oversized `audit_reports.report_json`
rows, so a dump import would silently drop report bodies. Time Travel
has neither limitation and stays primary. The dump adds the two cases
Time Travel does not cover: restoring after the database itself is
deleted, and copies older than 30 days. Whether the product needs that
coverage at all is Nishfleet/seo-fix-kit#308.

Historical dumps from the host-scheduler era remain in
`r2://seofixkit-backups/d1/`.

Nothing watches this job beyond GitHub's own failure email, which goes to
the last person who edited the workflow, and GitHub turns a scheduled
workflow off after 60 days with no commit in the repository. The check
that it still runs is a restore drill: download a recent artifact, unseal
it and import it. That is also the only thing that proves the decrypt
path, which the 2026-10-29 rehearsal below did not cover. If the schedule
itself is ever found unreliable, the stock replacement is the Cloudflare
Workflows export guide, which runs inside the Cloudflare account on a
schedule with no host scheduler:
https://developers.cloudflare.com/workflows/examples/backup-d1/

## Rehearsal log

- 2026-06-12 — bucket created, first export uploaded, scratch-DB restore
  attempted: schema/small tables import; oversized report rows hit
  SQLITE_TOOBIG (see above). Scratch DB deleted.
- 2026-10-29 — the export moved off the Mac task into
  `.github/workflows/backup-d1.yml` and off object storage onto a sealed
  GitHub artifact (Nishfleet/fleet-ops#9527). One real CI run proved the
  export, the age seal and the artifact upload; no dump import has been
  rehearsed against the new path yet.
