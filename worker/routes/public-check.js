import { VERSION, normalizeUrl, publicAuditUrlStatus } from "../../shared/audit-engine.js";
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
      proposedMarkup: finding.snippet || ""
    }));
  return {
    ok: true,
    mode: "one-page-check",
    checkedUrl: report?.url || "",
    finalUrl: page?.rendered?.finalUrl || page?.finalUrl || report?.url || "",
    scannedAt: report?.scannedAt || "",
    durationMs: report?.durationMs || 0,
    engineVersion: VERSION,
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
    <script>
      (function () {
        const form = document.getElementById("check-form");
        const urlInput = document.getElementById("url-input");
        const button = document.getElementById("check-button");
        const result = document.getElementById("result");

        function el(tag, text, className) {
          const node = document.createElement(tag);
          if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
          if (className) node.className = className;
          return node;
        }

        // Mirrors the server-side public URL rule (shared/audit-engine.js
        // publicAuditUrlStatus): scheme-less entries are allowed, but a
        // single-label hostname (no dot, no IPv6 colons) is never a public
        // website. Checking here stops typos before they consume a browser
        // render or rate-limit quota and before a raw net:: error comes back.
        function publicUrlError(value) {
          const trimmed = String(value || "").trim();
          if (!trimmed) return "Enter a valid public website URL.";
          // This page is built as a template literal, so the regex escape
          // must be written with doubled backslashes here: a single
          // backslash-slash would collapse to a slash-slash comment marker
          // in the served JS and break the whole line.
          const withProtocol = /^[a-z][a-z0-9+.-]*:\\/\\//i.test(trimmed) ? trimmed : "https://" + trimmed;
          let parsed = null;
          try {
            parsed = new URL(withProtocol);
          } catch {
            return "Enter a valid public website URL.";
          }
          if (!["http:", "https:"].includes(parsed.protocol)) return "Enter a valid public website URL.";
          const host = parsed.hostname.toLowerCase();
          if (!host.includes(".") && !host.includes(":")) return "Enter a valid public website URL.";
          return "";
        }

        function hostOf(value) {
          try {
            return new URL(value).hostname.replace(/^www\\./, "");
          } catch {
            return value;
          }
        }

        function count(value) {
          return typeof value === "number" ? value.toLocaleString("en-US") : value;
        }

        function plural(n, word) {
          return n + " " + word + (n === 1 ? "" : "s");
        }

        function measure(label, value, big) {
          const box = el("div", "", "measure");
          box.appendChild(el("div", label, "label"));
          const shown = value === null || value === undefined || value === "" ? "Not found" : value;
          box.appendChild(el("div", shown, "value" + (big ? " big" : "")));
          return box;
        }

        function copyButton(text) {
          const button = el("button", "Copy", "copy");
          button.type = "button";
          button.setAttribute("aria-label", "Copy markup");
          button.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(text);
              button.textContent = "Copied";
            } catch {
              button.textContent = "Select and copy";
            }
            setTimeout(() => (button.textContent = "Copy"), 1600);
          });
          return button;
        }

        function findingNode(finding) {
          const box = el("article", "", "finding " + finding.severity);
          const top = el("div", "", "finding-top");
          top.appendChild(el("span", finding.severity === "guard" ? "Ruled out" : finding.severity, "sev " + finding.severity));
          top.appendChild(el("h4", finding.title));
          box.appendChild(top);
          if (finding.evidence) box.appendChild(el("p", "Evidence: " + finding.evidence));
          if (finding.why) box.appendChild(el("p", finding.why));
          if (finding.fix) box.appendChild(el("p", "Fix: " + finding.fix, "fix"));
          if (finding.proposedMarkup) {
            box.appendChild(el("p", "Suggested markup. Generated for this page, not copied from it", "snippet-label"));
            const wrap = el("div", "", "snippet-wrap");
            wrap.appendChild(el("code", finding.proposedMarkup, "snippet box-min"));
            wrap.appendChild(copyButton(finding.proposedMarkup));
            box.appendChild(wrap);
          }
          return box;
        }

        function block(title) {
          const section = el("section");
          section.appendChild(el("h3", title));
          return section;
        }

        function renderResult(payload) {
          const measured = payload.measured || {};
          const findings = payload.findings || [];
          const guards = payload.guards || [];
          const card = el("div", "", "result-card");

          const head = el("div", "", "result-head");
          const titleBox = el("div", "", "box-min");
          titleBox.appendChild(el("h2", hostOf(payload.finalUrl || payload.checkedUrl)));
          const rendered = payload.finalUrl && payload.finalUrl !== payload.checkedUrl ? " (rendered at " + payload.finalUrl + ")" : "";
          titleBox.appendChild(el("p", "Checked: " + payload.checkedUrl + rendered, "result-meta"));
          head.appendChild(titleBox);
          const tally = el("div", "", "result-tally");
          tally.appendChild(el("span", findings.length ? plural(findings.length, "problem") + " to fix" : "No problems found", "tally " + (findings.length ? "bad" : "good")));
          tally.appendChild(el("span", plural(guards.length, "false alarm") + " ruled out", "tally good"));
          head.appendChild(tally);
          card.appendChild(head);

          const body = el("div", "", "result-body");

          const problems = block("Problems to fix");
          if (findings.length === 0) problems.appendChild(el("p", "No problems found on this page in this check.", "empty-note"));
          for (const finding of findings) problems.appendChild(findingNode(finding));
          body.appendChild(problems);

          const proof = block("Rendered proof");
          const grid = el("div", "", "measure-grid");
          const words = el("div", "", "measure");
          words.appendChild(el("div", "Words (raw HTML → browser)", "label"));
          const wordValue = el("div", "", "value big");
          if (typeof measured.staticWordCount === "number") wordValue.appendChild(el("span", count(measured.staticWordCount) + " → ", "from"));
          wordValue.appendChild(document.createTextNode(typeof measured.renderedWordCount === "number" ? count(measured.renderedWordCount) : "Not found"));
          words.appendChild(wordValue);
          grid.appendChild(words);
          grid.appendChild(measure("Internal links", count(measured.renderedInternalLinkCount), true));
          grid.appendChild(measure("Main heading (H1)", measured.renderedH1));
          grid.appendChild(measure("Title", measured.renderedTitle));
          proof.appendChild(grid);
          body.appendChild(proof);

          const ruledOut = block("False alarms ruled out");
          if (guards.length === 0) ruledOut.appendChild(el("p", "No false alarms to rule out on this page."));
          for (const guard of guards) ruledOut.appendChild(findingNode({ ...guard, severity: "guard" }));
          body.appendChild(ruledOut);
          card.appendChild(body);

          const foot = el("div", "", "result-foot");
          const text = el("p");
          text.appendChild(el("strong", payload.nextStep || "Create a free account to audit the whole site."));
          if (payload.boundary) text.appendChild(el("span", payload.boundary));
          foot.appendChild(text);
          const cta = el("a", "Create a free account", "cta");
          cta.href = "${origin}/beta";
          foot.appendChild(cta);
          card.appendChild(foot);
          return card;
        }

        function loadingCard(url) {
          const card = el("div", "", "loading-card");
          card.setAttribute("role", "status");
          card.appendChild(el("span", "", "spinner"));
          const text = el("div");
          const step = el("p", "Opening " + url + " in a real browser…", "step");
          text.appendChild(step);
          text.appendChild(el("p", "We compare it with the raw HTML. This can take up to a minute.", "sub"));
          card.appendChild(text);
          const steps = ["Waiting for the page to finish loading…", "Comparing the rendered page with the raw HTML…", "Checking each problem against the real page…"];
          let index = 0;
          const timer = setInterval(() => {
            if (!card.isConnected || index >= steps.length) return clearInterval(timer);
            step.textContent = steps[index++];
          }, 4000);
          return card;
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const url = urlInput.value.trim();
          if (!url) return;
          result.classList.remove("show");
          result.replaceChildren();
          const validationError = publicUrlError(url);
          if (validationError) {
            result.appendChild(el("div", validationError, "error-box"));
            result.classList.add("show");
            return;
          }
          button.disabled = true;
          button.textContent = "Checking…";
          result.replaceChildren(loadingCard(url));
          result.classList.add("show");
          try {
            const response = await fetch("${origin}/api/public-check", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) {
              result.replaceChildren(el("div", payload.error || "The check failed. Try another public URL.", "error-box"));
              return;
            }
            result.replaceChildren(renderResult(payload));
          } catch (error) {
            result.replaceChildren(el("div", "Could not reach the check service. Check your connection and try again.", "error-box"));
          } finally {
            button.disabled = false;
            button.textContent = "Check this page";
          }
        });

        // Arriving from the homepage (or a shared link) as /check?url=...:
        // fill the field and run the check straight away.
        const requested = new URLSearchParams(location.search).get("url");
        if (requested) {
          urlInput.value = requested.trim();
          form.requestSubmit();
        }
      })();
    </script>
  </body>
</html>`;
}
