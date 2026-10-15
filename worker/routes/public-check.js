import { VERSION, normalizeUrl, publicAuditUrlStatus } from "../../shared/audit-engine.js";
import { reportFixPrompt } from "../../shared/ai-fix-prompt.js";
import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { jsonNoStore } from "../lib/http.js";
import { checkQuotaSet, requestIpHash, sha256Hex } from "../lib/security.js";
import { dayWindow, hourWindow } from "../lib/text.js";
import { body, parseJsonBody, z } from "../lib/validation.js";
import { auditUrl } from "./audits.js";
import { SOCIAL_IMAGE_PATH, publicAssetHead, siteFooter, siteHeader, socialImageMeta } from "./pages.js";

export const CHECK_PAGE_PATH = "/check";
export const PUBLIC_CHECK_API_PATH = "/api/public-check";

const PublicCheckBody = body({ url: z.string().nullish() });

export const PUBLIC_CHECK_LIMITS = {
  ipHour: 6,
  ipDay: 15,
  targetHour: 3,
  targetDay: 10
};

const NEXT_STEP_COPY =
  "To fix what this check found, create a free account: verify your site to audit up to 1,000 pages, save reports, and work through a repair checklist with one rerun to confirm the fixes. No ranking promise is made.";
const BOUNDARY_COPY =
  "This check measured one public page at scan time. It is not a full site audit, and no report or URL is stored: only short-lived anonymous rate-limit counters (a hash of your network and a hash of the checked site) are kept and expire automatically. It does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility.";

export function friendlyCheckError(raw) {
  const message = String(raw || "The check failed. Try another public URL.").slice(0, 260);
  if (/ERR_NAME_NOT_RESOLVED|ERR_DNS|DNS_PROBE|getaddrinfo/i.test(message)) {
    return "That address does not resolve to a website. Check the spelling and try again.";
  }
  if (
    /ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(
      message
    )
  ) {
    return "The site did not respond. It may be down, blocking checkers, or the address may be wrong. Try another public URL.";
  }
  if (/ERR_CERT|ERR_SSL|SSL:|TLS|CERT_HAS_EXPIRED/i.test(message)) {
    return "The site has a certificate problem, so the check browser could not open it securely. Try another public URL.";
  }
  if (/ERR_ABORTED/i.test(message)) {
    return "The page did not finish loading. Try again in a moment.";
  }
  if (/net::ERR/i.test(message)) {
    return "The page could not be loaded from that address. Check the URL and try again.";
  }
  return message;
}

export function validatePublicCheckUrl(input) {
  let url;
  try {
    url = normalizeUrl(input);
  } catch {
    return { ok: false, error: "Enter a valid public website URL." };
  }
  const check = publicAuditUrlStatus(url);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, url };
}

export async function publicCheckQuotaChecks(ipHash, targetHost) {
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
      bucket: `check:ip-hour:${hour.key}:${ipHash}`,
      limit: PUBLIC_CHECK_LIMITS.ipHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "You have reached this hour's page check limit for your network. Try again in an hour."
    },
    {
      bucket: `check:ip-day:${day.key}:${ipHash}`,
      limit: PUBLIC_CHECK_LIMITS.ipDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "Daily one-page check limit reached for your network. Try again tomorrow."
    },
    {
      bucket: `check:target-hour:${hour.key}:${targetKey}`,
      limit: PUBLIC_CHECK_LIMITS.targetHour,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "That site has already been checked several times this hour. Try again in an hour."
    },
    {
      bucket: `check:target-day:${day.key}:${targetKey}`,
      limit: PUBLIC_CHECK_LIMITS.targetDay,
      windowStart: day.key,
      resetAt: day.resetAt,
      error: "That site has reached its daily check limit. Try again tomorrow."
    }
  ];
}

