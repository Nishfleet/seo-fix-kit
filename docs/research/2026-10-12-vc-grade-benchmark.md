# VC-grade benchmark and gap list (2026-10-12)

Benchmarked seofixkit.com (main + PR #246/#248 stack) against Linear, Vercel-style
dev tools, Supabase, Attio, Retool, Better Stack, Ploy, Intercom, Webflow and
HoneyBook using Mobbin (sections and screens, web).

References:

- Linear hero, product shot below the fold line: https://mobbin.com/sites/sections/f1148b2c-af7e-451c-a2a4-3f8740f58596
- Linear bento features with live UI snippets: https://mobbin.com/sites/sections/2bf6ad95-a30f-4623-9d10-b243918e1a9b
- Supabase hero with ambient glow: https://mobbin.com/sites/sections/0eb5722a-4576-49bd-9d04-b2d9556690fc
- Attio feature cards with line illustrations: https://mobbin.com/sites/sections/9038df26-d13c-4c95-98d5-62ba4fd5fad3
- Better Stack URL/email-first hero: https://mobbin.com/sites/sections/c48b3c8a-7a33-469a-9676-9eb199290dd3
- Ploy "paste your URL" hero: https://mobbin.com/sites/sections/d1ceb5b3-ac9c-4125-b73a-46e896d0f4ad
- HoneyBook pricing ("Includes all X, plus"): https://mobbin.com/sites/sections/0f227019-e479-41c4-84ad-3cf6c8bff53e
- Descript / MagicPath sign-in: https://mobbin.com/screens/bc48db6d-6307-41ed-a2fa-5d84b9a902f3

## Where we already match

- Dark, restrained palette with one accent; Inter self-hosted.
- Plain, honest copy ("SEO fixes you can prove.") with no invented social proof.
- Email-first sign-in in one card (matches Descript, Dropbox Dash).
- Real FAQ, real before/after proof, clear free vs paid split.

## Gaps (ordered by how much they move "feels expensive")

1. **No motion at all.** Best-in-class sites use quiet entrance fades, hover lift
   and press feedback. We have none, and nothing respects reduced motion because
   nothing moves.
2. **Display type reads heavy.** We use weight 700 at 84px. Linear/Vercel use 500-600
   with tight tracking (-0.03 to -0.04em), balanced line breaks and a soft
   ink-to-muted gradient on the headline. Our h1 on /check wraps to an orphan "it.".
3. **Flat lighting.** No ambient glow or texture behind the hero; the product
   card sits on a flat black. Supabase/Linear use a soft radial light plus a
   faint grid or noise.
4. **Header.** Not sticky, no blur, no hairline on scroll. On mobile the links
   wrap into a second row instead of a proper menu button.
5. **Feature cards are text-only and identical.** Attio/Linear give each card a
   small line illustration or live UI fragment. Ours are six equal text boxes.
6. **Pricing repeats every feature in every card.** Best practice is
   "Everything in Page check, plus:" so the difference is obvious at a glance.
7. **Inconsistent eyebrows.** "Pricing" (sentence case) on the landing vs
   "PRICING" (caps, tracked) on /pricing and /check. Pick one.
8. **Thin elevation and radius system.** One radius (8px), no shadow scale, no
   focus ring token. Cards, inputs and buttons do not feel like one family.
9. **404 page** is functional but bare; no brand moment.
10. **No browser end-to-end suite.** Behaviour tests exist (node:test + Playwright
    for the SPA with a mocked API) but nothing walks the real stack (Worker +
    database + SPA) on desktop and mobile through sign-up, dashboard, pricing,
    free check and 404.

## Plan

- Batch 1 (this PR): design tokens v2 (type, radius, elevation, motion, focus),
  sticky blurred header with mobile menu, ambient hero lighting, display type,
  scroll-reveal and hover motion with reduced-motion support, consistent
  eyebrows, feature-card icons, pricing "plus" lists, 404 polish, and a
  Playwright e2e suite against the real Worker on desktop and mobile.
- Batch 2: signed-in app (dashboard, report, billing) on the same tokens,
  emails, empty and error states, performance budget in CI.
