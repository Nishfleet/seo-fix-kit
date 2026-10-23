# ops

Operational scripts, and the systemd units that run them.

## Weekly production D1 backup

`seofixkit-d1-backup.timer` starts `seofixkit-d1-backup.service` every Sunday at
03:30 UTC (`Persistent=true`, so a missed run starts after boot).
`ops/backup-d1.sh` exports the production database with `wrangler d1 export` and
uploads the dump to the R2 bucket `seofixkit-backups` under `d1/`.
`ops/RESTORE.md` says how to restore from the dump, and from D1 Time Travel.

Wrangler is a fleet-wide ban with one exception: `cf` cannot export D1 yet
(cloudflare/cf#199), so this script is the approved exception until it can.

Install on a machine that can authenticate to Cloudflare:

```
install -m0644 ops/seofixkit-d1-backup.service ops/seofixkit-d1-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now seofixkit-d1-backup.timer
```

The unit reads its token from the `EnvironmentFile` it names, which holds
`CLOUDFLARE_API_TOKEN` (and optionally `CLOUDFLARE_ACCOUNT_ID`). That token needs
D1 Read and Workers R2 Storage Write. It never goes in the unit file or a command
line. A failed run fires `fleet-unit-failed@%N.service`, the healthchecks.io fail
ping.

Switch it off:

```
systemctl --user disable --now seofixkit-d1-backup.timer
```

`test/d1-backup-unit.test.mjs` pins the unit's keys, and runs in `npm run check`.

Status: the fleet box does not load these units. They moved here from a copy
outside any repo (fleet-ops#10145), and that copy is gone. The weekly export
moves into this repo's CI, which holds the repo's Cloudflare token and uses the
`cf` CLI (fleet-ops#9527).
