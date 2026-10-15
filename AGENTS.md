# Project AGENTS

Launch stage: 2 (payments). Next trigger: the first business buyer (an agency on white-label reports or the developer API) who asks for a contract, SSO or a security review (stage 3).

Success: Fix Packs delivered and kept, paid orders at status `delivered` (a refund or dispute moves an order to `refunded` or `disputed`). Baseline: 0 on 2026-10-15 (query below, read-only). Three older `delivered` rows are not counted: one is marked `is_test`, and two from launch day, 2026-05-20, have no payment amount recorded. Measured by: `npx wrangler d1 execute seofixkit_waitlist --remote --command "SELECT COUNT(*) FROM fix_requests WHERE status = 'delivered' AND is_test = 0 AND payment_amount > 0"` (read-only); the funnel before it is `GET /admin/funnel?windowDays=7`.

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
