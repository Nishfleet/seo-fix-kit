# Reports and Fix Pack

A signed-in owner opens a saved report, filters its problems by severity, jumps from a top fix to its proof, and buys a Fix Pack that the report then shows as paid.

## Sub-features

- `report-list` `/beta/reports` lists the report with its problem counts.
- `report-filter` the `Filter problems by severity` group narrows the list.
- `report-jump` a `Fix these first` link opens that problem's evidence.
- `fixpack-buy` `Buy Fix Pack` opens checkout, and the report shows `Payment confirmed` after payment.

## How to get to it (user POV)

- Sign in, choose `Reports`, then a report row.

## Driving it with Playwright

Preconditions:

- `npm run build` has run. Test server only. The spec seeds a report with `POST /__e2e/reports`.

- **Read and filter a report.** Run `npx playwright test e2e/account.spec.mjs -g "report lists every problem" --project desktop --trace on --output verify-evidence/$RUN_ID`. The heading `All problems (6)` shows 6 rows. `Warnings` leaves 2 rows. `Missing H1 on /pricing` reopens `All` and shows its `Evidence`.
- **Buy a Fix Pack.** Run `npx playwright test e2e/payments.spec.mjs --project desktop --trace on --output verify-evidence/$RUN_ID`. `Buy Fix Pack` opens `Dodo test checkout`. After the fake payment, the report shows `Payment confirmed`.

## Gotchas

- Checkout uses the test server's fake Dodo (`/__e2e/dodo/pay`). Real payments are never driven locally.
- Paid perks (branded reports, report domains, audit widget) unlock only for a non-test paid order.
