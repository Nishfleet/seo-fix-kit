# verify skill

`SKILL.md` tells an agent how to launch SEO Fix Kit locally, check it is healthy, drive a feature and keep the evidence. `features/` is the feature map: one file per user-facing feature, with the route, how to reach it, the Playwright command and the expected result.

Made with pstack `/create-verification-skill`. It adds no scripts: it uses `npm run dev` (cf dev), the Cloudflare local explorer API, and the Playwright specs already in `e2e/`.

## Keeping the map true

Run `/maintain-verification-skill` after a change that adds, moves or removes a page, an app section, an API route or a user journey. It reads the source for each feature, drives every feature once in a live session, and opens at most one PR with proven corrections. A map row that no longer matches the app is a bug in the map.

When you add a feature by hand, follow the four-heading shape in `features/README.md`.

## Switching it off

Delete `.claude/skills/verify/` and the `verify-evidence/` line in `.gitignore`. Nothing else depends on it.
