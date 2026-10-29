# SEO Fix Kit — launch video (72 s)

Silent film: on-screen text only, no voiceover and no music bed. Assembly is
`index.html` (HyperFrames, 1920×1080, 30 fps, 72 s).

Every line below is on screen in the render. Every factual claim is listed with
its source in the PR body, not repeated here.

| # | Time | On screen | Notes |
| - | ---- | --------- | ----- |
| 1 | 0.0–7.0 | **An SEO audit that checks its own work.**<br>For sites that need clear fixes, not generic audit homework.<br>Small business sites · JavaScript sites · AI search readiness | Says who it is for and what it does inside the first five seconds. |
| 2 | 7.0–16.5 | Homepage screen, lower third: **We load every page in a real browser.** | Real capture of seofixkit.com at 1920×1080. |
| 3 | 16.5–26.0 | Sample-report screen, lower third: **Basic scanners read only the raw HTML.** | Real capture of seofixkit.com/demo. |
| 4 | 26.0–35.5 | **3** / raw HTML: 3 words<br>**277** / rendered by the browser: 277 words | Two numbers from the same demo report. |
| 5 | 35.5–44.5 | Free-check screen, lower third: **Only issues backed by evidence.** | Real capture of seofixkit.com/check. |
| 6 | 44.5–56.5 | Case-study screen, lower third: **A founder's site: 85 → 99 → 100.** | Real capture of seofixkit.com/proof. |
| 7 | 56.5–63.5 | **Then rerun.**<br>Each problem is marked fixed, or still open. Nothing guessed, nothing left as homework. | |
| 8 | 63.5–72.0 | **Check one public page free.**<br>No account. No card. No stored report.<br>seofixkit.com/check | Closing card on flat background. |

## Design notes

- Type: Inter for headlines, JetBrains Mono for labels, both embedded as WOFF2
  so the render does not depend on network fonts.
- Colour and spacing come from the live site's own CSS variables (`#070908`
  background, `#fbf8ef` ink, `#98f0cc` accent, `#d6b15f` gold).
- Screenshots are real 1920×1080 captures of the live pages, taken with headless
  Chrome. No mock-ups, no invented numbers, no invented quotes.
- Lower thirds sit on an opaque band, so caption text never rests on page copy.

## Rebuild

```
bunx hyperframes@0.8.217 check    # 0 errors
bunx hyperframes@0.8.217 render . -o launch-video.mp4 --quality delivery
```
