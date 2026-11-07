# SEO Fix Kit launch video script

- Target length: 60-90 seconds spoken. The lines below are 156 spoken words: about 1:02 at 150 words a minute, about 1:12 at 130, about 1:18 at 120.
- Audience: a founder or site owner whose site runs on JavaScript and who is tired of generic audit noise.
- Format: voice-over over screen recordings of the live site. No invented users, logos, numbers or results.
- Rule for this script: every spoken claim is listed under "Claim sources" with the file and line, or the live URL, it comes from. Read that list before recording.

## Script

**[0:00-0:06 | On screen: the homepage hero, "An SEO audit that checks its own work."]**

JavaScript site, false alarms? SEO Fix Kit audits every page in a real browser.

**[0:06-0:16 | On screen: a page loading in a browser, raw HTML next to the rendered page]**

It loads your pages the way Google renders them, so problems that disappear once JavaScript runs are dropped instead of reported.

**[0:16-0:32 | On screen: the report list, then the "Find, Fix, Confirm" steps]**

Every problem you keep comes with the pages it affects, the evidence, and the code to paste. Ship the fix, rerun the same audit, and each problem is marked fixed, still open, or new.

**[0:32-0:45 | On screen: the repair queue and the score history]**

Our founder's own portfolio site had seven problems. Two small changes fixed all of them. The same audit, on the same host, went from 85 to 99 to 100.

**[0:45-0:58 | On screen: the account form and the repair queue]**

Want the whole site? An account audits up to 1,000 pages, keeps every report, and gives you a repair queue to assign, approve and track each fix.

**[0:58-1:12 | On screen: the free page check form]**

Next step: paste any public URL into the free page check. No account, no card. It shows what is actually wrong on that one page, and which warnings do not apply.

**[End card: seofixkit.com/check]**

## Claim sources

1. "JavaScript site, false alarms? SEO Fix Kit audits every page in a real browser."
   - Who it is for: `docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md:24` - "**ICP:** JavaScript-heavy SaaS founder whose site is prone to static-crawler false positives"; `docs/research/2026-08-09-founder-led-icp-acquisition-experiment.md:27` - sites in this ICP routinely get "missing content" findings from static crawlers.
   - The false alarms: `worker/routes/pages.js:723-725` - "Scanners that read only raw HTML flag problems on JavaScript sites that are not really there"; `shared/site-nav.js:22-24` - the "JavaScript sites" entry, "Compare raw HTML with the rendered page".
   - What it does: `src/pages/LandingPage.jsx:108` - "An SEO audit that checks its own work."; `src/pages/LandingPage.jsx:111` - "We load every page in a real browser"; `README.md:13` - "Rendered-page audit powered by Cloudflare Browser Run in the Worker"; `README.md:3` - "SEO Fix Kit is a proof-backed SEO repair tool".
   - Live: <https://seofixkit.com/> and <https://seofixkit.com/rendered-vs-static-seo-audit>.
2. "It loads your pages the way Google renders them, so problems that disappear once JavaScript runs are dropped instead of reported."
   - `src/pages/LandingPage.jsx:15` - "Each page loads in a real browser, the way Google renders it. Problems that disappear once JavaScript runs are dropped"; `src/pages/LandingPage.jsx:191-194` - "False alarms filtered out"; `worker/routes/public-check.js:434-435` - "False alarms ruled out"; `README.md:14` - "Static HTML vs rendered DOM comparison".
3. "Every problem you keep comes with the pages it affects, the evidence, and the code to paste."
   - `src/pages/LandingPage.jsx:20` - "Every problem lists the pages it affects, the evidence, and the code to paste"; `src/pages/LandingPage.jsx:315` - "Problems in fix-first order, with severity, evidence from the rendered page and the snippet to paste"; `README.md:32-33` - "Generated fix snippets" and "Copyable developer repair brief".
4. "Ship the fix, rerun the same audit, and each problem is marked fixed, still open, or new."
   - `src/pages/LandingPage.jsx:25` - "Ship the fixes, then rerun the audit. Each problem is marked fixed, still open or new"; `src/pages/LandingPage.jsx:154-155` - "Rerun" and "marks each problem fixed, open or new"; `README.md:20` - audit history deltas showing "fixed, new, and still-open proven issues".
