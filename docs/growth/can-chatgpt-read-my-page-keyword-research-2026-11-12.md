# Keyword research: "Can ChatGPT read my page?"

**Issue:** #403 - Free tool: Can ChatGPT read my page?
**Researched:** 2026-11-12
**Search engine:** DuckDuckGo (web index), scraped headlessly with the
Playwright/Chromium adapter in `server/audit/playwright-browser.js`.

Twenty searches were run (ten organic results each). The scraped result rows are
not kept here: they are a snapshot of one engine on one day, they go stale, and
they add nothing a reader of this repo can act on. What follows is the part that
shaped the page.

## The query set

The tool answers one question a site owner asks out loud: *can ChatGPT read my
page?* The searches covered that question and the two neighbouring intents a
searcher actually types: the same question about Claude and Perplexity, and the
`robots.txt` / AI-crawler-access variant that ranks for the same need.

- **The question:** `can chatgpt read my page`, `can chatgpt read my website`,
  `check if chatgpt can read my site`
- **The tool:** `ai crawler checker`, `ai crawler access checker free`,
  `chatgpt robots.txt checker`, `gptbot robots.txt allow`,
  `perplexity crawler robots.txt check`, `can ai bots read my site`
- **The diagnosis:** `why can't chatgpt read my website`
- **The outcome:** `is my site visible to chatgpt`, `is my site visible to ai crawlers`
- **One bot at a time:** `can claude read my website`,
  `can claude bot read my website robots txt`, `perplexitybot allowed my site`
- **Adjacent:** `chatgpt read my page free tool`, `ai readiness checker free`,
  `openai crawler allow my site`, `does perplexitybot have access to my website`,
  `can chatgpt read my page seo tool`

## What the ranking pages do, and where the gap is

- **The word "tool" is not in most ranking titles.** The pages that rank for
  `can chatgpt read my page` are blog posts ("How to check in 60 seconds",
  "3 Free Tests You Can Run Today"). The dedicated tools that do rank
  (`aicrawlercheck.com`, `crawlercheck.com`, `centium.ai/tools/ai-crawler-checker`,
  `checkvibe.dev`, `aigeokit.com/tools/ai-robots-txt-checker`) rank on the
  `robots.txt` / `ai crawler checker` head, not on the plain question.
- **The intent split is clean.** `can chatgpt read my page` is the question.
  `ai crawler checker`, `chatgpt robots.txt checker` and `ai crawler access checker free`
  are the tool. `why can't chatgpt read my website` is the diagnosis.
  `is my site visible to chatgpt` and `is my site visible to ai crawlers` are the
  outcome, and the ranking pages there are *visibility checkers* that score
  citations, not pages.
- **The bot-specific head has its own set of rankers.** `can claude bot read my
  website robots txt` and `perplexitybot allowed my site` rank vendor
  documentation (`support.claude.com`, `docs.perplexity.ai`) and *blocking* guides
  (`cside.com`, `robotstxtstudio.com`, `robotstxtlab.net`) rather than checkers.
  The demand in these searches is "how do I check one bot", which is what the
  three-bot table answers in a single run.
- **The gap this tool fills.** Almost every ranking page either (a) teaches the
  reader to open `robots.txt` by hand, or (b) scores "AI visibility" by sampling
  live answer engines. None of them show, from the page's own raw HTML, whether the
  main content and the JSON-LD schema are actually present in the bytes the crawler
  receives. That is the check this page runs, and it is the one thing a site owner
  can act on directly.
- **The honest boundary is a ranking asset.** The competitors that sample live
  engines (`ai-visibility-checker.io`, `hostinger.com/ai-visibility-checker`,
  `amivisibleonai.com`) are the ones whose pages make claims this product refuses to
  make. The page states plainly that it does not sample answer engines, track
  citations or promise rankings.

## How the tool's own page targets these searches

| Search intent | Where this page answers it |
| --- | --- |
| `can chatgpt read my page`, `can chatgpt read my website` | The H1 and the answer itself: the verdict line says whether the crawlers can read the page, with the robots.txt rule as evidence. |
| `chatgpt robots.txt checker`, `gptbot robots.txt allow`, `perplexity crawler robots.txt check` | The crawler table shows GPTBot, ClaudeBot and PerplexityBot with the exact matching robots.txt line, allowed or blocked. |
| `ai crawler checker`, `ai crawler access checker free`, `can ai bots read my site` | The same table plus the raw-HTML evidence block: words, H1, title and JSON-LD types. |
| `why can't chatgpt read my website` | The verdict names the cause: blocked by robots.txt, or allowed but thin in the raw HTML. |
| `is my site visible to chatgpt`, `is my site visible to ai crawlers` | Answered without overclaiming: allowed to read is not the same as cited. |
| `can claude bot read my website robots txt`, `perplexitybot allowed my site` | One run returns all three crawlers with the matching robots.txt line for each, so a single-bot question is answered without a second visit. |

Page: `https://seofixkit.com/can-chatgpt-read-my-page`
Title: `Can ChatGPT Read My Page? - SEO Fix Kit`
Description: `Check if ChatGPT, Claude and Perplexity can read your page. See the robots.txt rules and the raw HTML they receive. Free, no account, nothing stored.`

## Next measurement

This is the first tool in the set. Do not build a second one until the first has
visits: check `GET /admin/funnel?windowDays=7` and the page's own visit count before
starting the next tool.
