# SEO Fix Kit verification map

The maintained source for proving SEO Fix Kit's user-facing behaviour. Read this index, then use the matching feature file as the recipe. The skill (`../SKILL.md`) says how to launch, check and clean up.

## Baseline preconditions

- Public pages and APIs: the dev server from `npm run dev` passes the doctor in `../SKILL.md`. `$BASE` is the URL on its `Local:` line.
- Browser journeys: `npm run build` has run since the last source change. Playwright starts the test server at `http://127.0.0.1:4321` with a fresh database.
- Never drive an instance this run did not start.

## Driving conventions

- Harness: Playwright specs in `e2e/`, run with `npx playwright test <spec> -g "<title>" --project desktop --trace on --output verify-evidence/$RUN_ID`.
- Prefer ARIA roles and accessible names. Take route lists from `ROOT_PUBLIC_PATHS` and `APP_SECTIONS`, not from memory.
- Each email address is unique per test (`uniqueEmail` in `e2e/fixtures.mjs`), so runs never share an account.

## Proof and skip reporting

- Give the feature ID, the entry point, the command and the evidence path for each proof.
- A write needs a second read: the next screen, a reload or a D1 row.
- Report an unreachable path with the command and the unmet precondition. Never report a skipped entry point as verified through a different one.

## Feature entry contract

Each file has an H1, one paragraph, then four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Public site](./public-site.md): marketing pages, shared header and footer, no-JavaScript reading.
- [Free tools](./free-tools.md): the `/tools` generators and testers.
- [Free page check](./free-page-check.md): `/check` result card and the hand-off to sign-up.
- [Sign-in and app sections](./sign-in.md): email link sign-in, the five app sections, sign-out.
- [Reports and Fix Pack](./reports-fix-pack.md): the report view, filters, top fixes, and buying a Fix Pack.
