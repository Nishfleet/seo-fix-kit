---
name: verify
description: Launch SEO Fix Kit locally (the Cloudflare Worker, its D1 database and the React app) and prove a feature works the way a user sees it, with screenshots, traces, API bodies and database rows as evidence. Use before calling a change to a page, route, sign-in, report or payment flow done, and for the run-proof line of a PR.
---

# Verify SEO Fix Kit

Two local instances exist. Pick by feature; the feature map says which one each journey needs.

| Instance | Start | URL | Use it for |
|---|---|---|---|
| Dev server (real Workers runtime, local D1) | `npm run dev` | port printed on the `Local:` line, usually `http://localhost:5173` | public pages, free tools, `/api/*`, DB rows, traces and logs |
| Test server (Worker in Node, fresh in-memory D1, fake email and Dodo) | Playwright starts it from `playwright.config.mjs` | `http://127.0.0.1:4321` (`E2E_PORT`) | sign-in, the signed-in app, reports, payments |

The dev server has no email binding, so email sign-in answers 503 there, and `/beta` answers 404 under the Vite dev server. Drive signed-in features on the test server only.

## Launch

Dev server, from an empty state:

```sh
npm ci
(setsid npm run dev > /tmp/seo-verify-dev.log 2>&1 & echo $! > /tmp/seo-verify-dev.pid)
until grep -q 'Local:' /tmp/seo-verify-dev.log; do sleep 1; done
BASE=$(grep -oE 'http://localhost:[0-9]+' /tmp/seo-verify-dev.log | head -1)
```

`npm run dev` applies every D1 migration to `.cloudflare/state` first (the log lists each with a check mark), then starts `cf dev`. Ready means the `Local:` line is printed and the doctor passes.

Test server: no manual launch. `npm run build` once, then each `npx playwright test ...` below starts the server, waits for `/api/health`, and stops it. Every run gets a fresh database.

## Doctor

Run first, and again whenever something looks off. All read-only.

```sh
curl -s "$BASE/api/health"
curl -s "$BASE/cdn-cgi/local/explorer/api/d1/database"
```

Pass: health returns `"ok": true`, `"service": "seo-fix-kit"`, `"waitlistDb": true` and the `version` from `package.json`. The explorer lists `WAITLIST_DB`. If the port answers but health does not, another process owns it: stop and start your own instance on the next free port, never drive it.

## Drive

- Pages and APIs on the dev server: `curl -s -o /dev/null -w '%{http_code}' "$BASE/<path>"` and `curl -s "$BASE/api/<route>"`.
- Browser journeys: the repo's Playwright specs in `e2e/` are the harness. Run one journey with evidence:

```sh
RUN_ID=$(date +%Y%m%d-%H%M%S)
npm run build
npx playwright test e2e/<spec>.spec.mjs -g "<test title>" --project desktop \
  --trace on --output "verify-evidence/$RUN_ID" --reporter line
```

- Handles: use ARIA roles and names (`getByRole("button", { name: "Email me a sign-in link" })`), route paths from `ROOT_PUBLIC_PATHS` (`shared/audit-engine.js`) and `APP_SECTIONS` (`src/lib/app-sections.js`). Never CSS position or tab order.
- Sign-in on the test server: submit the form, then read the link from `GET /__e2e/emails?to=<email>` (`signInLinkFor` in `e2e/fixtures.mjs`). Seed a report with `POST /__e2e/reports {"ownerEmail": ...}`. These helper routes exist only on the test server, never in production.
- A new journey: add a test to the matching `e2e/*.spec.mjs` and run it as above. Do not drive the app with ad-hoc scripts.

## Evidence

- Browser: `verify-evidence/<run-id>/` holds `trace.zip` per test (open with `npx playwright show-trace <path>`), plus screenshots on failure. Add `await page.screenshot({ path: ... })` in the spec for a success screenshot.
- Database rows (dev server, read-only SQL):

```sh
curl -s -X POST "$BASE/cdn-cgi/local/explorer/api/d1/database/887316c4-ca9d-4068-a7fa-1f530b479437/raw" \
  -H 'Content-Type: application/json' -d '{"sql":"SELECT ... LIMIT 20"}'
```

- Traces and console logs (dev server): `POST $BASE/cdn-cgi/local/explorer/api/local/observability/query` with `{"sql":"SELECT name, outcome, duration_ms FROM spans WHERE parent_id IS NULL LIMIT 20"}`. Tables: `spans`, `logs`.
- Proof standards: drive the real user path (the form, the button), not a direct API call, when a user would click. Capture the action and the state after it. For a write, show the row or the second view that reads it back. Fake email and Dodo are the only mocks, because production isolates those behind their own APIs.

## Cleanup

```sh
kill -- "-$(cat /tmp/seo-verify-dev.pid)"; rm -f /tmp/seo-verify-dev.pid /tmp/seo-verify-dev.log
```

Kill only the process group you started (`setsid` made the PID its leader, so Vite and workerd stop with it). Playwright stops the test server itself. Keep `verify-evidence/` (it is gitignored); delete `.cloudflare/state` only to reset local data.

## Isolation

One dev server per checkout, because both would share `.cloudflare/state`. Two test-server runs can share a machine with different `E2E_PORT` values.

## Feature map

`features/README.md` indexes one file per user-facing feature. Keep it true: run `/maintain-verification-skill` after a change adds, moves or removes a route, a section or a journey.
