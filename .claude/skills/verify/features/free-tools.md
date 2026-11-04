# Free tools

The `/tools` index links every free generator and tester. Each tool updates its output as the user types, copies or downloads the result, and reads without JavaScript.

## Sub-features

- `tools-index` the index links to every tool, and the header links to the index.
- `tools-live` the meta tag generator updates its verdict as you type.
- `tools-copy` `Copy` turns into `Copied`.
- `tools-download` generated files download with their real file name.
- `tools-checklist` checklist ticks survive a reload.

## How to get to it (user POV)

- Open `/tools`, then pick a tool, for example `/tools/meta-tags` or `/tools/robots-txt-tester`.

## Driving it with Playwright

Preconditions:

- `npm run build` has run.

- **Type and see the verdict.** Run `npx playwright test e2e/tools.spec.mjs -g "meta tag generator" --project desktop --trace on --output verify-evidence/$RUN_ID`. After `Page title` gets a long title, the output shows `Over 60 usually gets cut off`. After `Canonical URL` gets `/relative`, it shows `1 thing to fix`. `Copy` becomes `Copied`.
- **All tools.** Run `npx playwright test e2e/tools.spec.mjs`. Every test passes.

## Gotchas

- Clipboard checks need the clipboard permission, which the spec grants. Do not copy the step into a context without it.
