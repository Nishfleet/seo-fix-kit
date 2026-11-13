import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { buildChatgptReadResult } from "../../shared/chatgpt-read/answer-readiness.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, requestIpHash, sha256Hex } from "../lib/security.js";
import { dayWindow, hourWindow } from "../lib/text.js";
import { body, parseJsonBody, z } from "../lib/validation.js";
import { auditUrl } from "./audits.js";
import { friendlyCheckError, validatePublicCheckUrl } from "./public-check.js";
import { publicAssetHead, siteFooter, siteHeader } from "./pages.js";

export const CHATGPT_READ_PAGE_PATH = "/can-chatgpt-read-my-page";
export const CHATGPT_READ_API_PATH = "/api/chatgpt-read-check";
export const CHATGPT_READ_SOCIAL_IMAGE_PATH = "/can-chatgpt-read-og-image.png";
export const CHATGPT_READ_SOCIAL_IMAGE_WIDTH = 1200;
export const CHATGPT_READ_SOCIAL_IMAGE_HEIGHT = 630;

const ChatgptReadBody = body({ url: z.string().nullish() });

export const CHATGPT_READ_LIMITS = {
  ipHour: 6,
  ipDay: 15,
  targetHour: 3,
  targetDay: 10
};

const TITLE = "Can ChatGPT Read My Page?";
const DESCRIPTION =
  "Check if ChatGPT, Claude and Perplexity can read your page. See the robots.txt rules and the raw HTML they receive. Free, no account, nothing stored.";

const FAQ = [
  {
    q: "What does this check actually measure?",
    a: "It reads your site's robots.txt and checks whether GPTBot, ClaudeBot and PerplexityBot are allowed to fetch that URL, showing the exact rule that matched. It then looks at the raw HTML those crawlers receive and reports the word count, the H1, the title and the JSON-LD schema types found in it."
  },
  {
    q: "Do I need an account or an email address?",
    a: "No. You paste a public URL and the answer appears on the page. There is no signup step, no email field and no stored report."
  },
  {
    q: "Is anything about my check stored?",
    a: "No report or URL from your check is stored. The only records are short-lived anonymous rate-limit counters: a hash of your network and a hash of the checked site, which expire automatically."
  },
  {
    q: "Does this prove that ChatGPT cites my site?",
    a: "No. It proves that the crawler is allowed to read the page and that the page's content and schema are present in the HTML it receives. It does not sample live answer engines, track citations, or promise rankings, traffic or revenue."
  }
];

export async function chatgptReadQuotaChecks(ipHash, targetHost) {
  const now = new Date();
  const hour = hourWindow(now);
  const day = dayWindow(now);
  const targetKey = (
    await sha256Hex(
      String(targetHost || "")
        .trim()
        .toLowerCase()
    )
  ).slice(0, 32);
  return [
    {
      bucket: `chatgpt-read:ip-hour:${hour.key}:${ipHash}`,
      limit: CHATGPT_READ_LIMITS.ipHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "You have reached this hour's AI read check limit for your network. Try again in an hour."
    },
    {
      bucket: `chatgpt-read:ip-day:${day.key}:${ipHash}`,
      limit: CHATGPT_READ_LIMITS.ipDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily AI read check limit reached for your network. Try again tomorrow."
    },
    {
      bucket: `chatgpt-read:target-hour:${hour.key}:${targetKey}`,
      limit: CHATGPT_READ_LIMITS.targetHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has already been checked several times this hour. Try again in an hour."
    },
    {
      bucket: `chatgpt-read:target-day:${day.key}:${targetKey}`,
      limit: CHATGPT_READ_LIMITS.targetDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site has reached its daily check limit. Try again tomorrow."
    }
  ];
}