5. "Our founder's own portfolio site had seven problems. Two small changes fixed all of them."
   - `src/pages/LandingPage.jsx:237` - "Our founder's portfolio site had 7 problems. Two small changes fixed all of them"; `worker/routes/pages.js:1154` - "our founder's own portfolio site, Tiny Studio, published here with consent"; `docs/growth/2026-06-20-tinystudio-before-after.md:13` - "Findings: 7".
6. "The same audit, on the same host, went from 85 to 99 to 100."
   - `src/pages/LandingPage.jsx:246-248` - "Before" 85 with "7 problems", "After fix 1" 99 with "2 problems", "After fix 2" 100 with "0 problems"; `worker/routes/pages.js:1154` - "the same audit ran on the same host before and after each one"; `docs/growth/2026-06-20-tinystudio-before-after.md:11` (85), `:49` (99), `:65` (100); `README.md:46` - "85/7 → 99/2 → 100/0 across the same measurement path".
   - Live receipt: <https://seofixkit.com/proof>.
7. "An account audits up to 1,000 pages, keeps every report, and gives you a repair queue to assign, approve and track each fix."
   - `src/pages/LandingPage.jsx:76` - "Up to 1,000 pages per audit, saved reports and a repair queue. Free during the beta."; `src/pages/LandingPage.jsx:142-143` - "1,000" and "pages per audit"; `src/pages/LandingPage.jsx:150-151` - "$0" and "to audit during the beta"; `src/pages/LandingPage.jsx:298` - "Create a free account to audit up to 1,000 pages, keep every report"; `src/pages/LandingPage.jsx:33` - "Assign each fix, leave notes, approve changes, and track it until a rerun confirms it"; `README.md:16` - "Self-serve crawl-depth tiers up to 1,000 pages per queued audit"; `README.md:34` - "Persistent repair queue records for saved reports".
8. "Next step: paste any public URL into the free page check. No account, no card."
   - `worker/routes/public-check.js:417` - "Paste a public URL"; `worker/routes/public-check.js:415` - "Free page check · No account needed"; `src/pages/LandingPage.jsx:429` - "Free for any public page. No account, no card."; `README.md:45` - "Public anonymous one-page URL check at `/check`".
   - Live: <https://seofixkit.com/check>.
9. "It shows what is actually wrong on that one page, and which warnings do not apply."
   - `worker/routes/public-check.js:417` - "show what is actually wrong, plus the warnings that don’t apply"; `worker/routes/public-check.js:438-439` - "Real problems only" and "Only issues backed by evidence are reported"; `worker/routes/public-check.js:447-448` - "What this check does not claim" and "This is one public page at one moment".

Not claimed in this script, on purpose: rankings, traffic, indexing, AI citations or revenue (`src/pages/LandingPage.jsx:67`, `worker/routes/public-check.js:448`), live AI-engine sampling (`README.md:47`), and any customer or user count - this repo records no public customer count to cite.

## Pacing references

Two reference videos for pacing only. They are not committed to this repo and nothing from them is copied into the script; both are linked so a director can watch the rhythm before recording.

1. "Introducing Superhuman" - Superhuman HQ - <https://www.youtube.com/watch?v=4XKq7qGnJus> (1:01). Use it for the shape: one line on who it is for, one proof beat, one call to action, no feature list.
2. "Meet Notion Mail" - Notion - <https://www.youtube.com/watch?v=54l-1NfXnX8> (1:01). Use it for the delivery pace: short sentences, one screen change per line, ending on a single next step.

## Recording notes

- 156 spoken words is about 1:12 at 130 words a minute, so the read lands inside 60-90 seconds. The timecodes above assume that pace. If it runs long, cut "and the code to paste" and the "Want the whole site?" line; both have their own entry in the claim list, so the remaining lines stay sourced.
- Film only the live site. No stock dashboard footage, no invented dashboards, no third-party logos.
- Keep the closing card on `seofixkit.com/check` for the full end card, and leave pricing out of this cut.