export function buildPublicCheckResponse(report) {
  const page = report?.pages?.[0];
  const plan = report?.repairPlan || [];
  const guards = (report?.findings || [])
    .filter((finding) => finding?.severity === "good")
    .slice(0, 3)
    .map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      why: finding.why,
      evidence: finding.evidence,
      fix: finding.fix
    }));
  const findings = (report?.findings || [])
    .filter((finding) => finding?.severity && finding.severity !== "good")
    .slice(0, 5)
    .map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      why: finding.why,
      evidence: finding.evidence,
      fix: finding.fix,
      proposedMarkup: finding.snippet || "",
      scoreGain: plan.find((item) => item.title === finding.title)?.scoreGain || 0
    }));
  return {
    ok: true,
    mode: "one-page-check",
    checkedUrl: report?.url || "",
    finalUrl: page?.rendered?.finalUrl || page?.finalUrl || report?.url || "",
    scannedAt: report?.scannedAt || "",
    durationMs: report?.durationMs || 0,
    engineVersion: VERSION,
    score: typeof report?.score === "number" ? report.score : null,
    projectedScore: report?.projectedScore || null,
    fixPrompt: report ? reportFixPrompt(report) : "",
    measured: {
      staticWordCount: page?.static?.wordCount ?? null,
      renderedWordCount: page?.rendered?.wordCount ?? null,
      renderedH1: page?.rendered?.h1s?.[0] || null,
      renderedTitle: page?.rendered?.title || null,
      renderedInternalLinkCount: page?.rendered?.internalLinks?.length ?? null
    },
    issues: {
      critical: report?.summary?.critical ?? 0,
      warnings: report?.summary?.warnings ?? 0,
      notices: report?.summary?.notices ?? 0,
      guardedFalsePositives: report?.summary?.guardedFalsePositives ?? 0
    },
    guards,
    findings,
    nextStep: NEXT_STEP_COPY,
    boundary: BOUNDARY_COPY
  };
}

export async function runPublicCheck(request, env) {
  const parsed = await parseJsonBody(request, PublicCheckBody);
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
  const quota = await checkQuotaSet(env, await publicCheckQuotaChecks(ipHash, hostname));
  if (!quota.ok) {
    return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);
  }

  try {
    const report = await auditUrl(validated.url, env, {
      maxPages: 1,
      appOrigin: new URL(request.url).origin
    });
    return jsonNoStore(buildPublicCheckResponse(report));
  } catch (error) {
    if (error?.code === "BROWSER_BUSY") {
      return jsonNoStore({ error: "All check browsers are busy right now. Wait a minute and try again." }, 503);
    }
    const message = friendlyCheckError(error?.message);
    return jsonNoStore({ error: message }, 422);
  }
}

