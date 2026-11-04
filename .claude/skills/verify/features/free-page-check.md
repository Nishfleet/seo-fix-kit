# Free page check

A visitor types a public page address on `/check`, gets a report card for that page, and can carry the same page into sign-up without retyping it.

## Sub-features

- `check-run` `Check this page` returns a result card headed by the host name.
- `check-handoff` `Get the full report for <host>` leads to sign-up with the page kept.
- `check-private` a private or internal address is refused.

## How to get to it (user POV)

- Choose `Check a page` in the header, or open `/check`.

## Driving it with Playwright

Preconditions:

- `npm run build` has run.

- **Run a check and hand off.** Run `npx playwright test e2e/stranger-path.spec.mjs --project desktop --trace on --output verify-evidence/$RUN_ID`. The field `Public page URL` takes the address, `Check this page` shows the heading `acme-widgets.example`, and the hand-off link leads to the `Email` field and then to `Overview` after sign-in.
- **Private address refused.** Run `curl -s -X POST "$BASE/api/public-check" -H 'content-type: application/json' -d '{"url":"http://10.0.0.1/"}'`. The body is `{"error": "Use a public website URL, not a private or local address."}`.

## Gotchas

- The spec answers `/api/public-check` with a fixture, so it proves the page, not the audit engine.
- A real check of a public page on the dev server gave no answer within 120 s (2026-11-04). The cause is not known yet (health still reports `browserRun: true`). Report a real-engine check as unverified locally, and prove it on the PR preview instead.
