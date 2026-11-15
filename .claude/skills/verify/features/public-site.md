# Public site

Every public page serves a 200 with one headline, the shared header and footer, a description, and no sideways scroll. The homepage reads without JavaScript.

## Sub-features

- `public-render` every path in `ROOT_PUBLIC_PATHS` renders with one `h1` and the shared chrome.
- `public-no-js` the homepage and tools read with JavaScript off.
- `public-narrow` every page fits a 320 px screen.

## How to get to it (user POV)

- Open `/` and follow the header links (`Check a page`, `Menu`).
- Open any path from the sitemap at `/sitemap.xml`.

## Driving it with Playwright

Preconditions:

- `npm run build` has run.

- **Render every page.** Run `npx playwright test e2e/public-site.spec.mjs --project desktop --trace on --output verify-evidence/$RUN_ID`. Each path test passes: status 200, one visible `h1`, a `banner` with a `Check a page` link, a `contentinfo`.
- **No JavaScript.** Run `npx playwright test e2e/public-site.spec.mjs -g "ships its content in the HTML"`. The heading `Can Google and AI answers read your site?` is visible with JavaScript off.
- **Dev server spot check.** Run `curl -s -o /dev/null -w '%{http_code}' "$BASE/pricing"`. It prints `200`.

## Gotchas

- `/beta` is 404 on the dev server, while production answers 200 (checked 2026-11-04). Drive `/beta` on the test server.
- The homepage logo strip scrolls forever by design, and the spam-trap field sits off-screen on purpose.
