# The stranger's first five minutes, walked side by side with the leaders

Issue #420, walked live 2026-11-12. One test URL for every product:
`https://seofixkit.com/fixture/rendered-page`. Phone width 390×844, desktop
1440×900, headless Chromium (Playwright 1.64, Chrome UA). Screenshots in this
folder; judgment taken from DOM transcripts (headings, first-viewport text,
form contracts), not from the pixels, so the record is checkable.

## The path, per product

Steps: landing → free check entry → result → account ask → first full report.

| Step | SEO Fix Kit (live) | Rank Prompt | ChatSEO | SEOptimer | Custom Web Audits |
|---|---|---|---|---|---|
| Landing | Hero check form, proof ticker, $0 framing | Rich AI-visibility story; hero form "Analyze free" | Site down (Cloudflare "DNS points to prohibited IP", HTTP 403, 2026-11-12) | Unreachable from an automated walk: Cloudflare bot wall ("Performing security verification") | Hero form "Get my free score →", one-time vs monitoring framing |
| Free check entry | /check form, no account | Hero form POSTs to `app.rankprompt.com/signup` — account wall before any result | n/a (down) | n/a (blocked) | Same-page form, posts to `/audit-url` |
| Result | Real browser render, score, problems with fixes, false alarms ruled out, competitor compare — after a wait, and below the form (fixed, see below) | Never shown without an account | n/a | n/a | `/audit-preview`: "Here's a first look at {domain}" with anchor nav (Overall score, Opportunities, Google preview, Social preview, Tech stack, AI content readiness) |
| Account ask | After the result, optional (`/beta?url=…` carries the URL, no retyping) | Email/Google wall before the result | n/a | n/a | Post-result "Not ready? Email me these results" |
| First full report | Free beta site audit after email sign-in | First report free after signup | n/a | n/a | One paid audit or monitoring |

### What each rival does better than us (the honest list)

- **Rank Prompt**: Google sign-in on the account step (one tap vs our emailed
  link); a "Free AI visibility tools" section; per-industry landing pages. Its
  check itself is weaker for the stranger: no result without an email.
- **Custom Web Audits**:
  1. The result page reads like a report with a personal headline ("Here's a
     first look at {domain}") and in-page anchor nav, so the stranger can jump
     to previews and checks. Ours was a bare domain heading in one long card.
  2. It shows how you look in Google and when your link is shared — tangible
     previews. We show measured facts and findings instead.
  3. A post-result "email me these results" keeps the outcome for people not
     ready for an account. We deliberately do not copy this: the check page
     promises "no account, no email, nothing stored", and the anonymous
     surface stores nothing. The account hand-off (URL carried over) is our
     persistence path.
  4. "Demo Audit" in the header nav — a no-input way to see the whole product.
- **SEOptimer / ChatSEO**: not walkable on 2026-11-12 (bot wall / site down).
  Recorded as such; re-walk them before the #415 merge re-walk.

### Where the stranger hesitated on ours (and the fixes)

1. **The wait ends off-screen.** The result (and the loading card) render
   below the check form and intro; at phone width the first screen after the
   click still shows the old form. The stranger does not know the wait ended.
   Fixed in `shared/public-check/client.js`: scroll the loading card into
   view when the check starts; when the result or an error arrives, scroll it
   into view and move keyboard focus to the result region (`tabindex="-1"`
   added to `#result` in `worker/routes/public-check.js`). Verified: focus
   lands on `#result`, scrollY 593/first screen shows the result.
2. **The result headline was a bare domain.** Changed to "First look at
   {domain}" (matches how the rivals headline a result; keeps the domain).
3. **Wording that sounded like a gate before the first value.** The form
   note led with the rate-limit detail ("Rate-limited per network and per
   site… Use only pages you own or are authorized to audit") and the
   authorization sentence sat between the stranger and the button. The note
   now leads with "Free" and keeps the rest short: "Free. One page per
   check; only short-lived rate-limit counters are kept. Check only pages
   you own or are authorized to audit." The authorization sentence stays
   beside the button and is repeated in the "What this check does not
   claim" band. Truth guards updated in `worker/routes/pages.test.mjs`.
4. **Errors were not announced.** Error boxes now carry `role="alert"` (client
   validation, failed check, failed compare), so screen readers announce them
   immediately; verified `alert` attribute and on-screen visibility.
5. **Blocked clipboard left the stranger stuck.** When
   `navigator.clipboard` fails (permissions on some browsers), the copy
   buttons now fall back to a hidden textarea + `execCommand("copy")`, so the
   markup and the AI fix prompt can still be copied without retyping.
6. **Landing contrast.** Lighthouse found the platform marquee at 4.2:1
   (`opacity: .55` over ink). Raised to 0.62 → 5.36:1, inside the design
   system tokens (`src/pages/landing.css`).
7. **Landing `dl` was invalid.** `dl.landing-proof-scores` held spans as
   direct children of its `div` groups; the bar and count moved into the
   `dd`, and the `dd` became the grid so the layout is unchanged.
   Accessibility category: 94 → 100 (see Lighthouse below).

Not changed, on purpose: the post-result email capture (breaks the
no-storage promise), the check intro (the form is the page's purpose; the
result now takes the first screen), and any redesign (gate: craft inside the
current system).

## Accessibility record (task step 4)

- Keyboard path after a result (Tab order, verified both widths):
  handoff link → Copy markup → Copy AI fix prompt → competitor URL input →
  Compare → account CTAs → header. Focus rings come from the design system
  (`:focus-visible`, 2px accent outline).
- Screen-reader labels: score has `aria-label="Score N out of 100"` with the
  visible digits `aria-hidden`; crawler chips carry per-bot labels ("ChatGPT
  search: blocked by robots.txt"); the result region is `aria-live="polite"`
  and now receives focus on completion; errors are `role="alert"`.
- Contrast, computed (WCAG relative luminance, light theme):
  ink-muted 62% on bg 5.36 · ink-soft 8.31 · warning-on-warning-surface 5.38 ·
  error-on-error-surface 5.86 · info 6.19 · success-on-success-surface 4.78 ·
  white on primary button 5.33 — all pass AA. The only failing pair on the
  landing (platform marquee, 4.2) was fixed to 5.36.

## Lighthouse (production, phone emulation, 2026-11-12)

- `/check`: **100 / 100 / 100 / 100** (performance, accessibility,
  best-practices, SEO).
- `/` landing: performance **99**, accessibility **100** (was 94),
  best-practices **100**, SEO **100**.
- The remaining performance point is the SPA bundle's main-thread work
  (3.7 s, first contentful paint 1.6 s against the 1.5 s threshold for a
  1.00 FCP score). That is a performance-engineering item (splitting the
  landing render), not a design change; left for a dedicated ticket rather
  than risk the no-redesign gate here.

## Before / after

- `before-landing-*.jpg`, `before-check-result-*.jpg`: production
  seofixkit.com, 2026-11-12.
- `after-landing-*.jpg`, `after-check-result-*.jpg`,
  `after-check-error-*.jpg`: this branch's build served by the repo's e2e
  Worker (`e2e/server.mjs`), with the check API intercepted by the same
  payload the e2e suite uses, so the result content matches the before shot.
- `rival-*.jpg`: the competitor evidence from the table above.

## Re-walk note

The result page is changing under #415; this walk judges what is live on
2026-11-12. Re-walk ours (and SEOptimer/ChatSEO, which were not walkable)
once #415 merges.
