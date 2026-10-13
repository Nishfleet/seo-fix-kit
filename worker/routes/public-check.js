// Public anonymous one-page check: the low-friction proof-to-repair entry
// path. Any visitor can paste one public URL and get browser-rendered proof
// without an account, an email, or a stored report.
//
// Truthfulness contract (pinned by worker/routes/public-check.test.mjs):
// - The result is built ONLY from the shared audit engine's live output for
//   the submitted URL. Nothing here is hand-written marketing copy.
// - The page and response never promise rankings, traffic, indexing,
//   revenue, AI citations, or live answer-engine visibility.
// - The check is one page, anonymous, and ephemeral: no report or URL is
//   stored, only short-lived anonymous rate-limit counters (hashed per
//   network and per checked site) that expire with the same cleanup as every
//   other abuse counter. It is rate-limited per network and per target site
//   so the service and the pages it checks stay protected.
// - The engine's `snippet` field is GENERATED repair markup (a proposed
//   change the engine built), never an exact quote from the checked page.
//   The response names it `proposedMarkup` and the page labels the code
//   block as a proposed change, so the anonymous surface never presents
//   generated repair markup as an unlabeled observed snippet.
// - Full multi-page audits, saved proof reports, site verification, and the
//   repair queue need a signed-in account; this route only measures
//   the handoff into that account.
// - Engine failures are mapped through friendlyCheckError() into visitor
//   copy; raw browser diagnostics (net::ERR_*) never leak into the response.
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

// The URL stays raw: validatePublicCheckUrl() normalizes and vets it.
const PublicCheckBody = body({ url: z.string().nullish() });

// Rate limits for the anonymous surface. Deliberately small: the point is a
// proof preview, not a free full audit. Buckets live in the existing
// `audit_usage` D1 table (see worker/lib/security.js checkQuotaSet) so they
// expire with the same cleanup as every other abuse counter. The checked site
// and the visitor network are stored only as SHA-256 hashes, so the quota
// rows never contain a readable target hostname, URL, or visitor identifier.
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

// Maps an engine failure into a human-readable /check error. Raw browser
// diagnostics like "net::ERR_NAME_NOT_RESOLVED at https://..." are useful in
// logs but are not visitor copy: the page promises evidence, not protocol
// dumps. Unmatched messages keep the engine's own wording so no failure mode
// is silently hidden.
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
  // The checked site is stored only as a hash (same pattern as the network
  // hash in requestIpHash), so D1 never holds a readable target hostname.
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

// Maps one live engine report (maxPages: 1) to the compact public proof
// payload. Only real engine fields are copied; the page renders these
// verbatim, so the public surface cannot drift from what the engine found.
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
      // The engine's snippet is generated repair markup (a proposed change),
      // not an exact quote from the checked page. Named and rendered as such
      // so the anonymous surface cannot pass it off as observed text.
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

// Worker handler for POST /api/public-check. Anonymous by design: no beta
// session, no stored report, no owner records. The only D1 writes are the
// rate-limit counters in `audit_usage`, hashed per network and per checked
// site, so the database never holds a readable target hostname, URL, or
// visitor identifier.
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

