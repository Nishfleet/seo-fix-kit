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

## The real engine against a public URL

```bash
curl -s -m 60 -X POST http://localhost:5173/api/public-check -H 'content-type: application/json' -d '{"url":"https://example.com"}' -w '\n[%{http_code} %{time_total}s]\n'
```

One page check of a reachable site returns the report payload (`ok: true`, `mode: "one-page-check"`, `engineVersion`) in well under a minute.
On a dev box whose runtime has no working outbound route it stops after about 8 s and names the missing local capability (measured 2026-11-05):

```text
{"error":"The page check is not available right now: this server cannot reach the internet, so it cannot open that address. Restore outbound internet access on the machine running the check and try again."}
[503 8.2s]
```

## Gotchas

- The spec answers `/api/public-check` with a fixture, so it proves the page, not the audit engine.
- A real check that never answers (2026-11-04: still running after 120 s while `/api/health` reported `browserRun: true`) is the broken-egress signature, not a browser problem. The check's DNS safety lookup is its first outbound fetch; each A/AAAA lookup is now bounded at 4 s, so a runtime with no working route returns the 503 above after ~8 s instead of hanging through every later fetch and browser timeout. Read the Local Explorer `logs`/`spans` for the request, not the health response.
- Why it hung here: this container advertises IPv6 and drops the packets, while the runtime resolves dual-stack hosts to the AAAA address and does not fall back to IPv4. IPv4-only hosts answer fast (`https://api.ipify.org/` took 120 ms from inside the Worker), dual-stack hosts (`https://example.com/`, `https://cloudflare.com/`) hang until aborted, so "the machine has internet but the check hangs" is the normal signature of that network.