export async function runChatgptReadCheck(request, env) {
  const parsed = await parseJsonBody(request, ChatgptReadBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const validated = validatePublicCheckUrl(parsed.data.url || "");
  if (!validated.ok) {
    return jsonNoStore({ error: validated.error }, 400);
  }

  const hostname = new URL(validated.url).hostname;
  if (await resolvesToPrivateAddress(hostname)) {
    return jsonNoStore({ error: "This URL points at a private or internal address and cannot be checked." }, 400);
  }

  if (!env.WAITLIST_DB) {
    return jsonNoStore(
      { error: "Check storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  }

  const ipHash = await requestIpHash(request);
  const quota = await checkQuotaSet(env, await chatgptReadQuotaChecks(ipHash, hostname));
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  try {
    const report = await auditUrl(validated.url, env, {
      maxPages: 1,
      appOrigin: new URL(request.url).origin
    });
    return jsonNoStore(buildChatgptReadResult(report));
  } catch (error) {
    if (error?.code === "BROWSER_BUSY") {
      return jsonNoStore({ error: "All check browsers are busy right now. Wait a minute and try again." }, 503);
    }
    return jsonNoStore({ error: friendlyCheckError(error?.message) }, 422);
  }
}

function jsonLdBlock(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

export function canChatgptReadJsonLd(origin) {
  const url = `${origin}${CHATGPT_READ_PAGE_PATH}`;
  return jsonLdBlock({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: `${TITLE} - SEO Fix Kit`,
        description: DESCRIPTION,
        url,
        isPartOf: { "@type": "WebSite", name: "SEO Fix Kit", url: origin },
        publisher: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        mainEntity: { "@id": `${url}#faq` }
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#tool`,
        name: TITLE,
        applicationCategory: "SEO software",
        operatingSystem: "Web",
        url,
        provider: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        description:
          "Free tool that checks whether GPTBot, ClaudeBot and PerplexityBot are allowed to read a public page by robots.txt, and whether that page's main content and schema are present in the raw HTML those crawlers receive."
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: FAQ.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a }
        }))
      }
    ]
  });
}

