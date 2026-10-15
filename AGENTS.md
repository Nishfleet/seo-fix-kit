# Project AGENTS

Launch stage: 2 (payments). Next trigger: the first business buyer (an agency on white-label reports or the developer API) who asks for a contract, SSO or a security review (stage 3).

Success: Fix Packs delivered and kept, paid orders at status `delivered` (a refund or dispute moves an order to `refunded` or `disputed`). Baseline: none yet (production D1 has not been read for it; run the query below and write the count and date here). Measured by: `npx wrangler d1 execute seofixkit_waitlist --remote --command "SELECT COUNT(*) FROM fix_requests WHERE status = 'delivered'"` (read-only); the funnel before it is `GET /admin/funnel?windowDays=7`.

Follow `~/.codex/AGENTS.md` first, then this repo-specific layer.

## Project Rules

- Keep implementation truth in this repo's code and docs.
- Read `MEMORY.md` before making architectural, product, billing, deploy, or positioning decisions.
- Read `ERRORS.md` before retrying setup, build, deploy, or debugging approaches.
- Make the smallest change that solves the current task and verify it before calling it done.

<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
