# Error Log

Use this file only when an approach takes more than two attempts, or when a setup/build/deploy failure is likely to recur.

## Known Failures

### Recurring zero-byte ancestor `package.json` breaks Wrangler dry-runs and canaries

**Status:** recurring host contamination. The in-repo shield that carried this
since 2026-08-10 was removed 2026-10-23 (issue #304) in favor of the host-side
fix below.

**Symptom:** `npm run cf:dry-run` fails after a green Vite build with
`✘ [ERROR] Unexpected end of file in JSON ../../../package.json:1:0` (wrangler log under
`~/.wrangler/logs/`). The same error class has hit multiple products since 2026-08-02.

**Root cause:** wrangler's esbuild bundle step parses every `package.json` on the
ancestor chain of its working directory, entry points, and own package. A zero-byte
(or otherwise malformed) `package.json` anywhere above the repo kills the build before
bundling starts. An unattributed host tool periodically drops a project-init scaffold
batch (empty `.env*` ×8, `.gitmodules`, `package-lock.json`, `pnpm-lock.yaml`,
`yarn.lock`, `bunfig.toml`, empty `node_modules/`, and zero-byte `package.json`) into
directories it should not touch:

- 2026-08-02: `/home/nish/package.json`
- 2026-08-09 12:40 IST: `/home/nish/workspaces/agent-state/package.json` (batch described
  in `agent-state/lanes/hourly-audit/reports/20260809T082000Z-timers-and-units.md`)
- 2026-08-10 19:21 IST: `/home/nish/package.json` again (batch in `$HOME`, mtime matches
  the `fleet-sol-sweep` lane-control pass start at 19:21:00; creator still unattributed)

**Fix (2026-10-23, issue #304):** the in-repo shield (`scripts/wrangler-dry-run.mjs`)
is deleted; `npm run cf:dry-run` runs the stock `wrangler deploy --dry-run` again,
which fails loudly on a contaminated chain instead of hiding it. The root cause was
fixed host-side: the zero-byte `/home/nish/package.json` scaffold manifest was
restored to valid JSON (`{}`, verified 2026-10-23) and no other manifest exists on
the repo's ancestor chain (`/home/nish/workspaces`, `.../products`,
`.../agent-worktrees` are manifest-free).

**If it recurs (host-side fix):** restore a confirmed empty scaffold manifest to
valid JSON without touching non-empty manifests: `printf '{}\n' > /home/nish/package.json`
(only after `wc -c` confirms size 0). Watching for new batches: `ls -la /home/nish`.