export function canChatgptReadHtml(origin) {
  const url = `${origin}${CHATGPT_READ_PAGE_PATH}`;
  const image = `${origin}${CHATGPT_READ_SOCIAL_IMAGE_PATH}`;
  const faqHtml = FAQ.map(({ q, a }) => `        <article class="faq-item"><h3>${q}</h3><p>${a}</p></article>`).join(
    "\n"
  );
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${TITLE} - SEO Fix Kit</title>
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${url}" />${publicAssetHead(origin)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SEO Fix Kit" />
    <meta property="og:title" content="${TITLE} - SEO Fix Kit" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${CHATGPT_READ_SOCIAL_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${CHATGPT_READ_SOCIAL_IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="Can ChatGPT read my page? A free check of GPTBot, ClaudeBot and PerplexityBot access." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE} - SEO Fix Kit" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${image}" />
    ${canChatgptReadJsonLd(origin)}
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 1120px; padding: clamp(40px, 6vw, 72px) 22px 72px; min-width: 0; }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 0 0 20px; max-width: 820px; overflow-wrap: break-word; }
      h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.2; margin: 0 0 12px; overflow-wrap: break-word; }
      h3 { font-size: 17px; line-height: 1.4; margin: 0 0 6px; }
      .site-foot a { overflow-wrap: anywhere; }
      p, li { color: var(--ink-soft); font-size: 17px; line-height: 1.62; overflow-wrap: anywhere; }
      .lead { font-size: clamp(18px, 2.2vw, 22px); line-height: 1.55; max-width: 760px; }
      .kicker { color: var(--ink-muted); font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
      .tool-form { background: var(--surface); border: 1px solid var(--line-accent); border-radius: 12px; display: flex; flex-direction: column; gap: 12px; margin: 32px 0 8px; padding: 20px; }
      .tool-form label { color: var(--ink); font-size: 14px; font-weight: 600; }
      .tool-form .row { display: flex; gap: 10px; }
      .tool-form input { flex: 1; min-width: 0; }
      .tool-form button { min-height: 48px; padding: 0 20px; }
      .tool-form button:disabled { cursor: wait; opacity: .6; }
      .form-note { color: var(--ink-muted); font-size: 14px; line-height: 1.5; margin: 0; }
      .band { border-top: 1px solid var(--line); padding: 40px 0; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 32px 0; }
      .panel { display: grid; gap: 8px; }
      .panel p { margin: 0; }
      .panel strong { color: var(--accent); display: block; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
      .proof { border-color: var(--line-accent); }
      .check-list { display: grid; gap: 12px; list-style: none; margin: 0 0 16px; padding-left: 0; }
      .check-list li { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 16px; min-width: 0; }
      .faq-list { display: grid; gap: 12px; }
      .faq-item { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 20px; min-width: 0; }
      .faq-item p { margin: 0; }
      .result { display: none; margin: 32px 0 0; }
      .result.show { display: block; }
      .error-box { background: var(--error-surface); border: 1px solid var(--error-line); border-radius: var(--radius-lg); color: var(--error); padding: 14px 16px; }
      .result-card { background: var(--card-bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-md); overflow: hidden; }
      .result-head { border-bottom: 1px solid var(--line); padding: 22px 24px; }
      .result-head h2 { font-size: clamp(22px, 3vw, 28px); margin: 0; overflow-wrap: anywhere; }
      .result-meta { color: var(--ink-muted); font-size: 14px; margin: 4px 0 0; overflow-wrap: anywhere; }
      .verdict { border-bottom: 1px solid var(--line); padding: 22px 24px; }
      .verdict.readable, .verdict.no-schema { background: var(--success-surface); border-bottom-color: var(--line-accent); }
      .verdict.thin { background: var(--warning-surface); border-bottom-color: var(--gold-line); }
      .verdict.blocked, .verdict.partly-blocked { background: var(--error-surface); border-bottom-color: var(--error-line); }
      .verdict-headline { color: var(--ink); font-size: clamp(19px, 2.4vw, 23px); font-weight: 600; margin: 0; }
      .verdict-detail { color: var(--ink-soft); font-size: 15px; margin: 8px 0 0; }
      .result-body { display: grid; gap: 28px; grid-template-columns: minmax(0, 1fr); padding: 24px; }
      .result-body > section { min-width: 0; }
      .result-body h3 { color: var(--ink-muted); font-size: 12px; font-weight: 600; letter-spacing: .08em; margin: 0 0 12px; text-transform: uppercase; }
      .bot-list { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
      .bot-row { align-items: baseline; background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: 2px 12px; grid-template-columns: minmax(0, 1fr) auto; padding: 12px 14px; min-width: 0; }
      .bot-name { color: var(--ink); font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
      .bot-state { border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .04em; padding: 3px 9px; text-transform: uppercase; white-space: nowrap; }
      .bot-state.allowed { background: var(--success-surface); color: var(--success); }
      .bot-state.blocked { background: var(--error-surface); color: var(--error); }
      .bot-rule { color: var(--ink-muted); font-size: 14px; grid-column: 1 / -1; overflow-wrap: anywhere; }
      .crawler-note { color: var(--ink-muted); font-size: 14px; margin: 10px 0 0; }
      .measure-grid { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius-lg); grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
      .measure { background: var(--card-bg); min-width: 0; padding: 14px 16px; }
      .measure .label { color: var(--ink-muted); font-size: 13px; }
      .measure .value { color: var(--ink); font-size: 16px; font-weight: 600; margin-top: 4px; overflow-wrap: anywhere; }
      .snippet-label { color: var(--ink-muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; margin: 16px 0 0; text-transform: uppercase; }
      .snippet { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); color: var(--ink); display: block; font-size: 14px; line-height: 1.55; margin: 6px 0 0; padding: 12px; }
      .result-next { align-items: center; background: var(--surface-sunken); border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px 16px; justify-content: space-between; padding: 16px 24px; }
      .result-next p { color: var(--ink); font-size: 16px; font-weight: 600; margin: 0; }
      .empty-note { background: var(--success-surface); border: 1px solid var(--line-accent); border-radius: var(--radius-lg); color: var(--success); font-size: 15px; margin: 0; padding: 14px 16px; }
      .loading-card { align-items: center; background: var(--card-bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-sm); display: flex; gap: 16px; padding: 22px 24px; }
      .loading-card p { margin: 0; }
      .loading-card .step { color: var(--ink); font-weight: 600; }
      .loading-card .sub { color: var(--ink-muted); font-size: 14px; }
      .spinner { animation: check-spin 0.9s linear infinite; border: 2px solid var(--line); border-radius: 50%; border-top-color: var(--accent); flex: none; height: 22px; width: 22px; }
      @keyframes check-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
      .tool-cta { border-top: 1px solid var(--line); padding: 40px 0; }
      .tool-cta p { margin: 0 0 14px; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .measure-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .result-head, .verdict, .result-body, .result-next { padding-left: 16px; padding-right: 16px; } .tool-form .row { flex-direction: column; } main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="enter">
        <p class="kicker">Free tool · No account, no email</p>
        <h1>Can ChatGPT read my page?</h1>
        <p class="lead">Paste a public URL. We read your robots.txt, check whether GPTBot, ClaudeBot and PerplexityBot are allowed to fetch it, and then show what your page's main content and schema look like in the raw HTML those crawlers actually receive.</p>
      </section>
      <form class="tool-form" id="chatgpt-read-form" aria-label="Can ChatGPT read my page check">
        <label for="chatgpt-read-url">Public page URL</label>
        <div class="row">
          <input class="field" id="chatgpt-read-url" name="url" type="text" inputmode="url" autocomplete="off" placeholder="https://example.com/pricing" required />
          <button class="btn btn-primary" id="chatgpt-read-button" type="submit">Check this page</button>
        </div>
        <p class="form-note">One page per check. Rate-limited per network and per site to protect the service and the pages it checks. Use only pages you own or are authorized to audit.</p>
      </form>
      <section class="result" id="chatgpt-read-result" aria-live="polite"></section>
      <section class="grid" aria-label="What the check returns">
        <article class="panel proof">
          <strong>Crawler access</strong>
          <p>GPTBot, ClaudeBot and PerplexityBot, each marked allowed or blocked, with the exact robots.txt rule that decided it.</p>
        </article>
        <article class="panel proof">
          <strong>Content in the raw HTML</strong>
          <p>The word count, the H1 and the title a crawler gets from the HTML response, before any JavaScript runs.</p>
        </article>
        <article class="panel proof">
          <strong>Schema in the raw HTML</strong>
          <p>The JSON-LD schema types found in that same HTML, and any JSON-LD block that failed to parse.</p>
        </article>
        <article class="panel proof">
          <strong>Nothing kept</strong>
          <p>No account, no email, no stored report. Only short-lived anonymous rate-limit counters are kept.</p>
        </article>
      </section>
      <section class="band">
        <h2>What this check does not claim</h2>
        <p>This check reads one public page at one moment. It proves what the crawler is allowed to fetch and what the raw HTML holds. It does not sample live answer engines, track citations, or promise rankings, traffic, indexing, revenue or AI citations. It does not replace a full page audit, which you can run free at <a href="${origin}/check">${origin}/check</a>.</p>
      </section>
      <section class="band" aria-label="Frequently asked questions">
        <h2>Frequently asked questions</h2>
        <div class="faq-list">
${faqHtml}
        </div>
      </section>
      <section class="tool-cta">
        <h2>Want the full page check?</h2>
        <p>The full free page check loads your page in a real browser, rules out the false alarms, and lists the real problems with fixes.</p>
        <p><a class="cta" href="${origin}/check">Run the full free page check</a></p>
      </section>
    </main>
    ${siteFooter(origin)}
    <script type="module" src="${origin}/chatgpt-read.js"></script>
  </body>
</html>`;
}
