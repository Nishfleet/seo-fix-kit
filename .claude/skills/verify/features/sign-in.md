# Sign-in and app sections

An owner asks for a sign-in link by email, opens it once, lands on `Overview`, moves through every app section, and signs out. A used link signs nobody in again.

## Sub-features

- `signin-link` `Email me a sign-in link` sends a link, and the link opens `Overview`.
- `signin-once` a used link does not work a second time.
- `app-sections` each of `Overview`, `Reports`, `Sites`, `Alerts & API`, `Billing` opens with `aria-current="page"` on its nav link.
- `signout` `Sign out` returns to the sign-in form, and `/beta/reports` stays locked.

## How to get to it (user POV)

- Open `/beta`, or choose `Start free` on the homepage.

## Driving it with Playwright

Preconditions:

- `npm run build` has run. This feature runs only on the test server, because the dev server has no email.

- **Sign in and visit every section.** Run `npx playwright test e2e/account.spec.mjs -g "returning user" --project desktop --trace on --output verify-evidence/$RUN_ID`. The heading `Overview` appears after the link, each section heading appears, and `Email me a sign-in link` is back after `Sign out`.
- **One-use link.** Run `npx playwright test e2e/account.spec.mjs -g "used sign-in link"`. A second browser that opens the same link sees the sign-in form, not `Overview`.

## Gotchas

- The link comes from `GET /__e2e/emails?to=<email>` on the test server. It does not exist on the dev server or in production.
- The form has a bot timer. `typeLikeAPerson` moves the page clock forward 3 s before submit.
- On the phone project the account email is hidden. Assert it on desktop only.
