# Database restore runbook

The production database is D1 `seofixkit_waitlist`
(id `887316c4-ca9d-4068-a7fa-1f530b479437`). The restore path is stock
D1 Time Travel: point-in-time recovery that is always enabled, costs
nothing extra, and has no statement-size limits.

## Restore: D1 Time Travel — point-in-time, last 30 days

1. Find the moment to restore to:

   ```bash
   npx cf d1 time-travel get-bookmark 887316c4-ca9d-4068-a7fa-1f530b479437
   # or with a timestamp:
   npx cf d1 time-travel get-bookmark 887316c4-ca9d-4068-a7fa-1f530b479437 --timestamp "2026-06-12T00:00:00Z"
   ```

2. Restore (this rewrites the live database in place — the Worker keeps
   serving, rows revert to the bookmark):

   ```bash
   npx cf d1 time-travel restore 887316c4-ca9d-4068-a7fa-1f530b479437 --bookmark=<bookmark-id>
   ```

3. Verify: `curl https://seofixkit.com/api/health`, then spot-check
   `/beta/admin` counts.

Time Travel is always on — no enablement, no schedule, no backup job to
remember. Bookmarks older than 30 days cannot be used, and a restore
returns the previous bookmark so the restore itself can be undone.
Reference: https://developers.cloudflare.com/d1/reference/time-travel/

## Scheduled off-site export: the stock Workflows D1 backup

Time Travel cannot bring back a deleted database, and it keeps 30 days of
bookmarks. The copy that survives both is the stock Cloudflare Workflows D1
export: `worker/d1-backup-workflow.js` runs on the `BACKUP_WORKFLOW` binding
at 00:00 UTC every day and streams the SQL dump into `r2://seofixkit-backups/d1/`
through the `BACKUP_BUCKET` binding. It follows the Cloudflare guide, so it runs
inside the account on a schedule with no host scheduler and no shell glue:
https://developers.cloudflare.com/workflows/examples/backup-d1/

The one manual step is the long-lived export token, which stays Nish's call:

1. Mint a D1 export token through a reviewed `infra/cloudflare-tokens` PR in the
   fleet repo. A long-lived token never goes through ad-hoc minting.
2. Set the Worker secret: `npx cf workers secrets update D1_REST_API_TOKEN --worker seo-fix-kit --text <token value>`

Until that secret exists, each run fails fast with "D1 backup needs ACCOUNT_ID,
DATABASE_ID and D1_REST_API_TOKEN" instead of looping on a 401. The account and
database ids are plain vars in cloudflare.config.ts, which `npx cf deploy` reads.
A test in worker/index.test.mjs checks them and fails when the export target
stops matching the bound database.

Check it, and run it on demand:

```bash
npx cf workflows instances list --workflow-name d1-backup-workflow
npx cf workflows instances get <instance-id> --workflow-name d1-backup-workflow
npx cf workflows instances create d1-backup-workflow
npx cf r2 objects get d1/<filename> --bucket-name seofixkit-backups
```

What the Workflows export does not cover: a copy outside the Cloudflare
account (the R2 bucket lives in the same account as the database) and
retention (old dumps stay until someone deletes them). The weekly GitHub
Actions export below covers both. A dump import is still not a complete
restore — see the 2026-06-12 rehearsal below.

## The copy kept outside the Cloudflare account: the GitHub Actions export

The Workflows export writes to R2, which lives in the same account as the
database. The second copy is `.github/workflows/d1-export.yml`: Mondays 05:37
UTC (or by hand from the Actions tab) it exports the production database
through Cloudflare's own D1 export API
(developers.cloudflare.com/d1/best-practices/import-export-data/), seals the
dump with `age` on the runner and uploads it as the GitHub artifact
`d1-backup-seofixkit_waitlist`, kept 90 days — the retention the Workflows
export lacks, and the copy that survives a wrong restore, a deleted database
or an account problem after the last run.

The key is split: the run encrypts to the repository variable `AGE_RECIPIENT`
(the public `age1…` key `age-keygen` prints), so the GitHub credentials alone
cannot read a backup; the private half stays with whoever holds the restore
key, never in GitHub. Until the variable is set the run fails loud — the
backup refuses to ship plaintext dumps.

Restore: download `d1-backup-seofixkit_waitlist` from the run's summary page,
decrypt with `age -d -i <private-key-file> -o <dump>.sql <dump>.sql.age` on the
machine holding the private key, then import per the rehearsal log below.

## Why the old shell dump is gone

The weekly dump (`ops/backup-d1.sh` writing to `r2://seofixkit-backups`, run by
a host systemd timer) was retired on 2026-10-23 (issue #304). It was glue:
chained through a temp file, scheduled outside the repo, no README entry, no
test. The Workflows export above replaces it with the stock path.

Historical dumps remain in `r2://seofixkit-backups/d1/`.

## Rehearsal log

- 2026-06-12 — bucket created, first export uploaded, scratch-DB restore
  attempted: schema/small tables import; oversized report rows hit
  SQLITE_TOOBIG (see above). Scratch DB deleted.