// WebPage and FAQPage JSON-LD for the live /check surface. Every question
// and answer mirrors text a visitor can read on the page itself, and the
// answers keep the same no-ranking boundary the page and the API pin. The
// `\\u003c` escape keeps "</script>" out of the block, same as pages.js.
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
      .measure-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .measure { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 14px; }
      .measure .label { color: var(--ink-muted); font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; }
      .measure .value { font-size: 16px; margin-top: 4px; overflow-wrap: anywhere; }
      .finding { border-left: 3px solid var(--gold); margin: 12px 0; padding-left: 12px; }
      .finding.critical { border-left-color: var(--error); }
      .finding.warning { border-left-color: var(--warning); }
      .finding.notice { border-left-color: var(--info); }
      .finding h3 { font-size: 17px; margin: 0 0 6px; }
      .finding p { font-size: 15px; margin: 0 0 6px; }
      .snippet { background: var(--surface-field); border: 1px solid var(--line); border-radius: var(--radius-lg); color: var(--ink); display: block; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 13px; margin: 8px 0 0; overflow-x: auto; padding: 12px; white-space: pre-wrap; }
      .finding .snippet-label { color: var(--ink-muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; margin: 10px 0 0; text-transform: uppercase; }
      .next-step { background: var(--accent-surface); border: 1px solid var(--line-accent); border-radius: 12px; margin: 40px 0 32px; padding: 20px 22px; }
      .next-step p:last-child { margin-bottom: 0; }
      .box-min { min-width: 0; }
      @media (max-width: 760px) { .grid, .measure-grid { grid-template-columns: 1fr; } .check-form .row { flex-direction: column; } main { padding-top: 32px; } }
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

        function measure(label, value) {
          const box = el("div", "", "measure");
          box.appendChild(el("div", label, "label"));
          box.appendChild(el("div", value === null || value === undefined ? "not measured" : value, "value"));
          return box;
        }

        function resultSection(title, className) {
          const section = el("section");
          if (className) section.className = className;
          section.appendChild(el("h2", title));
          return section;
        }

        function findingNode(finding) {
          const box = el("div", "", "finding " + finding.severity);
          box.appendChild(el("h3", finding.title));
          if (finding.evidence) box.appendChild(el("p", "Evidence: " + finding.evidence));
          if (finding.why) box.appendChild(el("p", finding.why));
          if (finding.fix) box.appendChild(el("p", "Fix: " + finding.fix));
          if (finding.proposedMarkup) {
            box.appendChild(el("p", "Suggested markup. Generated for this page, not copied from it", "snippet-label"));
            box.appendChild(el("code", finding.proposedMarkup, "snippet box-min"));
          }
          return box;
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
          button.textContent = "Checking...";
          result.classList.remove("show");
          result.replaceChildren();
          result.appendChild(el("p", "Opening " + url + " in a real browser and measuring the rendered page. This can take up to a minute."));
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
            result.replaceChildren();

            const checked = el("p", "Checked: " + payload.checkedUrl + (payload.finalUrl && payload.finalUrl !== payload.checkedUrl ? " (rendered at " + payload.finalUrl + ")" : ""));
            result.appendChild(checked);
            if (payload.engineVersion) result.appendChild(el("p", "Engine version " + payload.engineVersion + " · scanned " + payload.scannedAt + " · one page"));

            const section = resultSection("Rendered proof");
            const grid = el("div", "", "measure-grid");
            grid.appendChild(measure("Static HTML words", payload.measured.staticWordCount));
            grid.appendChild(measure("Rendered words", payload.measured.renderedWordCount));
            grid.appendChild(measure("Rendered H1", payload.measured.renderedH1));
            grid.appendChild(measure("Rendered title", payload.measured.renderedTitle));
            grid.appendChild(measure("Rendered internal links", payload.measured.renderedInternalLinkCount));
            section.appendChild(grid);
            result.appendChild(section);

            const guardSection = resultSection("False alarms ruled out");
            if (payload.guards.length === 0) {
              guardSection.appendChild(el("p", "No false alarms to rule out on this page."));
            } else {
              for (const guard of payload.guards) {
                guardSection.appendChild(findingNode(guard));
              }
            }
            result.appendChild(guardSection);

            const findingSection = resultSection("Problems to fix");
            if (payload.findings.length === 0) {
              findingSection.appendChild(el("p", "No problems found on this page in this check."));
            } else {
              for (const finding of payload.findings) {
                findingSection.appendChild(findingNode(finding));
              }
            }
            result.appendChild(findingSection);

            result.appendChild(el("p", payload.nextStep));
            result.appendChild(el("p", payload.boundary));
            result.appendChild(el("p", ""));
            const cta = el("a", "Create a free account", "cta");
            cta.href = "${origin}/beta";
            result.appendChild(cta);
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