export function checkJsonLd(origin) {
  const url = `${origin}/check`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: "Free SEO Page Check - SEO Fix Kit",
        description:
          "Check any public page in a real browser. See real SEO problems with fixes, plus the false alarms ruled out. No account needed, and no ranking promises.",
        url,
        isPartOf: { "@type": "WebSite", name: "SEO Fix Kit", url: origin },
        publisher: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        mainEntity: { "@id": `${url}#faq` }
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "What does the one-page check measure?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "It opens one public page in a real browser and compares the raw HTML with the rendered page: static vs rendered word count, rendered H1, rendered title, and internal links. It also shows which common warnings the real page rules out, and any real problems it finds, each with a fix. No account, no email, and no stored report."
            }
          },
          {
            "@type": "Question",
            name: "Is anything about my check stored?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No report or URL from your check is stored. The only records are short-lived anonymous rate-limit counters: a hash of your network and a hash of the checked site, which expire automatically."
            }
          },
          {
            "@type": "Question",
            name: "Is this a full site audit?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. This is one public page at one moment, not a full multi-page audit. Full reports of up to 1,000 pages, saved reports, and the repair checklist come with a free account."
            }
          },
          {
            "@type": "Question",
            name: "Does this check promise rankings or traffic?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. The one-page check does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility, and it does not replace a private multi-page report."
            }
          }
        ]
      }
    ]
  }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${jsonLd}</script>`;
}

export function checkHtml(origin) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Free SEO Page Check - SEO Fix Kit</title>
    <meta name="description" content="Check any public page in a real browser. See real SEO problems with fixes, plus the false alarms ruled out. No account needed, and no ranking promises." />
    <link rel="canonical" href="${origin}/check" />${publicAssetHead(origin)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SEO Fix Kit" />
    <meta property="og:title" content="Free SEO Page Check - SEO Fix Kit" />
    <meta property="og:description" content="Paste a public URL and see what a real browser finds: real SEO problems with fixes, and the false alarms ruled out. No account needed." />
    <meta property="og:url" content="${origin}/check" />
    <meta property="og:image" content="${origin}${SOCIAL_IMAGE_PATH}" />${socialImageMeta()}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Free SEO Page Check - SEO Fix Kit" />
    <meta name="twitter:description" content="Paste a public URL and see what a real browser finds: real SEO problems with fixes, and the false alarms ruled out. No account needed." />
    <meta name="twitter:image" content="${origin}${SOCIAL_IMAGE_PATH}" />
    ${checkJsonLd(origin)}
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      main { margin: 0 auto; max-width: 1120px; padding: clamp(40px, 6vw, 72px) 22px 72px; }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 0 0 20px; max-width: 820px; overflow-wrap: break-word; }
      h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.2; margin: 0 0 12px; }
      h3 { font-size: 17px; line-height: 1.4; margin: 24px 0 6px; }
      .site-foot a { overflow-wrap: anywhere; }
      p, li { color: var(--ink-soft); font-size: 17px; line-height: 1.62; }
      .lead { font-size: clamp(18px, 2.2vw, 22px); line-height: 1.55; max-width: 760px; }
      .check-form { background: var(--surface); border: 1px solid var(--line-accent); border-radius: 12px; display: flex; flex-direction: column; gap: 12px; margin: 32px 0 8px; padding: 20px; }
      .check-form label { color: var(--ink); font-size: 14px; font-weight: 600; }
      .check-form .row { display: flex; gap: 10px; }
      .check-form input { flex: 1; }
      .check-form button { min-height: 48px; padding: 0 20px; }
      .check-form button:disabled { cursor: wait; opacity: .6; }
      .form-note { color: var(--ink-muted); font-size: 14px; line-height: 1.5; margin: 0; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 32px 0; }
      .panel { display: grid; gap: 8px; }
      .panel p { margin: 0; }
      .panel strong { color: var(--accent); display: block; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
      .proof { border-color: var(--line-accent); }
      .band { border-top: 1px solid var(--line); padding: 40px 0; }
      .result { display: none; margin: 32px 0 0; }
      .result.show { display: block; }
      .error-box { background: var(--error-surface); border: 1px solid var(--error-line); border-radius: var(--radius-lg); color: var(--error); padding: 14px 16px; }
      .result-card { background: var(--card-bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-md); overflow: hidden; }
      .result-head { align-items: flex-start; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; padding: 22px 24px; }
      .result-head h2 { font-size: clamp(22px, 3vw, 28px); margin: 0; overflow-wrap: anywhere; }
      .result-meta { color: var(--ink-muted); font-size: 14px; margin: 4px 0 0; overflow-wrap: anywhere; }
      .result-tally { display: flex; flex-wrap: wrap; gap: 8px; }
      .tally { border: 1px solid var(--line); border-radius: 999px; font-size: 13px; font-weight: 600; padding: 6px 12px; white-space: nowrap; }
      .tally.bad { background: var(--error-surface); border-color: var(--error-line); color: var(--error); }
      .tally.good { background: var(--success-surface); border-color: var(--line-accent); color: var(--success); }
      .result-body { display: grid; gap: 28px; grid-template-columns: minmax(0, 1fr); padding: 24px; }
      .result-body > section, .finding, .snippet-wrap { min-width: 0; }
      .result-body h3 { color: var(--ink-muted); font-size: 12px; font-weight: 600; letter-spacing: .08em; margin: 0 0 12px; text-transform: uppercase; }
      .measure-grid { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius-lg); grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
      .measure { background: var(--card-bg); min-width: 0; padding: 14px 16px; }
      .measure .label { color: var(--ink-muted); font-size: 13px; }
      .measure .value { font-size: 16px; font-weight: 600; margin-top: 4px; overflow-wrap: anywhere; }
      .measure .value.big { font-size: 22px; font-variant-numeric: tabular-nums; }
      .measure .value .from { color: var(--ink-muted); font-weight: 500; }
      .finding { border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: 8px; margin: 0 0 10px; padding: 16px; }
      .finding-top { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; }
      .finding h4 { font-size: 16px; line-height: 1.35; margin: 0; }
      .finding p { font-size: 15px; margin: 0; }
      .finding .fix { color: var(--ink); }
      .sev { border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; padding: 4px 9px; text-transform: uppercase; }
      .sev.critical { background: var(--error-surface); color: var(--error); }
      .sev.warning { background: var(--warning-surface); color: var(--warning); }
      .sev.notice { background: var(--info-surface); color: var(--info); }
      .sev.guard { background: var(--success-surface); color: var(--success); }
      .finding.guard { background: var(--success-surface); border-color: var(--line-accent); }
      .snippet-wrap { position: relative; }
      .snippet { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); color: var(--ink); display: block; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 13px; margin: 6px 0 0; overflow-x: auto; padding: 12px 84px 12px 12px; white-space: pre-wrap; }
      .copy { background: var(--card-bg); border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); font-size: 12px; font-weight: 600; padding: 5px 10px; position: absolute; right: 8px; top: 8px; }
      .copy:hover { background: var(--surface-hover); }
      .finding .snippet-label { color: var(--ink-muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; margin: 6px 0 0; text-transform: uppercase; }
      .empty-note { background: var(--success-surface); border: 1px solid var(--line-accent); border-radius: var(--radius-lg); color: var(--success); font-size: 15px; margin: 0; padding: 14px 16px; }
      .result-foot { align-items: center; background: var(--accent-surface); border-top: 1px solid var(--line-accent); display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; padding: 20px 24px; }
      .result-foot p { margin: 0; }
      .result-foot strong { color: var(--ink); display: block; font-size: 17px; }
      .result-foot span { color: var(--ink-muted); font-size: 14px; }
      .loading-card { align-items: center; background: var(--card-bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-sm); display: flex; gap: 16px; padding: 22px 24px; }
      .loading-card p { margin: 0; }
      .loading-card .step { color: var(--ink); font-weight: 600; }
      .loading-card .sub { color: var(--ink-muted); font-size: 14px; }
      .spinner { animation: check-spin 0.9s linear infinite; border: 2px solid var(--line); border-radius: 50%; border-top-color: var(--accent); flex: none; height: 22px; width: 22px; }
      @keyframes check-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
      .next-step { background: var(--accent-surface); border: 1px solid var(--line-accent); border-radius: 12px; margin: 40px 0 32px; padding: 20px 22px; }
      .next-step p:last-child { margin-bottom: 0; }
      .box-min { min-width: 0; }
      .result-head { align-items: center; }
      .result-title { flex: 1; }
      .score { align-items: baseline; border: 1px solid var(--line); border-radius: 14px; display: inline-flex; flex: none; gap: 2px; padding: 10px 14px; }
      .score strong { font-size: 34px; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; }
      .score span { color: var(--ink-muted); font-size: 14px; font-weight: 600; }
      .score.good { background: var(--success-surface); border-color: var(--line-accent); color: var(--success); }
      .score.ok { background: var(--warning-surface); color: var(--warning); }
      .score.bad { background: var(--error-surface); border-color: var(--error-line); color: var(--error); }
      .gain { background: var(--accent-surface); border: 1px solid var(--line-accent); border-radius: 999px; color: var(--accent-strong, var(--accent)); font-size: 12px; font-weight: 700; margin-left: auto; padding: 3px 9px; white-space: nowrap; }
      .fix-next { border-top: 1px dashed var(--line); display: grid; gap: 12px; margin-top: 16px; padding-top: 16px; }
      .projected { color: var(--ink); font-size: 16px; margin: 0; }
      .projected strong { color: var(--accent); }
      .prompt-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px 14px; }
      .prompt-note { color: var(--ink-muted); font-size: 14px; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .measure-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .result-head, .result-body, .result-foot { padding-left: 16px; padding-right: 16px; } .check-form .row { flex-direction: column; } main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="box-min enter">
        <p class="kicker">Free page check · No account needed</p>
        <h1 class="box-min">Check any page the way a browser sees it.</h1>
        <p class="lead">Paste a public URL. We load it in a real browser, compare it with the raw HTML that simple crawlers read, and show what is actually wrong, plus the warnings that don’t apply. No account, no email, no stored report.</p>
      </section>
      <form class="check-form" id="check-form" aria-label="One-page URL check">
        <label for="url-input">Public page URL</label>
        <div class="row">
          <input class="field" id="url-input" name="url" type="text" inputmode="url" autocomplete="off" placeholder="https://example.com/about" required />
          <button class="btn btn-primary" id="check-button" type="submit">Check this page</button>
        </div>
        <p class="form-note">One page per check. Rate-limited per network and per site to protect the service and the pages it checks. Use only pages you own or are authorized to audit.</p>
      </form>
      <section class="result" id="result" aria-live="polite"></section>
      <section class="grid" aria-label="What the check returns">
        <article class="panel proof">
          <strong>What the browser sees</strong>
          <p>Measured facts from the loaded page: word count before and after JavaScript, the main heading, the title, and internal links.</p>
        </article>
        <article class="panel proof">
          <strong>False alarms ruled out</strong>
          <p>Basic scanners flag problems on pages that load content with JavaScript. We show which of those warnings the real page proves wrong.</p>
        </article>
        <article class="panel proof">
          <strong>Real problems only</strong>
          <p>Only issues backed by evidence are reported, each with a concrete fix and a proposed markup change when we can generate one.</p>
        </article>
        <article class="panel proof">
          <strong>Audit your whole site</strong>
          <p>Create a free account to audit up to 1,000 pages, save reports, and track every fix.</p>
        </article>
      </section>
      <section class="band">
        <h2>What this check does not claim</h2>
        <p>This is one public page at one moment, not a full site audit. No report or URL is stored: only short-lived anonymous rate-limit counters (a hash of your network and a hash of the checked site) are kept, and they expire automatically. It does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility. It does not replace a private multi-page report.</p>
      </section>
      <section class="band" aria-label="Frequently asked questions">
        <h2>Frequently asked questions</h2>
        <h3>What does the one-page check measure?</h3>
        <p>It opens one public page in a real browser and compares the raw HTML with the rendered page: static vs rendered word count, rendered H1, rendered title, and internal links. It also shows which common warnings the real page rules out, and any real problems it finds, each with a fix. No account, no email, and no stored report.</p>
        <h3>Is anything about my check stored?</h3>
        <p>No report or URL from your check is stored. The only records are short-lived anonymous rate-limit counters: a hash of your network and a hash of the checked site, which expire automatically.</p>
        <h3>Is this a full site audit?</h3>
        <p>No. This is one public page at one moment, not a full multi-page audit. Full reports of up to 1,000 pages, saved reports, and the repair checklist come with a free account.</p>
        <h3>Does this check promise rankings or traffic?</h3>
        <p>No. The one-page check does not guarantee rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility, and it does not replace a private multi-page report.</p>
      </section>
      <section class="band next-step">
        <h2>After the check</h2>
        <p>To fix what you found, create a free account. You get saved reports, audits of up to 1,000 pages, and a repair checklist. Rerun the audit to confirm each fix worked.</p>
        <p><a class="cta" href="${origin}/beta">Create a free account</a></p>
      </section>
    </main>
    ${siteFooter(origin)}
    <script type="module" src="${origin}/check.js"></script>
  </body>
</html>`;
}
