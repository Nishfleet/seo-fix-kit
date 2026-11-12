# Reports and fix files

A signed-in owner opens a saved report, filters its problems by severity, jumps from a top fix to its proof, and downloads the fix files free from the report. No payment or checkout step exists; Dodo checkout is switched off by config (`FIX_PACK_CHECKOUT_ENABLED`).

## Sub-features

- `report-list` `/beta/reports` lists the report with its problem counts.
- `report-filter` the `Filter problems by severity` group narrows the list.
- `report-jump` a `Fix these first` link opens that problem's evidence.
- `fix-files-download` `Download fix files (.zip)` on the report downloads the fix bundle without any payment.

## How to get to it (user POV)

- Sign in, choose `Reports`, then a report row.

## Driving it with Playwright

Preconditions:

- `npm run build` has run. Test server only. The spec seeds a report with `POST /__e2e/reports`.

- **Read and filter a report.** Run `npx playwright test e2e/account.spec.mjs -g "report lists every problem" --project desktop --trace on --output verify-evidence/$RUN_ID`. The heading `All problems (6)` shows 6 rows. `Warnings` leaves 2 rows. `Missing H1 on /pricing` reopens `All` and shows its `Evidence`.
- **Download the fix files free.** Run `npx playwright test e2e/payments.spec.mjs --project desktop --trace on --output verify-evidence/$RUN_ID`. The report shows `Get every fix ready to ship — free`, no price and no buy button anywhere, and the zip downloads without a payment step.

## Gotchas

- Fix files are free for any signed-in owner of the report; another owner's report still answers 404.
- Legacy paid Fix Pack rows (`paid_owners`, `fix_requests`) stay untouched; no refunds are triggered by the switch to free.
- `FIX_PACK_CHECKOUT_ENABLED=1` is the only way checkout could return; it is not set in the test server env.
