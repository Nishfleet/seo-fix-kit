import { SITE_FOOTER, SITE_NAV, SITE_TAGLINE } from "../../shared/site-nav.js";
import { escapeHtml } from "../../shared/audit-engine.js";
import { DEMO_PROOF, DEMO_FIXTURE_PATH, demoProofSnippet } from "./demo-proof.js";

const FIX_PACK_PUBLIC_PRICE = "$99.00 one-time";

// The PNG share image every worker-rendered public page ships as
// og:image/twitter:image (social platforms ignore SVG share images). Single
// source of truth: public/og-image.png is the 1200x630 render of
// public/og-image.svg copied into the Worker's asset bundle, and
// pages.test.mjs pins both the tag and the shipped file's PNG dimensions so
// shares never point at a dead or wrongly sized URL.
const SOCIAL_IMAGE_PATH = "/og-image.png";
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

// Meta tags that describe the share image; reused by /check.
function socialImageMeta() {
  return `
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${SOCIAL_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${SOCIAL_IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="SEO Fix Kit: SEO fixes with receipts. Audit it. Prove it. Fix it." />`;
}

function llmsText(origin) {
  return `# SEO Fix Kit

SEO Fix Kit is a private-beta, self-serve SEO audit and paid Fix Pack workflow.

## Pages
- [${origin}/](https://seofixkit.com/): Landing page with proof-backed SEO repair pitch and free one-page check entry.
- [${origin}/check](https://seofixkit.com/check): Anonymous one-page browser-rendered SEO audit. No account, no stored report, no ranking promises.
- [${origin}/demo](https://seofixkit.com/demo): Public sample report showing rendered-vs-static false-positive guards and repair briefs.
- [${origin}/methodology](https://seofixkit.com/methodology): Proof standard, limits, and boundaries. No live AI-engine sampling, no citation monitoring, no ranking guarantees.
- [${origin}/pricing](https://seofixkit.com/pricing): Pricing: free page checks, free beta site audits, and the $99 one-time Fix Pack. Dodo checkout is the price source of truth.
- [${origin}/proof](https://seofixkit.com/proof): Before/after repair proof receipt from a completed beta repair. Published with consent.
- [${origin}/small-business-seo-audit](https://seofixkit.com/small-business-seo-audit): Proof-backed SEO audit for small businesses. Check one page free, pay only when real fixes exist.
- [${origin}/rendered-vs-static-seo-audit](https://seofixkit.com/rendered-vs-static-seo-audit): Renders pages in a real browser to compare raw HTML with the rendered DOM — guarding static-crawler false positives and showing AI crawler visibility for JavaScript-blind crawlers like GPTBot, ClaudeBot, PerplexityBot, and CCBot.
- [${origin}/ai-answer-readiness](https://seofixkit.com/ai-answer-readiness): Proof-derived AI Answer Readiness from rendered content, schema, links, sitemap context, and optional llms.txt. Site-proof, not citation monitoring.
- [${origin}/support](https://seofixkit.com/support): Support and contact page.
- [${origin}/privacy](https://seofixkit.com/privacy): Privacy note for access requests, private beta audits, payments, and fulfillment.
- [${origin}/terms](https://seofixkit.com/terms): Terms of service.

Live product claims:
- Visitors can request a secure email access link.
- Anyone can anonymously check one public page URL at /check and see real-browser evidence, the false alarms it rules out, and real problems with fixes, with no account and no stored report.
- Verified sessions can run rate-limited private audits and save owner-only reports.
- Verified sessions can choose self-serve crawl depth up to 1,000 pages per queued audit.
- Reports include robots.txt and sitemap crawl inventory up to 50,000 discovered URLs.
- Large rendered crawl jobs (staged 50,000-page plans) are early access: they store frontier, batch, retry, proof, and merge-readiness state, and batches render gradually in the background over days to weeks.
- Reports include rendered crawl intelligence for internal link depth, low-inbound pages, sitemap-sample orphan candidates, duplicate metadata/content, parameterized URLs, and keyword-cannibalization heuristics.
- Saved reruns include audit-history deltas for fixed, new, and still-open proven issues.
- Reports include rendered browser resource-waterfall proof with slow, heavy, and render-blocking repair actions.
- Verified sessions can import backlink rows for live/lost link proof, repair actions, and import-backed link-edge history.
- Verified sessions can supply local business details, keywords, and citation URLs for local SEO proof and repair actions.
- Verified sessions can import Search Console or rank-tracker keyword rows for low-CTR, page-two, decline, cannibalization, intent-match, uncrawled landing-page repair actions, and rank observation history.
- Reports include rendered WordPress and ecommerce platform proof for Product schema, breadcrumbs, faceted links, archives, and plugin resource impact.
- Reports include proof-derived AI Answer Readiness checks for rendered content depth, helpful schema, canonical/internal-link clarity, question-led structure, sitemap context, and optional llms.txt reachability. When imported Search Console rows are present, those faults are ranked by clicks and impressions on the affected pages.
- Intent-matching landing pages at ${origin}/small-business-seo-audit, ${origin}/rendered-vs-static-seo-audit, and ${origin}/ai-answer-readiness describe the proof-backed small-business audit, the rendered-vs-static proof loop framed as AI crawler visibility (GPTBot, ClaudeBot, PerplexityBot, and CCBot read raw HTML without executing JavaScript), and the site-proof AI Answer Readiness boundary; none claim live answer-engine sampling or AI citation monitoring.
- Reports include draft-only growth briefs from verified keyword, competitor, AI-readiness, and crawl gaps.
- Reports include a private repair queue with proof, acceptance checks, status, safe draft action records, approval state, owner-approved implementation packs, and proof receipts after fixed rerun proof.
- The account dashboard includes a repair-agent feed that ranks open repairs, drafted actions, applied items needing rerun proof, and monitor regressions.
- Developer API issue/report responses include safe repair_queue status. Approved-action implementation packs are fetched from /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md; fixed-action proof receipts are fetched from /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md; repair-action lifecycle webhooks are supported.
- Reports include SEO/GEO readiness checks for crawlable answer content, entity clarity, useful schema, internal context, and optional llms.txt boundaries.
- Dodo is the source of truth for visible Fix Pack pricing and checkout.
- Paid Fix Pack fulfillment includes owner-approved repair proposals, status, delivery notes, and one rerun after fixes.
- Proof Monitoring checkout is config-gated behind the Dodo subscription product and webhook entitlement sync; access activates from subscription webhooks, not redirects.
- The private billing portal lists the staged offer ladder for monitoring, Repair Sprint, SEO/GEO repair agent, and agency workspace.
- Repair Sprint checkout is config-gated behind the Dodo one-time product and opens only from approved executable proposal queues.
- Agency Workspace features run under beta limits; paid Agency Workspace checkout is not live yet.

Hosted-only differentiators vs free installable SEO agent skills:
- Free installable SEO agent skills are useful for quick, single-page checks and remain a good complement; SEO Fix Kit's hosted surfaces add the parts that need infrastructure and persistence.
- Hosted rendered crawl scope: self-serve audits up to 1,000 pages per queued audit, robots.txt and sitemap crawl inventory up to 50,000 discovered URLs, and staged large rendered crawl jobs for 50,000-page targets (early access; batches render gradually, never sold as completed 50K rendered validation).
- Persistent repair queue: proven issues stay tracked across saved reports with approval state, acceptance checks, status, and fixed-rerun proof receipts.
- Owner-approved implementation packs: private handoff documents with source proof and approval state for approved repair actions.
- Paid Fix Pack fulfillment: one proof-backed repair pass per report plus one rerun after fixes, with Dodo as the checkout and visible-price source of truth.
- Why not just use a free AI SEO agent skill? The plain answer is on ${origin}/methodology; the same boundaries apply to both, including no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.

Agent-readable acquisition and action surfaces:
- Public context for agents: ${origin}/llms.txt, ${origin}/.well-known/skill.md, ${origin}/demo, ${origin}/methodology, ${origin}/pricing, ${origin}/proof, ${origin}/support, and ${origin}/terms.
- Owner setup starts inside the private beta workspace; anonymous one-page checks are live at ${origin}/check, while full multi-page audits and unauthenticated repair actions are not live.
- Self-serve API setup is owner-scoped at ${origin}/api/developer, with API keys from ${origin}/api/developer/tokens and lifecycle webhooks from ${origin}/api/developer/webhooks.
- Bearer-token API actions agents can use today: POST /v1/audits, GET /v1/audits/{audit_id}, GET /v1/audits/{audit_id}/issues, GET /v1/audits/{audit_id}/report, GET/PATCH /v1/audits/{audit_id}/repair-queue, POST /v1/audits/{audit_id}/repair-actions, PATCH /v1/audits/{audit_id}/repair-actions/{action_id}, GET /v1/audits/{audit_id}/repair-actions/{action_id}/implementation.md, GET /v1/audits/{audit_id}/repair-actions/{action_id}/proof.md, GET /v1/projects, POST /v1/large-crawls, and GET /v1/large-crawls/{large_crawl_id}.
- Webhook events agents can subscribe to today: audit.completed, audit.failed, repair_action.drafted, repair_action.approved, repair_action.applied, repair_action.fixed, and repair_action.regressed.
- Worker-only large-crawl batch claim/process/proof endpoints require x-seofixkit-worker-token and are not available to normal bearer API keys.
- There is no live SEO Fix Kit MCP endpoint today; agents should use the documented REST and markdown proof endpoints.

Current product boundary:
- Public methodology and pricing pages describe the live proof loop, limits, and plans; they are not a public anonymous audit.
- Does not sell or claim completed 50,000-page rendered validation; large crawls are early-access staged plans until every batch has page-level proof and merge readiness is clear.
- 100,000+ enterprise rendered crawls and browser-container fleet autoscaling are not live yet.
- Does not provide full-site rank, index, or orphan discovery beyond rendered crawl proof and sitemap inventory samples.
- Does not provide proprietary backlink discovery beyond supplied/imported link-edge history.
- Does not provide live keyword volume providers, traffic estimates, or continuous rank tracking yet.
- Does not provide live AI-engine visibility tracking, AI citation monitoring, or answer-engine sampling. AI Answer Readiness is site-proof only.
- Does not auto-publish growth content, create CMS drafts, open pull requests, or promise rankings/traffic from growth briefs.
- Does not claim paid Proof Monitoring is active unless Dodo subscription checkout and webhook entitlement sync are configured.
- Does not claim Repair Sprint checkout is active unless the Dodo one-time product is configured and the report has approved executable proposals.
- Does not sell live recurring repair agent or agency workspace subscriptions until entitlement billing is wired.
- Does not claim llms.txt is required for Google Search or Google generative search surfaces.
- Does not scrape private Google Business Profile data or discover every citation automatically.
- Does not log into WordPress, Shopify, WooCommerce, Magento, or private CMS/plugin admin settings.
- Implementation packs and repair proof receipts are private handoff/proof documents only; SEO Fix Kit does not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs from the browser.
- Does not replace Ahrefs or Semrush.
- Does not provide anonymous multi-page audits; the anonymous surface is a single-page proof check with per-network and per-site rate limits.
- Does not expose unauthenticated agent actions.
- Does not guarantee rankings, traffic, indexing, or revenue.

Useful routes:
- ${origin}/
- ${origin}/check
- ${origin}/api/public-check
- ${origin}/api/health
- ${origin}/api/deep-health
- ${origin}/llms.txt
- ${origin}/privacy
- ${origin}/support
- ${origin}/terms
- ${origin}/demo
- ${origin}/methodology
- ${origin}/pricing
- ${origin}/proof
- ${origin}/small-business-seo-audit
- ${origin}/rendered-vs-static-seo-audit
- ${origin}/ai-answer-readiness
`;
}

function homeMarkdown(origin) {
  return `# SEO Fix Kit

Proof-backed SEO audits, self-serve repair queue, private implementation packs, and approval-safe repair-agent workflow.

Request a secure email access link to run a rate-limited private audit. The paid Fix Pack is one proof-backed repair pass for one report plus one rerun after fixes. No ranking promise is made.

Public proof before payment:
- Anonymous one-page check: ${origin}/check
- Sample proof report: ${origin}/demo
- Methodology and limits: ${origin}/methodology
- Pricing: ${origin}/pricing
- Small-business SEO audit: ${origin}/small-business-seo-audit
- Rendered vs static audit: ${origin}/rendered-vs-static-seo-audit
- AI Answer Readiness check: ${origin}/ai-answer-readiness

Start at ${origin}/.
`;
}

// Serialize a JSON-LD block safely inside a <script> tag.
function ldBlock(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

// Favicon, touch icon, and the shared design tokens stylesheet
// (public/tokens.css) for every worker-rendered public page. The stylesheet
// is root-relative so it is served by the same host as the page (CSP
// style-src 'self'); pages keep their own layout CSS inline after it.
function publicAssetHead(origin) {
  return `
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${origin}/apple-touch-icon.png" sizes="180x180" />
    <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/tokens.css" />
    <script>document.documentElement.classList.add("js")</script>
    <script src="/site.js" defer></script>`;
}

// The one site header every worker-rendered public page uses, including the
// static 404 page (notFoundHtml(), written to dist/404.html at build time),
// twinned by SiteHeader in src/components/SiteChrome.jsx for the React
// landing page. It sits
// directly in <body>, outside the page's own layout wrapper, so it can stick
// to the top full width. Styles live in src/design/site.css; the logo mark is
// /favicon.svg drawn by .brand::before so the link text stays the plain
// product name. /site.js turns the nav into a menu on small screens.
function siteHeader(origin, currentPath = "") {
  const current = (href) => (href === currentPath ? ' aria-current="page"' : "");
  const chevron =
    '<svg aria-hidden="true" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3 3 3-3" /></svg>';
  const links = SITE_NAV.map((entry) => {
    if (!entry.items) {
      const kind = entry.kind ? ` class="site-nav-${entry.kind}"` : "";
      return `<a${kind} href="${origin}${entry.href}"${current(entry.href)}>${entry.label}</a>`;
    }
    const items = entry.items
      .map(
        ({ href, label, text }) =>
          `<a href="${origin}${href}"${current(href)}><strong>${label}</strong><span>${text}</span></a>`
      )
      .join("\n              ");
    return `<div class="site-nav-group" data-nav-group>
            <button class="site-nav-trigger" type="button" aria-expanded="false" aria-controls="site-nav-${entry.id}">${entry.label}${chevron}</button>
            <div class="site-nav-menu" id="site-nav-${entry.id}">
              ${items}
            </div>
          </div>`;
  }).join("\n          ");
  return `<a class="site-skip" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="site-header-inner">
        <a class="brand" href="${origin}/">SEO Fix Kit</a>
        <nav class="site-nav" id="site-nav" aria-label="Main">
          ${links}
        </nav>
        <div class="site-header-actions">
          <a class="btn btn-primary btn-sm header-cta" href="${origin}/check">Check a page free</a>
          <button class="site-menu-button" type="button" aria-controls="site-nav" aria-expanded="false" data-site-menu>
            Menu
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 5h11M2.5 11h11" /></svg>
          </button>
        </div>
      </div>
    </header>`;
}

// Closing call to action shared by the marketing pages: a dark band that
// mirrors the homepage's final section, so every page ends on a next step.
function siteCtaBand(origin) {
  return `<section class="site-cta" data-theme="dark" aria-labelledby="site-cta-title">
        <h2 id="site-cta-title">Find out what is really wrong with your site.</h2>
        <p>Check one page free, no account. Or audit the whole site and get fixes you can prove.</p>
        <div class="site-cta-actions">
          <a class="btn btn-primary btn-lg" href="${origin}/check">Check a page free <span class="arrow" aria-hidden="true">→</span></a>
          <a class="btn btn-secondary btn-lg" href="${origin}/#get-started">Create a free account</a>
        </div>
      </section>`;
}

// The one site footer every worker-rendered public page uses (twinned by
// SiteFooter in src/components/SiteChrome.jsx). Links come from
// shared/site-nav.js; styles live in src/design/site.css under .site-foot.
function siteFooter(origin) {
  const link = ({ href, label }) => `<a href="${href.startsWith("/") ? origin + href : href}">${label}</a>`;
  const columns = SITE_FOOTER.map(
    (column) => `
        <nav aria-label="${column.title}">
          <h2>${column.title}</h2>
          ${column.links.map(link).join("\n          ")}
        </nav>`
  ).join("");
  return `<footer class="site-foot">
        <div class="site-foot-brand">
          <a class="brand" href="${origin}/">SEO Fix Kit</a>
          <p>${SITE_TAGLINE}</p>
        </div>${columns}
      </footer>`;
}

function pageSocialHead({ origin, title, description, path = "/" }) {
  const url = `${origin}${path}`;
  const image = `${origin}${SOCIAL_IMAGE_PATH}`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: { "@type": "WebSite", name: "SEO Fix Kit", url: origin },
    publisher: { "@type": "Organization", name: "SEO Fix Kit", url: origin }
  }).replace(/</g, "\\u003c");
  return `
    <link rel="canonical" href="${url}" />${publicAssetHead(origin)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SEO Fix Kit" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />${socialImageMeta()}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${jsonLd}</script>`;
}

function demoHtml(origin) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proof-Backed SEO Repair Demo - SEO Fix Kit</title>
    <meta name="description" content="A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs." />
${pageSocialHead({ origin, title: "Proof-Backed SEO Repair Demo - SEO Fix Kit", description: "A public sample showing how SEO Fix Kit refuses static crawler false positives and turns verified issues into repair briefs.", path: "/demo" })}
    <style>
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 1120px; padding: clamp(40px, 6vw, 72px) 22px 64px; min-width: 0; }
      .enter > p { max-width: 720px; }
      .panel p, .panel li { font-size: 16px; }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 0 0 20px; max-width: 780px; overflow-wrap: break-word; }
      h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.2; margin: 0 0 12px; overflow-wrap: break-word; }
      p, li { color: var(--ink-soft); font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word; }
      section { margin: 0 0 32px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 32px 0; }
      .panel { display: grid; gap: 8px; min-width: 0; }
      .panel p { margin: 0; }
      .panel strong { color: var(--gold); display: block; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
      .panel ul { margin: 0; padding-left: 20px; }
      .panel li + li { margin-top: 12px; }
      .proof { border-color: var(--line-accent); }
      .proof strong { color: var(--accent); }
      .panel li strong, .panel p strong { color: var(--ink); font-weight: 600; letter-spacing: 0; text-transform: none; font-size: inherit; display: inline; }
      code { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="enter">
        <p class="kicker">Sample report · Real output</p>
        <h1>Fix only what is actually broken.</h1>
        <p>Basic SEO scanners read a page’s raw code and flag problems that aren’t there. SEO Fix Kit loads the page in a real browser, shows the evidence, and only suggests a fix when something is actually wrong.</p>
      </section>
      <section class="grid" aria-label="Sample audit outcome">
        <article class="panel">
          <strong>Static scanner</strong>
          <p>The raw HTML response holds ${DEMO_PROOF.measured.staticWordCount} visible words and no heading or link a user can follow. A static-only scan reads that as a thin, broken page.</p>
        </article>
        <article class="panel proof">
          <strong>Rendered proof</strong>
          <p>The browser render shows one real H1, three internal links, and ${DEMO_PROOF.measured.renderedWordCount} words of content. The thin page exists only in the raw response.</p>
        </article>
        <article class="panel">
          <strong>Repair brief</strong>
          <p>No thin-content fix is queued: the browser evidence rules that warning out. Issues that are real still surface — noindex, a canonical conflict, a missing share image, missing schema — with a suggested fix and an exact snippet when the engine can generate one.</p>
        </article>
      </section>
      <section class="panel proof">
        <h2>Real engine output for the public test page</h2>
        <p>The proof below is verbatim output from the SEO Fix Kit audit engine run against SEO Fix Kit's own <a href="${origin}${DEMO_FIXTURE_PATH}">public test page</a> — the same engine, the same page, and the same proof fields used for private reports. Every finding below is engine-generated, not hand-written demo copy.</p>
        <p><strong>Measured on the test page:</strong> ${DEMO_PROOF.measured.staticWordCount} visible words in the raw HTML response vs ${DEMO_PROOF.measured.renderedWordCount} words, one H1, and ${DEMO_PROOF.measured.renderedInternalLinkCount} internal links after browser render.</p>
        <p><strong>False alarms ruled out:</strong></p>
        <ul>
${DEMO_PROOF.guards
  .map(
    (
      guard
    ) => `          <li><strong>${escapeHtml(guard.title)}</strong>\n            <code class="code-block">- Evidence: ${escapeHtml(guard.evidence)}
- Why: ${escapeHtml(guard.why)}
- Fix: ${escapeHtml(guard.fix)}</code></li>`
  )
  .join("\n")}
        </ul>
        <p><strong>What the engine actually queues for the test page</strong> (severity · finding · suggested fix · exact snippet when the engine can generate one):</p>
        <ul>
${DEMO_PROOF.repairPlan.map((item) => `          <li><strong>${escapeHtml(item.severity)}</strong> ${escapeHtml(item.title)} — ${escapeHtml(item.fix)}${item.snippet ? `\n            <code class="code-block">${escapeHtml(demoProofSnippet(item.snippet, origin))}</code>` : ""}</li>`).join("\n")}
        </ul>
        <p>This excerpt was generated with engine v${escapeHtml(DEMO_PROOF.engineVersion)}. Performance/PageSpeed checks are not part of this public excerpt. The test page is intentionally a noindex fixture, and the report says so instead of hiding it. After a change ships, rerun the same page: each finding shows fixed, still-open, new, or regressed.</p>
      </section>
      <section>
        <h2>What this sample proves</h2>
        <p>A useful SEO repair report has to separate a crawler limitation from a real customer problem. The sample shows that SEO Fix Kit does not stop at the first HTML response. It opens the page in a browser, reads the rendered title, description, headings, internal links, schema, social tags, images, and body copy, then records which static warnings should be guarded as false positives.</p>
        <p>On this test page the static-looking warnings were a missing H1, missing internal links, and thin content: ${DEMO_PROOF.measured.staticWordCount} visible words in the raw response vs ${DEMO_PROOF.measured.renderedWordCount} rendered words. The same raw-vs-rendered comparison guards missing-H1 and missing-link warnings on sites that paint content with JavaScript.</p>
        <p>That distinction matters for agentic repair work. If a scanner says "add an H1" when the rendered page already has one, an agent could make the site worse by adding duplicate headings. SEO Fix Kit keeps that item out of the repair queue, explains why it was rejected, and points the user toward a rerun instead of fake busywork.</p>
      </section>
      <section class="grid" aria-label="What a paid Fix Pack uses from the sample">
        <article class="panel proof">
          <strong>Buyer proof</strong>
          <p>The report shows the observed page URL, rendered facts, issue evidence, and whether the finding is actionable or guarded — exactly the fields shown in the real engine output above.</p>
        </article>
        <article class="panel proof">
          <strong>Repair scope</strong>
          <p>Only proven issues become queue items. Each item has severity, a suggested fix, an exact snippet when the engine can generate one, and an acceptance check.</p>
        </article>
        <article class="panel proof">
          <strong>Rerun standard</strong>
          <p>After a change ships, the same audit path checks whether the issue is fixed, still open, new, or regressed.</p>
        </article>
      </section>
      <section>
        <h2>What this sample does not claim</h2>
        <p>This page is a sample, not an audit of your site. The proof excerpt above is the engine's real output for the test page, not a preview of your site's results. Anonymous one-page checks are live at ${origin}/check: paste a public URL and get real-browser evidence, the false alarms it rules out, and real problems with fixes — with no account, no email, and no stored report. Full reports still run inside the private beta after secure email access and, for deeper crawls, site verification. Neither the sample nor the one-page check promises rankings, traffic, indexing, revenue, AI citations, or live answer-engine visibility. The product standard is the same everywhere: prove the issue, avoid false positives, ask for approval, then rerun the same measurement after the fix.</p>
      </section>
      ${siteCtaBand(origin)}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function methodologyHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/methodology",
    title: "Methodology",
    description:
      "How SEO Fix Kit turns rendered proof into a self-serve repair queue, what it can verify today, and what it does not claim.",
    eyebrow: "Methodology and limits",
    heading: "Proof first. Repairs second. Claims last.",
    lead: "SEO Fix Kit starts with what a browser, sitemap, supplied data, and rerun can prove. The repair agent is a queue and approval system, not an autopilot that edits your site behind your back.",
    body: `
      <section class="band">
        <h2>The proof loop</h2>
        <div class="grid three">
          <article class="panel proof"><strong>1. Render</strong><p>We compare raw HTML with the browser-rendered page, then keep false positives out when the final DOM already has the expected content.</p></article>
          <article class="panel proof"><strong>2. Queue</strong><p>Only proven findings become repair queue items with severity, source proof, suggested action, and an acceptance check.</p></article>
          <article class="panel proof"><strong>3. Re-measure</strong><p>Reruns and weekly monitors are the authority for fixed, still-open, new, or regressed status.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>What is live today</h2>
        <ul class="check-list">
          <li>Anonymous one-page checks at <a href="${origin}/check">${origin}/check</a>: paste a public URL and get real-browser evidence, the false alarms it rules out, and real problems with fixes, with no account and no stored report.</li>
          <li>Private self-serve audits for authorized sites, with 1-page Lite checks and verified-host crawl depths up to 1,000 pages.</li>
          <li>Rendered page proof, sitemap inventory up to 50,000 discovered URLs, crawl intelligence, resource waterfall proof, platform SEO checks, proof-derived AI Answer Readiness, draft-only growth briefs, competitor homepage benchmarks, and supplied backlink/local/keyword imports.</li>
          <li>Private report repair queues with proof, status, safe drafts, approval state, owner-approved implementation packs, proof receipts after fixed reruns, teammate assignment, account-level next actions, and one Fix Pack checkout path when real fixes exist.</li>
          <li>Developer API and webhook surfaces for owner-scoped audit workflows, including safe repair queue status, separate implementation-pack and proof-receipt endpoints, and repair-action lifecycle events.</li>
        </ul>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
      </section>
      <section class="band">
        <h2>Limits we state up front</h2>
        <div class="grid two">
          <article class="panel"><strong>No fake scale claim</strong><p>Large 50,000-page rendered crawls are early-access staged jobs. We do not call them complete until every batch has page-level proof and merge readiness is clear.</p></article>
          <article class="panel"><strong>No AI visibility tracking</strong><p>AI Answer Readiness is proof-derived from rendered pages, schema, canonicals, links, sitemap context, and optional llms.txt. Live answer-engine sampling, AI citation monitoring, and AI visibility score tracking are not live.</p></article>
          <article class="panel"><strong>No backlink database claim</strong><p>Backlink proof starts with supplied/imported rows and link-edge history. SEO Fix Kit does not replace Ahrefs, Semrush, or proprietary backlink discovery.</p></article>
          <article class="panel"><strong>No hidden site writes</strong><p>Agent actions, implementation packs, proof receipts, and growth briefs are records, handoffs, proof artifacts, and reviewable drafts. The browser does not call CMS admin APIs, publish pages, merge code, or use private provider credentials.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>Acceptance standard</h2>
        <p>A repair is treated as proof-backed only when the report names the issue, shows source evidence, gives a concrete fix, and includes an acceptance check that can be rerun. Rankings, traffic, indexing, citations, and revenue are never guaranteed.</p>
      </section>
      <section class="band">
        <h2>Why the repair queue exists</h2>
        <p>The most consistent complaint about SEO audit tools in 2026 is not that audits miss issues. It is that audits find too many issues, prioritize none of them, and nobody owns the backlog after delivery. An eighty-page PDF where every line item is marked high priority is functionally the same as no audit at all.</p>
        <div class="grid three">
          <article class="panel"><strong>The complaint</strong><p>Audits end at the recommendation. The fixes never ship. Nobody owns the backlog after delivery, and every finding is marked high priority so none of them are.</p></article>
          <article class="panel proof"><strong>The repair queue</strong><p>Every proven finding becomes a queue item with severity, source proof, a suggested action, approval state, and an acceptance check. The queue persists across saved reports — the backlog does not reset every time you scan.</p></article>
          <article class="panel proof"><strong>The proof receipt</strong><p>After a fix ships, a rerun issues a receipt that says fixed, still-open, new, or regressed. Owner-approved implementation packs turn approved actions into private handoff documents with source proof.</p></article>
        </div>
        <p>The audit layer is commoditized — free tools now render pages and compare static HTML with the rendered DOM. What no free tool has is a persistent repair queue with approval state, proof receipts after fixed reruns, and hosted crawl scope at site scale. That is the part that turns a list of findings into a closed loop, and it is why the repair queue is the hero of this product, not a footnote.</p>
      </section>
      <section class="band">
        <h2>Why not just use SEOmator's free audits?</h2>
        <p>SEOmator is the broadest free-tool competitor this page will name, and it earns the mention: its directory lists <a href="https://seomator.com/free-tools" rel="nofollow noopener" target="_blank">39 free SEO tools</a> with no signup, including a <a href="https://seomator.com/free-seo-audit-tool" rel="nofollow noopener" target="_blank">free SEO audit</a> that runs a 251-check rule engine across 16 categories and renders JavaScript, plus a dedicated <a href="https://seomator.com/geo-audit-tool" rel="nofollow noopener" target="_blank">free GEO audit</a> that crawls up to 50 pages, checks access for 14 AI-specific crawlers including GPTBot, ClaudeBot, and PerplexityBot, and scores citability, E-E-A-T, and schema gaps. There is also an npm CLI (<code>@seomator/seo-audit</code>). If what you need today is a broad free audit, that suite is a fair choice.</p>
        <p>The difference starts where the report ends. An audit — free or paid — hands you findings; SEO Fix Kit turns each proven finding into a persistent repair-queue item with severity, source proof, a suggested action, approval state, and an acceptance check, then re-measures after your fix ships so the queue says fixed, still-open, new, or regressed. For sites that need fixes rather than another findings list, that repair queue plus rerun proof is the product.</p>
        <p>Honest differences in the other direction: SEOmator's audit states a fixed check count where the anonymous one-page check here proves rendered-vs-static false-positive guarding per page, and its GEO audit reads AI-crawler access from robots.txt while AI Answer Readiness here is proof-derived from rendered pages without claiming live engine visibility. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees — the limits above apply to every comparison on this page.</p>
      </section>
      <section class="band">
        <h2>Why not just use Volume Nine's GEO Grader?</h2>
        <p>Volume Nine, a Denver-based digital marketing agency, publishes the <a href="https://www.v9digital.com/geo-grader/" rel="nofollow noopener" target="_blank">free GEO Grader</a>, an AI SEO audit whose quick facts list it as launched in January 2026 and totally free, with the grader itself running at <a href="https://geo.v9digital.com/grader/" rel="nofollow noopener" target="_blank">geo.v9digital.com</a>. It scores a site against 60+ signals across six categories — discoverability, structured data, AI readiness, performance, reputation and trust, and LLM-ready content — including a crawler-access check that reads robots.txt rules to verify whether AI and search crawlers are explicitly allowed in, and it samples models like ChatGPT, Claude, Gemini, Perplexity, and Grok live during a run. For a fast external read on how AI-ready a site looks, that is a fair choice.</p>
        <p>The difference starts where the score ends. The GEO Grader emails a detailed report with actionable to-dos; SEO Fix Kit turns each proven finding into a persistent repair-queue item with severity, source proof, a suggested action, approval state, and an acceptance check, then re-measures after your fix ships so the queue says fixed, still-open, new, or regressed. For sites that need fixes rather than another findings list, that repair queue plus rerun proof is the product.</p>
        <p>Honest differences in the other direction: the GEO Grader samples AI models live during a run, while AI Answer Readiness here is proof-derived from rendered pages without claiming live engine visibility, and Volume Nine's own FAQ notes scores can vary between runs because live conditions change. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees — the limits above apply to every comparison on this page.</p>
      </section>
      <section class="band">
        <h2>Why not just use Juma.ai's free GEO Audit?</h2>
        <p>Juma.ai publishes a <a href="https://geo.juma.ai/" rel="nofollow noopener" target="_blank">free GEO Audit</a> with no signup: paste a URL with no account and no credit card, and it returns a shareable report. The scoring rubric is a <a href="https://geo.juma.ai/methodology" rel="nofollow noopener" target="_blank">published open methodology</a> of ten weighted dimensions, every sub-check documented. Findings are ranked on an impact × effort matrix. The same GEO audit is also callable through Juma's public <a href="https://juma.ai/mcp" rel="nofollow noopener" target="_blank">MCP server</a> via a <code>run_geo_audit</code> tool. If what you need today is a free, no-account GEO score with an open rubric, that is a fair choice.</p>
        <p>The difference starts where the ranked report ends. Juma hands you a ranked report; SEO Fix Kit turns each proven finding into a persistent repair-queue item with severity, source proof, a suggested action, approval state, and an acceptance check, then re-measures after your fix ships so the queue says fixed, still-open, new, or regressed. For sites that need fixes rather than another findings list, that repair queue plus rerun proof is the product.</p>
        <p>Honest differences in the other direction: Juma's published methodology scores robots.txt crawler access, page HTML, Firecrawl-rendered content, and SERP/AI Overview citations rather than sampling ChatGPT, Claude, Gemini, or Perplexity live during a run, while AI Answer Readiness here is proof-derived from rendered pages without claiming live engine visibility. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees — the limits above apply to every comparison on this page.</p>
      </section>
      <section class="band">
        <h2>Why not just use AEO Engine's free GEO audit?</h2>
        <p>AEO Engine describes itself as a <a href="https://aeoengine.ai" rel="nofollow noopener" target="_blank">human-managed, AI-powered Growth Engine</a> and publishes a <a href="https://aeoengine.ai/geo-audit" rel="nofollow noopener" target="_blank">free GEO Audit</a> that reviews crawlability, schema, content structure, entity clarity, and citation readiness for generative engines such as ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews. The same page states that AEO Engine <a href="https://aeoengine.ai/geo-audit" rel="nofollow noopener" target="_blank">turns GEO audit findings into shipped fixes</a>: schema, crawl access, answer-ready page updates, comparison content, source building, and recurring AI visibility checks. It also offers an <a href="https://aeoengine.ai/embed/geo-audit?utm_source=embed&utm_medium=widget&utm_campaign=aeo_tools" rel="nofollow noopener" target="_blank">embeddable GEO audit widget</a> for other sites. If what you need is a free GEO audit plus a shipped-fix path and an embeddable widget, that is a fair choice.</p>
        <p>The difference starts where the fix ships. AEO Engine turns audit findings into shipped fixes; SEO Fix Kit turns each proven finding into an approval-first repair-queue item with severity, source proof, a suggested action, approval state, and an acceptance check, then re-measures after your fix ships so the queue says fixed, still-open, new, or regressed. For sites that need an approval gate and rerun proof before anything changes, that repair queue plus rerun proof is the product.</p>
        <p>Honest differences in the other direction: AEO Engine's shipped-fix path makes it a fast execution service, while SEO Fix Kit does not publish CMS changes, open pull requests, merge code, or call provider admin APIs — every action is owner-approved and comes with a rerun proof receipt. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees — the limits above apply to every comparison on this page.</p>
      </section>
      <section class="band">
        <h2>Why not just use a tracker like Otterly.ai or Peec.ai?</h2>
        <p>Otterly.ai and Peec.ai are the funded AI-visibility trackers this page will name. <a href="https://otterly.ai" rel="nofollow noopener" target="_blank">Otterly.ai</a> says it is trusted by 40,000+ Marketing Pros worldwide; its <a href="https://otterly.ai/pricing" rel="nofollow noopener" target="_blank">pricing page</a> lists a $29/mo Lite plan with Tracking of 4 AI Search Engines: ChatGPT, Google AI Overviews, Perplexity, MS Copilot — with Claude, Google AI Mode, Gemini as paid add-ons. <a href="https://peec.ai" rel="nofollow noopener" target="_blank">Peec AI</a> says it is trusted by 3000+ brands and agencies; its <a href="https://peec.ai/pricing" rel="nofollow noopener" target="_blank">pricing page</a> lists a $80/mo Starter plan (annual, 50 prompts), and its <a href="https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search" rel="nofollow noopener" target="_blank">funding announcement</a> states a $21M Series A led by Singular, following a Seed led by 20VC, for total funding to $29M. Both track how a brand appears across AI search engines — mentions, position, and sentiment — rather than auditing the rendered page. If what you need is ongoing AI-visibility monitoring, those are fair choices.</p>
        <p>The difference starts where the tracker ends. A tracker tells you whether your brand is mentioned, visible, and perceived across AI search engines; SEO Fix Kit turns each proven page-level finding into a persistent repair-queue item with severity, source proof, a suggested action, approval state, and an acceptance check, then re-measures after your fix ships so the queue says fixed, still-open, new, or regressed. For sites that need fixes rather than another visibility score, that repair queue plus rerun proof is the product.</p>
        <p>Honest differences in the other direction: both trackers observe AI search outputs to report visibility, position, and sentiment, while AI Answer Readiness here is proof-derived from rendered pages, schema, canonicals, links, sitemap context, and optional llms.txt without claiming live engine visibility. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees — the limits above apply to every comparison on this page.</p>
      </section>
      <section class="band">
        <h2>Why not just use an agentic SEO auditor that files its own GitHub issues?</h2>
        <p>SEO Automation Club <a href="https://seoautomationclub.com/agentic-seo-autonomous-technical-audit-claude-code-github-issues/" rel="nofollow noopener" target="_blank">published a teardown</a> of the clearest current example of this shape: a scheduled, diff-first technical auditor that does not stop at a report. It crawls on a cadence, diffs the latest run against the previous run, and files a GitHub issue only for findings that are genuinely new. Resolved findings auto-close their matching issue; persisting findings can roll up into a single escalation instead of creating hundreds of individual tickets. For engineering teams that want SEO findings turned straight into a triage queue, that pattern is a fair choice.</p>
        <p>The trade-off is exactly where the ticket lands. An autonomous agent that files issues has no approval gate before the issue is created, no source-proof handoff, and no re-measurement that issues a proof receipt after the fix is applied. If a finding is a rendered-vs-static false positive, the issue is still filed; if the fix introduces a regression, the agent sees it only on the next scheduled run.</p>
        <p>SEO Fix Kit's repair queue is the hosted alternative: every proven finding becomes a queue item with severity, source proof, a suggested action, and an acceptance check, and nothing is approved until the owner says so. After the fix ships, a rerun issues a receipt that says fixed, still-open, new, or regressed. The agentic auditor automates ticket creation; the repair queue automates proof, approval, and rerun. For sites where a wrong fix can break revenue, that inspection loop is the safer shape.</p>
        <p>This is about issue-filing agents, not the separate class of agents that edit source code directly. Those are a different trade-off and are not what this section is comparing. The same boundaries apply: No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>Why not just use a free AI SEO agent skill?</h2>
        <p>Free installable SEO agent skills are genuinely useful for quick, single-page checks: read a page, spot a missing title or description, draft a fix. Open-source SEO tooling is good at that, and you should keep using it. Those skills run per prompt, though, with no persisted state across a whole site.</p>
        <p>The hosted product earns its place by doing the parts that need infrastructure and persistence: rendered crawl scope at site scale (self-serve audits up to 1,000 pages, sitemap inventory up to 50,000 discovered URLs, and staged large rendered crawl jobs), a persistent repair queue with approval, acceptance checks, and fixed-rerun proof receipts, owner-approved implementation packs, and paid Fix Pack fulfillment with one rerun after fixes.</p>
        <p>The boundaries stay the same as a free skill's: no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees. If a one-page check is all you need, <a href="${origin}/check">${origin}/check</a> is free and needs no account; if you need the hosted loop, see <a href="${origin}/pricing">pricing</a>.</p>
      </section>
    `
  });
}

// Plans shown on /pricing. Each row of PRICING_FEATURES says which plans
// include it, so the cards and the comparison table cannot disagree.
const PRICING_PLANS = [
  {
    key: "check",
    name: "Page check",
    price: "Free",
    cadence: "No account needed",
    summary: "See what a real browser finds on one public page, with the evidence.",
    cta: { label: "Check a page", href: "/check" }
  },
  {
    key: "audit",
    name: "Site audit",
    price: "Free",
    cadence: "During the beta",
    summary: "Audit your whole site, keep the reports, and get a repair queue your developer can work from.",
    cta: { label: "Get started", href: "/#get-started" },
    featured: true
  },
  {
    key: "fixpack",
    name: "Fix Pack",
    price: FIX_PACK_PUBLIC_PRICE.replace(/\.00 one-time$/, ""),
    cadence: "One-time, per report",
    summary: "We work through the proven fixes on one report with you, then rerun the audit to prove what got fixed.",
    cta: { label: "Start with a free audit", href: "/#get-started" }
  }
];

const PRICING_FEATURES = [
  { label: "Real-browser rendering with page evidence", plans: ["check", "audit", "fixpack"] },
  { label: "False alarms filtered out", plans: ["check", "audit", "fixpack"] },
  { label: "Pages per audit", values: { check: "1", audit: "Up to 1,000", fixpack: "Up to 1,000" } },
  { label: "Saved reports and history", plans: ["audit", "fixpack"] },
  { label: "Repair queue with ready-to-paste fixes", plans: ["audit", "fixpack"] },
  { label: "Weekly monitoring for verified sites", plans: ["audit", "fixpack"] },
  { label: "Developer API and webhooks", plans: ["audit", "fixpack"] },
  { label: "Guided repair pass on one report", plans: ["fixpack"] },
  { label: "Rerun with a before/after proof receipt", plans: ["fixpack"] }
];

const PRICING_FAQ = [
  {
    q: "When do I pay?",
    a: `Only when a report finds something worth fixing. Audits are free during the beta. The Fix Pack (${FIX_PACK_PUBLIC_PRICE}) is offered from a report that has real, proven fixes, and the final price including any local tax is shown at checkout before you pay.`
  },
  {
    q: "Who processes payment?",
    a: "Dodo Payments handles checkout as merchant of record, so they take care of cards, local taxes, and receipts. We never see or store your card details."
  },
  {
    q: "What if the Fix Pack cannot start?",
    a: "If payment goes through but the repair queue cannot start, we refund you. The support page has the full refund policy."
  },
  {
    q: "Do you guarantee rankings or traffic?",
    a: "No. Nobody honest can. We prove what is broken, help you fix it, and rerun the same check to show it is fixed. No ranking or traffic guarantee is made."
  },
  {
    q: "Will you change my site?",
    a: "No. Nothing is applied to your site. You approve each fix and your team or developer ships it; then we rerun the audit to confirm."
  },
  {
    q: "Why pay more for a Fix Pack when GEO Auditor applies agent fixes at $29?",
    a: "GEO Auditor's Agent Fix Mode hands you one command and your AI agent applies every fix automatically. That is fast and fairly priced. The Fix Pack is the careful alternative: every fix comes with evidence from a real browser, you approve each one before anything changes, and a rerun shows what actually got fixed."
  },
  {
    q: "Is Proof Monitoring available?",
    a: "Weekly monitoring is included free for verified sites during the beta. A paid monitoring plan is coming soon; it is not on sale yet."
  }
];

function pricingCheck(included) {
  return included
    ? `<span class="tick" aria-label="Included">✓</span>`
    : `<span class="dash" aria-label="Not included">–</span>`;
}

// One card line per feature: "Up to 1,000 pages per audit" for value rows.
function planFeatureLine(feature, planKey) {
  if (!feature.values) return feature.label;
  const value = feature.values[planKey];
  return `${value} ${value === "1" ? "page" : "pages"} per audit`;
}

// Each card lists only what it adds over the plan before it, under an
// "Everything in X, plus:" lead, so the difference reads at a glance. The
// full grid stays in the comparison table below.
function planFeatureLines(plan, index) {
  const previous = PRICING_PLANS[index - 1];
  const included = (feature, key) => Boolean(feature.values?.[key]) || Boolean(feature.plans?.includes(key));
  return PRICING_FEATURES.filter((feature) => {
    if (!included(feature, plan.key)) return false;
    if (!previous) return true;
    if (feature.values) return feature.values[plan.key] !== feature.values[previous.key];
    return !included(feature, previous.key);
  }).map((feature) => planFeatureLine(feature, plan.key));
}

function pricingHtml(origin) {
  const cards = PRICING_PLANS.map((plan, index) => {
    const previous = PRICING_PLANS[index - 1];
    return `
        <article class="plan${plan.featured ? " featured" : ""}">
          ${plan.featured ? `<p class="plan-badge">Most popular</p>` : ""}
          <h2>${escapeHtml(plan.name)}</h2>
          <p class="plan-price"><strong>${escapeHtml(plan.price)}</strong><span>${escapeHtml(plan.cadence)}</span></p>
          <p class="plan-summary">${escapeHtml(plan.summary)}</p>
          <a class="btn ${plan.featured ? "btn-primary" : "btn-secondary"}" href="${origin}${plan.cta.href}">${escapeHtml(plan.cta.label)}</a>
          <p class="plan-includes">${previous ? `Everything in ${escapeHtml(previous.name)}, plus:` : "Includes:"}</p>
          <ul>
            ${planFeatureLines(plan, index)
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join("")}
          </ul>
        </article>`;
  }).join("");
  const rows = PRICING_FEATURES.map(
    (feature) => `
            <tr>
              <th scope="row">${escapeHtml(feature.label)}</th>
              ${PRICING_PLANS.map((plan) => `<td>${feature.values ? escapeHtml(feature.values[plan.key]) : pricingCheck(feature.plans.includes(plan.key))}</td>`).join("")}
            </tr>`
  ).join("");
  return publicProductPageHtml({
    origin,
    path: "/pricing",
    title: "Pricing",
    description: `Free one-page checks and free site audits during the beta. Pay ${FIX_PACK_PUBLIC_PRICE} for a Fix Pack only when a report finds real fixes.`,
    eyebrow: "Pricing",
    heading: "Free to find it. Pay only to fix it.",
    lead: "Check pages and audit your site for free. When a report finds real problems, a one-time Fix Pack walks you through the repairs and proves they worked.",
    body: `
      <section class="plans" id="plans" aria-label="Plans">${cards}
      </section>
      <section class="band">
        <h2>Compare plans</h2>
        <table class="compare">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Feature</span></th>
                ${PRICING_PLANS.map((plan) => `<th scope="col">${escapeHtml(plan.name)}<span>${escapeHtml(plan.price)}</span></th>`).join("")}
              </tr>
            </thead>
            <tbody>${rows}
            </tbody>
          </table>
      </section>
      <section class="band coming">
        <div>
          <p class="eyebrow">Coming soon</p>
          <h2>Proof Monitoring</h2>
          <p>Weekly reruns, before/after changes, and alerts when something breaks again. Included free for verified sites during the beta; a paid plan is not on sale yet.</p>
        </div>
        <a class="btn btn-secondary" href="${origin}/methodology">How monitoring works</a>
      </section>
    `,
    faq: PRICING_FAQ,
    extraStyle: `
      .plans { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 48px; }
      .plan { align-content: start; background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); display: grid; gap: 16px; padding: 28px 24px; position: relative; min-width: 0; }
      .plan.featured { background: linear-gradient(180deg, var(--accent-surface), transparent 45%), var(--card-bg); border-color: var(--line-accent); box-shadow: var(--shadow-accent); }
      .plan h2 { font-size: 20px; margin: 0; }
      .plan-badge { background: var(--accent); border-radius: 999px; color: var(--accent-ink); font-size: 12px; font-weight: 600; justify-self: start; margin: 0; padding: 4px 10px; position: absolute; right: 20px; top: 24px; }
      .plan-price { display: grid; gap: 4px; margin: 0; }
      .plan-price strong { color: var(--ink); font-size: 44px; letter-spacing: -0.03em; line-height: 1; }
      .plan-price span { color: var(--ink-muted); font-size: 14px; }
      .plan-summary { margin: 0; min-height: 78px; }
      .plan .btn { width: 100%; }
      .plan-includes { border-top: 1px solid var(--line); color: var(--ink); font-size: 14px; font-weight: 600; margin: 4px 0 0; padding-top: 20px; }
      .plan ul { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
      .plan li { font-size: 15px; line-height: 1.5; padding-left: 26px; position: relative; }
      .plan li::before { color: var(--accent); content: "✓"; font-weight: 700; left: 0; position: absolute; }
      .compare { border-collapse: collapse; table-layout: fixed; width: 100%; }
      .compare th:first-child { width: 40%; }
      .compare th, .compare td { border-bottom: 1px solid var(--line); font-size: 15px; padding: 14px 12px; text-align: center; }
      .compare thead th { color: var(--ink); font-weight: 600; vertical-align: bottom; }
      .compare thead th span { color: var(--ink-muted); display: block; font-size: 13px; font-weight: 500; margin-top: 2px; }
      .compare tbody th { color: var(--ink-soft); font-weight: 500; text-align: left; }
      .compare td { color: var(--ink-soft); }
      .compare .tick { color: var(--accent); font-weight: 700; }
      .compare .dash { color: var(--ink-muted); }
      .coming { align-items: center; display: flex; flex-wrap: wrap; gap: 16px 32px; justify-content: space-between; }
      .coming > div { max-width: 680px; }
      .coming p:last-child { margin-bottom: 0; }
      .sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
      @media (max-width: 900px) { .plans { grid-template-columns: 1fr; } .plan-summary { min-height: 0; } }
      @media (max-width: 600px) { .compare th, .compare td { font-size: 13px; overflow-wrap: anywhere; padding: 12px 4px; } .compare th:first-child { width: 34%; } .compare thead th span { font-size: 12px; } }
    `
  });
}

function smallBusinessSeoAuditHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/small-business-seo-audit",
    title: "Small Business SEO Audit",
    description:
      "An SEO audit for small businesses: check one page free, see the evidence behind each problem, and pay for a repair pass only when real fixes exist.",
    eyebrow: "Small-business SEO audit",
    heading: "An SEO audit that shows proof, not homework.",
    lead: "Small businesses lose hours to audit tools that dump red flags and generic checklists. SEO Fix Kit checks one page free, shows the rendered proof behind each finding, and only queues a repair when the browser-visible page is actually wrong.",
    softwareDescription:
      "Private-beta SEO repair software for small businesses that turns rendered proof into safe repair queues, approval records, and rerun checks.",
    body: `
      <section class="band">
        <h2>What a small-business audit should actually show</h2>
        <ul class="check-list">
          <li>The earliest failure stage on each URL, with page-level evidence you can open and re-check.</li>
          <li>Which findings are real and which are static-crawler false positives on JavaScript-rendered pages.</li>
          <li>A plain-language repair brief with priority, effort, and an acceptance check you can rerun after a change ships.</li>
          <li>Fixed, still-open, new, and regressed status on reruns instead of a one-time red-flag dump.</li>
        </ul>
      </section>
      <section class="grid three" aria-label="How to start">
        <article class="panel proof"><strong>Free one-page check</strong><p>Paste a public URL at ${origin}/check. You get real-browser evidence, the false alarms it rules out, and real problems with fixes — no account, no email, nothing stored.</p></article>
        <article class="panel"><strong>Private audit for your site</strong><p>Request a secure email access link for rate-limited private audits. Verified hosts unlock self-serve crawl depth up to 1,000 pages per queued audit.</p></article>
        <article class="panel"><strong>Fix Pack only when fixes exist</strong><p>The paid offer is one proof-backed repair pass tied to one report, plus one rerun after fixes. Dodo shows the checkout price before payment.</p></article>
      </section>
      <section class="band">
        <h2>Why proof beats a checklist</h2>
        <p>A generic audit can say "add an H1" to a page whose rendered version already has one. SEO Fix Kit opens the page in a real browser, compares raw HTML with the rendered DOM, and keeps that item out of the repair queue. The same standard applies to every report: render, prove, queue, re-measure.</p>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page is a landing page, not an audit of your site. The free check covers one public page at one moment; full multi-page reports run inside the private beta. SEO Fix Kit does not replace Ahrefs or Semrush, does not provide live AI citation monitoring or answer-engine sampling, and never guarantees rankings, traffic, indexing, or revenue.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/pricing">See pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Is there a free way to check my site before requesting access?",
        a: "Yes. The one-page check at /check accepts one public URL, renders it in a real browser, and returns proof fields and findings when present, with no account, no email, and nothing stored."
      },
      {
        q: "What does the paid Fix Pack include?",
        a: "One proof-backed repair pass tied to one saved report, plus one rerun after fixes. Dodo shows the checkout price before payment, and no ranking, traffic, or revenue promise is made."
      },
      {
        q: "Do I need to verify my site to start?",
        a: "A one-page Lite check runs before verification. Verified hosts unlock normal self-serve crawl depth up to 1,000 pages per queued audit."
      },
      {
        q: "Will SEO Fix Kit guarantee my rankings?",
        a: "No. Reports are diagnostic and reflect what the crawl and browser render could observe at scan time. Rankings, traffic, indexing, and revenue are never guaranteed."
      }
    ]
  });
}

function renderedVsStaticAuditHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/rendered-vs-static-seo-audit",
    title: "Rendered vs Static SEO Audit",
    description:
      "AI crawlers like GPTBot read raw HTML and skip JavaScript. Compare raw HTML with the rendered page to see what they miss, without false alarms.",
    eyebrow: "AI crawler visibility · Rendered vs static audit",
    heading: "Static scanners invent work. AI crawlers miss content. Rendered proof handles both.",
    lead: "JavaScript-heavy sites fail static scanners that read the raw app shell, and AI crawlers never execute JavaScript at all. SEO Fix Kit opens the page in a real browser, compares raw HTML with the rendered DOM, shows exactly what a JavaScript-blind crawler can see, and only creates a repair when the browser-visible page is actually wrong.",
    softwareDescription:
      "Private-beta SEO repair software that renders pages in a real browser to compare static HTML with the final DOM — measuring AI crawler visibility for JavaScript-blind crawlers and guarding static-crawler false positives.",
    body: `
      <section class="grid three" aria-label="Static scanner vs rendered proof">
        <article class="panel"><strong>Static scanner</strong><p>No H1. No internal links. Thin content. Needs cleanup.</p></article>
        <article class="panel proof"><strong>Rendered proof</strong><p>Browser render shows a real H1, normal internal links, and substantial page content.</p></article>
        <article class="panel"><strong>Repair brief</strong><p>No duplicate H1. No fake internal links. No busywork. Keep monitoring and rerun after real content changes.</p></article>
      </section>
      <section class="band">
        <h2>The same diff is your AI crawler visibility check</h2>
        <p>Search Engine Journal confirms the major AI crawlers — GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot, and CCBot — fetch raw HTML and do not execute JavaScript. A page whose content appears only after a browser render hands those crawlers an empty shell: no headings, no internal links, no text to retrieve or cite. The rendered-vs-static comparison doubles as an AI crawler visibility check, because the raw-HTML side of the diff is precisely what those crawlers can read.</p>
      </section>
      <section class="band">
        <h2>Why this matters for repair work</h2>
        <p>An agent that trusts a static crawl can make a site worse: if a scanner says "add an H1" when the rendered page already has one, the suggested repair is a duplicate heading, not a fix. Rendered-vs-static comparison separates a crawler limitation from a real customer problem, so the repair queue only receives proven findings — and the same proof tells you which pages are invisible to AI crawlers until the content ships in the raw HTML.</p>
      </section>
      <section class="band">
        <h2>Compared with free static-vs-rendered checkers</h2>
        <p>Three free tools already publish a static-vs-rendered or JavaScript-blind-crawler check, and they deserve a straight answer rather than a feature table.</p>
        <ul class="check-list">
          <li><a href="https://llmpulse.ai/geo-crawlability-checker" rel="nofollow noopener" target="_blank">LLM Pulse GEO Crawlability Checker</a> fetches the page as a plain HTTP request and again with JavaScript rendering, then diffs headings, body copy, links, meta tags, and structured data. The checker is free; the report is emailed. LLM Pulse also hosts a broader free GEO suite at <a href="https://llmpulse.ai/free-ai-search-tools" rel="nofollow noopener" target="_blank">llmpulse.ai/free-ai-search-tools</a>.</li>
          <li><a href="https://freeseoaudit.vercel.app/" rel="nofollow noopener" target="_blank">Free SEO Auditor</a> (open-source MIT, <a href="https://github.com/ravigupta0210/seo-auditor" rel="nofollow noopener" target="_blank">ravigupta0210/seo-auditor</a>) ships a no-signup audit with copy-paste fixes, a JS-dependency check, cloaking detection across five AI user-agents, and an optional Playwright renderer. Site-wide crawls default to 25 pages from sitemap.xml.</li>
          <li><a href="https://github.com/abouchard11/geo-crawl-audit" rel="nofollow noopener" target="_blank">geo-crawl-audit</a> is a zero-dependency Python+curl probe: baseline browser UA then ~12 real AI crawler UAs, TTFB, bot differentials, and a raw-HTML classification of SSR_FULL / SSR_THIN / CSR_SHELL with no JavaScript execution. A free single-domain scan is at <a href="https://readablebyai.com" rel="nofollow noopener" target="_blank">readablebyai.com</a>.</li>
        </ul>
        <p>If you only need that one-page diff, those tools are a fair choice. SEO Fix Kit uses the same rendered-vs-static comparison as a false-positive guard so the persistent repair queue only receives proven findings, then issues a rerun proof receipt that says fixed, still-open, new, or regressed. Hosted crawl scope is self-serve audits up to 1,000 pages, sitemap inventory up to 50,000 discovered URLs, and staged large rendered crawl jobs. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>Where you can see it live</h2>
        <ul class="check-list">
          <li>${origin}/demo: the public sample shows a static scanner's false positive against the rendered proof, step by step.</li>
          <li>${origin}/check: paste any public URL and get real-browser evidence, the false alarms it rules out, and real problems with fixes — no account and nothing stored.</li>
          <li>Private reports for verified sites include rendered crawl intelligence, resource waterfall proof, and rerun deltas.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>The one-page check covers a single public URL, not a full site audit. Full multi-page reports run inside the private beta. AI crawler visibility here means what a fetcher that does not execute JavaScript can retrieve from your raw HTML, based on public reporting about those crawlers — it is not live sampling of ChatGPT, Perplexity, or any answer engine, and SEO Fix Kit does not provide live AI citation monitoring or answer-engine sampling. Rendered proof does not guarantee rankings, traffic, indexing, revenue, or AI citations.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/pricing">See pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Why does my static SEO tool report problems I cannot see in the browser?",
        a: "Static scanners read the raw HTML response and miss content rendered by JavaScript. SEO Fix Kit renders the page in a real browser and only reports what the final DOM actually shows."
      },
      {
        q: "Which AI crawlers cannot see JavaScript-rendered content?",
        a: "Search Engine Journal confirms GPTBot, ClaudeBot, PerplexityBot, and CCBot fetch raw HTML without executing JavaScript. If your page's content exists only in the rendered DOM, those crawlers never see it — the rendered-vs-static diff shows exactly what they can."
      },
      {
        q: "Is AI crawler visibility the same as sampling ChatGPT or Perplexity?",
        a: "No. SEO Fix Kit never queries AI engines. Visibility here is measured from your own pages: the raw HTML is what a JavaScript-blind crawler can retrieve, and the rendered DOM is what a browser user gets."
      },
      {
        q: "Can I see a rendered-vs-static example before signing up?",
        a: "Yes. The public sample at /demo shows a static scanner false positive against the rendered proof, and the free one-page check at /check runs the same proof loop on any public URL."
      },
      {
        q: "Why not use a free static-vs-rendered checker like LLM Pulse?",
        a: "Use one if you only need a one-page static-vs-rendered diff. LLM Pulse, Free SEO Auditor, and geo-crawl-audit already do that for free. SEO Fix Kit uses the same comparison to keep false positives out of a persistent repair queue with approval state and a rerun proof receipt. It does not sample live answer engines or monitor citations."
      },
      {
        q: "Does rendered proof mean guaranteed fixes or rankings?",
        a: "No. Every report is diagnostic and reflects what the crawl could observe at scan time. Rankings, traffic, indexing, revenue, and AI citations are never guaranteed."
      },
      {
        q: "How does the repair queue use rendered proof?",
        a: "Only proven findings become queue items. Each item keeps its source proof, suggested action, effort estimate, and an acceptance check that can be rerun after a change ships."
      }
    ]
  });
}

function aiAnswerReadinessHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/ai-answer-readiness",
    title: "AI Answer Readiness Check",
    description:
      "A site-proof AI Answer Readiness check with optional traffic-ranked faults from imported Search Console rows — no live citation monitoring, no auto-join to GA4.",
    eyebrow: "AI Answer Readiness",
    heading: "A site-proof AI readiness check, not a citation tracker.",
    lead: "AI search visibility starts with content and markup answer engines can actually use. SEO Fix Kit derives AI Answer Readiness from your rendered pages, schema, links, sitemap context, and optional llms.txt. When you import Search Console rows, those proof-derived faults are ranked by the traffic behind them. It does not sample live answer engines or monitor citations.",
    softwareDescription:
      "Private-beta SEO repair software with proof-derived AI Answer Readiness checks built from rendered content, schema, canonical and internal-link clarity, sitemap context, and optional llms.txt reachability. Imported Search Console rows rank those faults by clicks and impressions on the affected pages.",
    body: `
      <section class="band">
        <h2>What the readiness check measures</h2>
        <ul class="check-list">
          <li>Rendered content depth: whether the browser-visible page carries substantive, crawlable text.</li>
          <li>Helpful schema: Organization, WebSite, SoftwareApplication, WebPage, FAQPage, and product markup that names entities clearly.</li>
          <li>Canonical and internal-link clarity: one canonical per URL and a link graph an engine can follow.</li>
          <li>Question-led structure: headings and copy that answer the questions searchers and answer engines ask.</li>
          <li>Sitemap context and coverage, plus optional llms.txt reachability when present.</li>
          <li>Traffic-ranked prioritization: when Search Console or rank-tracker rows are imported, faults on pages with more clicks and impressions come first.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Compared with CrawlRaven</h2>
        <p>CrawlRaven defines AI search readiness auditors as tools that find the technical reasons you are not cited, and it sells a one-time readiness audit that joins Search Console and GA4 so faults are ranked by the traffic behind them. SEO Fix Kit's AI Answer Readiness wedge is the same job: prove why a rendered page is hard for an answer engine to use.</p>
        <ul class="check-list">
          <li>When you import Search Console or rank-tracker rows, SEO Fix Kit ranks proof-derived readiness faults by the clicks and impressions on the affected pages.</li>
          <li>SEO Fix Kit does not connect to Search Console or GA4 automatically, and it does not sample ChatGPT, Perplexity, Google AI Overviews, or other engines.</li>
          <li>Proof without traffic is still useful: a tracker can say a page is invisible, while a readiness check says why the rendered page is thin, unclear, or missing schema. Traffic ranking then puts the proven faults that sit on pages with search demand first.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Compared with free AI visibility checkers</h2>
        <p>Free tools such as these check whether AI engines cite or mention your site. That is AI citation tracking. SEO Fix Kit does not check AI-engine citations or visibility scores.</p>
        <ul class="check-list">
          <li><a href="https://definiteseo.com/ai-visibility-checker" rel="nofollow noopener" target="_blank">DefiniteSEO</a> is a free AI visibility checker that sees whether ChatGPT and Google AI Overviews cite your site.</li>
          <li><a href="https://revsurgedigital.com/free-tools/geo-audit" rel="nofollow noopener" target="_blank">RevSurge Digital</a> is a free GEO audit that checks whether AI answer engines can read, understand, and cite your website.</li>
          <li><a href="https://answervisibilitylab.com/geo-audit-tool" rel="nofollow noopener" target="_blank">Answer Visibility Lab</a> is a free GEO audit tool that checks brand mentions and owned-URL citations across ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews.</li>
          <li><a href="https://websiteaeogeochecker.com" rel="nofollow noopener" target="_blank">Website AEO GEO Checker</a> is a free AEO and GEO checker for AI search that shows how ChatGPT, Perplexity, Gemini, Claude AI, and Bing AI read your site.</li>
          <li><a href="https://www.veuno.com/ai-visibility-checker" rel="nofollow noopener" target="_blank">Veuno</a> is a free AI visibility checker that scores how easily ChatGPT, Claude, Perplexity, and Google AI Overviews can find, understand, and cite your website.</li>
        </ul>
        <p>If you only need that visibility score, those tools are a fair choice. SEO Fix Kit stays on the site-proof side: readiness here is derived from your rendered pages, schema, links, sitemap context, and optional llms.txt, and only proven findings reach the persistent repair queue with a rerun proof receipt.</p>
        <p>No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>On "technical readiness predicts nothing (r=0.009)"</h2>
        <p>getaisearchscore.com's own study — 441 domains, Perplexity-only citations, cross-sectional — found its original 26-check aggregate score did not predict citations (r=0.009), and it rebuilt its product around content relevance. That null is real, and it matches our boundary rather than refuting it:</p>
        <ul class="check-list">
          <li>The null is on one vendor's aggregate score, not on individual technical faults. A site that blocks AI crawlers is invisible; a site with an app-shell render is empty to an extractor. getaisearchscore.com itself calls AI-crawler access "the only structural factor with an unambiguous effect."</li>
          <li>The study could not see content that only appears after JavaScript renders. SEO Fix Kit judges readiness on the rendered page — the DOM an answer engine would actually parse — not on a static crawl.</li>
          <li>"Not sufficient" is not "predicts nothing." The vendor's own Readiness Paradox (low-scoring established brands cited at 38.8%) is a domain-authority confound, not a proof that technical faults do not matter.</li>
        </ul>
        <p>SEO Fix Kit's AI Answer Readiness is proof-derived from the rendered page and never claims to predict citations. Readiness is a diagnostic, not a citation guarantee. Content relevance is the citation driver; technical health is the hygiene floor that keeps content retrievable at all. We agree with getaisearchscore.com on both halves.</p>
      </section>
      <section class="grid two" aria-label="Readiness boundaries">
        <article class="panel"><strong>No live answer-engine sampling</strong><p>SEO Fix Kit does not query ChatGPT, Perplexity, Google AI Overview, or other engines to see what they answer about your site.</p></article>
        <article class="panel"><strong>No AI citation monitoring</strong><p>There is no live tracking of citations, mentions, or visibility scores across AI engines.</p></article>
        <article class="panel"><strong>llms.txt stays optional</strong><p>llms.txt reachability is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or generative search surfaces.</p></article>
        <article class="panel"><strong>Site-proof only</strong><p>Readiness is derived from your rendered pages, schema, links, sitemap, and optional llms.txt — not from any engine's internal behavior.</p></article>
      </section>
      <section class="band">
        <h2>How to get the check</h2>
        <ul class="check-list">
          <li>Free: paste a public URL at ${origin}/check for real-browser evidence, the false alarms it rules out, and real problems with fixes — no account and nothing stored.</li>
          <li>Private reports for verified sites include proof-derived AI Answer Readiness checks beside the rendered crawl evidence. Import Search Console rows on the same audit to rank those faults by traffic.</li>
          <li>Read the exact boundaries on ${origin}/methodology before relying on any readiness signal.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page is a landing page, not a readiness report for your site. SEO Fix Kit does not provide live AI citation monitoring or answer-engine sampling, does not auto-join Search Console or GA4, and does not guarantee rankings, traffic, AI citations, or revenue.</p>
      </section>
      <section class="band">
        <h2>Start with proof</h2>
        <p><a class="cta" href="${origin}/check">Check one page now</a></p>
        <p><a href="${origin}/demo">View the proof sample</a> · <a href="${origin}/methodology">Read methodology and limits</a> · <a href="${origin}/pricing">See pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Is AI Answer Readiness the same as monitoring citations in ChatGPT or Perplexity?",
        a: "No. Readiness is site-proof: it evaluates what your rendered pages, schema, links, sitemap context, and optional llms.txt allow an answer engine to understand. Live answer-engine sampling, AI citation monitoring, and AI visibility score tracking are not live."
      },
      {
        q: "Does SEO Fix Kit rank AI readiness faults by traffic like CrawlRaven?",
        a: "When you import Search Console or rank-tracker rows, yes: readiness faults are ranked by the clicks and impressions on the affected pages. SEO Fix Kit does not auto-join Search Console or GA4, and it does not provide live AI citation monitoring or answer-engine sampling."
      },
      {
        q: "Do I need an llms.txt file to pass the check?",
        a: "No. llms.txt reachability is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or generative search surfaces."
      },
      {
        q: "Can I check my site's AI readiness for free?",
        a: "The anonymous one-page check at /check renders one public URL and returns proof fields and findings when present. Full proof-derived AI Answer Readiness checks appear in private reports for verified sites."
      },
      {
        q: "Does a good readiness signal guarantee AI visibility?",
        a: "No. Readiness is a site-proof diagnostic, and rankings, traffic, AI citations, and revenue are never guaranteed."
      }
    ]
  });
}

// Shared public product page shell. `faq` is an array of { q, a } pairs that is
// rendered as a visible section AND emitted as FAQPage JSON-LD, so machine
// schema can never drift from the visible copy. `softwareDescription`, when
// provided, adds a truthful SoftwareApplication block for the tool itself.
function publicProductPageHtml({
  origin,
  path,
  title,
  description,
  eyebrow,
  heading,
  lead,
  body,
  faq = [],
  softwareDescription = null,
  extraStyle = ""
}) {
  const extraLd = [];
  if (softwareDescription) {
    extraLd.push(
      ldBlock({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "SEO Fix Kit",
        applicationCategory: "SEO software",
        operatingSystem: "Web",
        url: origin,
        provider: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
        description: softwareDescription
      })
    );
  }
  if (faq.length > 0) {
    extraLd.push(
      ldBlock({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a }
        }))
      })
    );
  }
  const faqSection =
    faq.length > 0
      ? `
      <section class="band" aria-label="Frequently asked questions">
        <h2>Frequently asked questions</h2>
        <div class="faq-list">
          ${faq.map(({ q, a }) => `<article class="faq-item"><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></article>`).join("")}
        </div>
      </section>
    `
      : "";
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
${pageSocialHead({ origin, title: `${title} - SEO Fix Kit`, description, path })}
${extraLd.join("\n")}
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 1120px; padding: clamp(40px, 6vw, 72px) 22px 72px; min-width: 0; }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 0; max-width: 860px; overflow-wrap: break-word; }
      h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.2; margin: 0 0 16px; overflow-wrap: break-word; }
      h3 { font-size: 18px; line-height: 1.4; margin: 0 0 8px; }
      p, li { color: var(--ink-soft); font-size: 16px; line-height: 1.65; overflow-wrap: anywhere; }
      p { margin: 0 0 16px; }
      ul { margin: 0; padding-left: 22px; }
      .eyebrow { margin: 0 0 16px; }
      .lead { color: var(--ink-soft); font-size: clamp(18px, 2.2vw, 22px); line-height: 1.55; margin: 24px 0 0; max-width: 760px; }
      .hero { margin-bottom: 48px; }
      .band { border-top: 1px solid var(--line); padding: 40px 0; }
      .band > p:last-child { margin-bottom: 0; }
      .grid, .package-grid { display: grid; gap: 16px; }
      .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid.two, .package-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      section.grid { margin: 0 0 40px; }
      .panel, .package-card { align-content: start; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: 8px; padding: 20px; min-width: 0; }
      .panel p, .package-card p { margin: 0; }
      .package-card { gap: 12px; padding: 24px; }
      .panel.proof, .package-card.live { border-color: var(--line-accent); }
      .panel strong, .package-card span { color: var(--accent); font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
      .package-card h2 { margin: 0; }
      .package-price { border-left: 3px solid var(--gold); color: var(--ink); margin: 2px 0; padding-left: 12px; }
      .package-price strong { color: var(--gold); font-size: 22px; font-weight: 700; }
      .package-card a { align-items: center; border: 1px solid var(--line-accent); border-radius: var(--radius-lg); display: inline-flex; font-size: 14px; justify-content: center; min-height: 40px; padding: 0 14px; width: fit-content; }
      .package-card a:hover { background: var(--accent-surface); border-color: var(--accent); text-decoration: none; }
      .check-list { display: grid; gap: 12px; list-style: none; margin: 0 0 16px; padding-left: 0; }
      .check-list li { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 14px 16px; min-width: 0; }
      .faq-list { display: grid; gap: 12px; }
      .faq-item { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 20px; min-width: 0; }
      .faq-item p { margin: 0; }
      @media (max-width: 760px) { .grid.three, .grid.two, .package-grid { grid-template-columns: 1fr; } main { padding-top: 32px; } }${extraStyle}
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="hero enter">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(heading)}</h1>
        <p class="lead">${escapeHtml(lead)}</p>
      </section>
      ${body}
      ${faqSection}
      ${siteCtaBand(origin)}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

const PROOF_CASE = {
  site: "tinystudio.in",
  siteLabel: "Tiny Studio portfolio",
  caseDate: "2026-06-20",
  owner: "Founder-owned (consented and redacted)",
  before: {
    score: 85,
    findings: 7,
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-96b716c9-22f3-4ffb-bb92-b912a421a44b"
  },
  intermediate: {
    score: 99,
    findings: 2,
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-75ffee26-02ae-41d3-b2ef-5beb40722e50"
  },
  after: {
    score: 100,
    findings: 0,
    reportUrl: "https://seofixkit.com/beta/reports/tinystudio-in-0a45637f-1354-4d26-ace3-d3b594162961"
  },
  changes: [
    {
      label: "PR #4",
      ref: "https://github.com/nish3451/tinystudio-in/pull/4",
      summary:
        "Tracked static Pages bundle, removed Google Fonts from render path, non-blocking preload for styles, apple-touch-icon, /llms.txt, support ContactPage JSON-LD, /support heading hierarchy, mailto links in place of Cloudflare email-obfuscation, social preview images, expanded Promptly privacy copy."
    },
    {
      label: "PR #5",
      ref: "https://github.com/nish3451/tinystudio-in/pull/5",
      summary: "Strict-Transport-Security header via public/_headers."
    }
  ]
};

function proofCaseHtml(origin) {
  const description = `Real before/after proof: a portfolio site went from ${PROOF_CASE.before.score}/100 with ${PROOF_CASE.before.findings} findings to ${PROOF_CASE.after.score}/100 with ${PROOF_CASE.after.findings} after owner-approved fixes.`;
  const title = "Before/After Repair Proof - SEO Fix Kit";
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
${pageSocialHead({ origin, title, description, path: "/proof" })}
${ldBlock({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SEO Fix Kit",
  applicationCategory: "SEO software",
  operatingSystem: "Web",
  url: origin,
  provider: { "@type": "Organization", name: "SEO Fix Kit", url: origin },
  description:
    "Proof-backed SEO audits, repair queue, implementation packs, and fixed-rerun proof receipts; publishes no CMS changes and makes no ranking promise."
})}
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 1120px; padding: clamp(40px, 6vw, 72px) 22px 64px; min-width: 0; }
      .enter > p { max-width: 720px; }
      .panel p, .panel li { font-size: 16px; }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 0 0 20px; max-width: 820px; overflow-wrap: break-word; }
      h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.2; margin: 0 0 12px; overflow-wrap: break-word; }
      p, li { color: var(--ink-soft); font-size: 17px; line-height: 1.62; overflow-wrap: anywhere; word-break: break-word; }
      ul { padding-left: 22px; }
      section { margin: 0 0 32px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 32px 0; }
      .panel { display: grid; gap: 4px; min-width: 0; }
      .panel p { margin: 0; }
      .panel strong { color: var(--gold); display: block; font-size: 12px; font-weight: 600; letter-spacing: .08em; margin-bottom: 4px; text-transform: uppercase; }
      .panel.score p strong { color: var(--ink); display: inline; font-size: clamp(36px, 4vw, 48px); font-weight: 700; letter-spacing: -0.04em; margin: 0; text-transform: none; }
      .panel.before { border-color: var(--gold-line); }
      .panel.intermediate { border-color: var(--line-strong); }
      .panel.after { border-color: var(--line-accent); }
      .panel.after > strong { color: var(--accent); }
      .panel.score { gap: 10px; padding: 24px; }
      .panel.score::after { background: linear-gradient(90deg, var(--accent) calc(var(--score) * 1%), var(--surface-strong) 0); border-radius: 999px; content: ""; height: 6px; order: 2; }
      .panel.before.score::after { background: linear-gradient(90deg, var(--gold) calc(var(--score) * 1%), var(--surface-strong) 0); }
      .panel.score p:last-child { order: 3; }
      .receipt { background: var(--surface-sunken); border: 1px solid var(--line-accent); border-radius: var(--radius-lg); padding: 20px 22px; margin: 24px 0; min-width: 0; }
      .receipt h3 { color: var(--accent); font-size: 12px; font-weight: 600; letter-spacing: .08em; margin: 0 0 12px; text-transform: uppercase; }
      .receipt dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
      .receipt dt { color: var(--ink-muted); font-weight: 500; }
      .receipt dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
      .boundary { background: var(--gold-surface); border: 1px solid var(--gold-line); border-radius: var(--radius-lg); padding: 20px 22px; margin: 24px 0; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .receipt dl { grid-template-columns: 1fr; gap: 2px 0; } .receipt dd { margin-bottom: 8px; } main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="enter">
        <p class="kicker">Customer proof · Real before and after</p>
        <h1>85 to 100, with a receipt for every step.</h1>
        <p>Our founder’s own portfolio site, Tiny Studio, was the first real repair done with SEO Fix Kit. We audited it, the owner shipped the fixes in two small changes, and we ran the exact same audit again after each one. Seven problems went to zero, and every report is linked below so you can check the numbers yourself.</p>
        <p><a class="cta" href="${origin}/proof.md">Get the markdown receipt</a></p>
      </section>
      <section class="grid" aria-label="Audit scores before, intermediate, and after">
        <article class="panel before score" style="--score: ${PROOF_CASE.before.score}">
          <strong>Before</strong>
          <p>Score <strong>${PROOF_CASE.before.score}</strong>/100 &middot; ${PROOF_CASE.before.findings} findings</p>
          <p><a href="${PROOF_CASE.before.reportUrl}">Source report</a></p>
        </article>
        <article class="panel intermediate score" style="--score: ${PROOF_CASE.intermediate.score}">
          <strong>Intermediate rerun</strong>
          <p>Score <strong>${PROOF_CASE.intermediate.score}</strong>/100 &middot; ${PROOF_CASE.intermediate.findings} findings</p>
          <p><a href="${PROOF_CASE.intermediate.reportUrl}">Rerun report</a></p>
        </article>
        <article class="panel after score" style="--score: ${PROOF_CASE.after.score}">
          <strong>After</strong>
          <p>Score <strong>${PROOF_CASE.after.score}</strong>/100 &middot; ${PROOF_CASE.after.findings} findings</p>
          <p><a href="${PROOF_CASE.after.reportUrl}">Final rerun report</a></p>
        </article>
      </section>
      <section class="receipt" aria-label="Receipt details">
        <h3>Receipt</h3>
        <dl>
          <dt>Site</dt><dd>${escapeHtml(PROOF_CASE.siteLabel)} (${escapeHtml(PROOF_CASE.site)})</dd>
          <dt>Owner</dt><dd>${escapeHtml(PROOF_CASE.owner)}</dd>
          <dt>Case date</dt><dd>${PROOF_CASE.caseDate}</dd>
          <dt>Source measurement</dt><dd>Production SEO Fix Kit audit against <code>https://${PROOF_CASE.site}/</code></dd>
          <dt>Same-host reruns</dt><dd>Intermediate (${PROOF_CASE.intermediate.score}/${PROOF_CASE.intermediate.findings}) and final (${PROOF_CASE.after.score}/${PROOF_CASE.after.findings})</dd>
          <dt>Approval</dt><dd>Owner-approved implementation pack; merged PRs ${PROOF_CASE.changes.map((change) => change.label).join(" and ")}</dd>
          <dt>Outcome</dt><dd>Findings went from ${PROOF_CASE.before.findings} to ${PROOF_CASE.after.findings}; final score ${PROOF_CASE.before.score} &rarr; ${PROOF_CASE.after.score}/100</dd>
        </dl>
      </section>
      <section>
        <h2>Owner-approved changes</h2>
        <ul>
${PROOF_CASE.changes.map((change) => `          <li><strong>${escapeHtml(change.label)}</strong> &mdash; ${escapeHtml(change.summary)} (<a href="${escapeHtml(change.ref)}">${escapeHtml(change.ref)}</a>)</li>`).join("\n")}
        </ul>
      </section>
      <section class="boundary">
        <h2>What this receipt does not claim</h2>
        <ul>
          <li>No ranking, traffic, indexing, citation, or revenue promise is made for ${escapeHtml(PROOF_CASE.site)} or any other site.</li>
          <li>SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs. The merged PRs are owner-applied.</li>
          <li>The receipt is published with founder consent and redaction of internal implementation detail; it is not a paid Fix Pack delivery certificate.</li>
          <li>A different site, a different host, or a different starting audit will not produce the same numbers. The receipt is a real measurement path on this site only.</li>
        </ul>
      </section>
      <section>
        <h2>How to read this page</h2>
        <p>The same audit path ran three times against the same host: once before the repair, once after the first merge, and once after the second. The proof receipt pins the report ids, scores, finding counts, and merged PR refs so anyone can rerun the same measurement path against <code>https://${PROOF_CASE.site}/</code> and compare. SEO Fix Kit does not claim this receipt represents the result you will see on your site; it is evidence that the same measurement path can connect a real issue to a real operator-applied fix and a real rerun.</p>
        <p>For an anonymous one-page check on any public URL, see <a href="${origin}/check">${origin}/check</a>. For methodology and limits, see <a href="${origin}/methodology">${origin}/methodology</a>. For plans and prices, see <a href="${origin}/pricing">${origin}/pricing</a>.</p>
      </section>
      ${siteCtaBand(origin)}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function proofCaseMarkdown(origin) {
  return `# SEO Fix Kit — Repair proof receipt (${PROOF_CASE.caseDate})

Real before/after repair proof receipt: founder-owned ${PROOF_CASE.siteLabel} (${PROOF_CASE.site}) went from ${PROOF_CASE.before.score}/100 with ${PROOF_CASE.before.findings} findings to ${PROOF_CASE.after.score}/100 with ${PROOF_CASE.after.findings} findings after owner-approved changes. Published with consent and redaction.

## Receipt

- Site: ${PROOF_CASE.siteLabel} (${PROOF_CASE.site})
- Owner: ${PROOF_CASE.owner}
- Case date: ${PROOF_CASE.caseDate}
- Source measurement: Production SEO Fix Kit audit against https://${PROOF_CASE.site}/
- Same-host reruns: intermediate (${PROOF_CASE.intermediate.score}/${PROOF_CASE.intermediate.findings}) and final (${PROOF_CASE.after.score}/${PROOF_CASE.after.findings})
- Approval: Owner-approved implementation pack; merged PRs ${PROOF_CASE.changes.map((change) => change.label).join(" and ")}
- Outcome: Findings went from ${PROOF_CASE.before.findings} to ${PROOF_CASE.after.findings}; final score ${PROOF_CASE.before.score} -> ${PROOF_CASE.after.score}/100

## Measurement path

| Stage | Score | Findings | Report |
| --- | --- | --- | --- |
| Before | ${PROOF_CASE.before.score} | ${PROOF_CASE.before.findings} | ${PROOF_CASE.before.reportUrl} |
| Intermediate rerun | ${PROOF_CASE.intermediate.score} | ${PROOF_CASE.intermediate.findings} | ${PROOF_CASE.intermediate.reportUrl} |
| After | ${PROOF_CASE.after.score} | ${PROOF_CASE.after.findings} | ${PROOF_CASE.after.reportUrl} |

## Owner-approved changes

${PROOF_CASE.changes.map((change) => `- ${change.label}: ${change.summary} (${change.ref})`).join("\n")}

## What this receipt does not claim

- No ranking, traffic, indexing, citation, or revenue promise is made for ${PROOF_CASE.site} or any other site.
- SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs. The merged PRs are owner-applied.
- The receipt is published with founder consent and redaction of internal implementation detail; it is not a paid Fix Pack delivery certificate.
- A different site, a different host, or a different starting audit will not produce the same numbers. The receipt is a real measurement path on this site only.

## How to read this page

The same audit path ran three times against the same host: once before the repair, once after the first merge, and once after the second. The proof receipt pins the report ids, scores, finding counts, and merged PR refs so anyone can rerun the same measurement path against https://${PROOF_CASE.site}/ and compare. SEO Fix Kit does not claim this receipt represents the result you will see on your site; it is evidence that the same measurement path can connect a real issue to a real operator-applied fix and a real rerun.

- Anonymous one-page check: ${origin}/check
- Methodology and limits: ${origin}/methodology
- Pricing: ${origin}/pricing
`;
}

function privacyHtml(origin) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy - SEO Fix Kit</title>
    <meta name="description" content="SEO Fix Kit privacy note for access requests, private beta audits, payments, and fulfillment." />
${pageSocialHead({ origin, title: "Privacy - SEO Fix Kit", description: "SEO Fix Kit privacy note for access requests, private beta audits, payments, and fulfillment.", path: "/privacy" })}
    <style>
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 760px; padding: clamp(40px, 6vw, 72px) 22px 24px; min-width: 0; }
      h1 { font-size: clamp(36px, 5.5vw, 56px); line-height: var(--leading-heading); margin: 0 0 32px; overflow-wrap: break-word; }
      h2 { font-size: clamp(20px, 3vw, 24px); line-height: 1.25; margin: 40px 0 12px; overflow-wrap: break-word; }
      p, li { color: var(--ink-soft); font-size: 17px; line-height: 1.65; overflow-wrap: anywhere; }
      ul { padding-left: 22px; }
      li + li { margin-top: 8px; }
      @media (max-width: 760px) { main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <h1>Privacy</h1>
      <p>SEO Fix Kit ("we") collects the information needed to run self-serve access, create proof-backed SEO reports, process paid Fix Pack checkout, and deliver repair updates. We are the data controller for this information; reach us at <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>
      <ul>
        <li>We store your email address, signup source, UTM fields, landing path, referrer, browser user agent, country code when Cloudflare provides it, signup timestamps, and short-lived access-link records.</li>
        <li>Private audits store the website URL, rendered-page audit findings, screenshots or extracted page facts when available, report owner, beta session reference, target host, and report expiry timestamp.</li>
        <li>Fix Pack records store checkout status, Dodo payment identifiers, payment amount and currency, fulfillment notes, final rerun report links, delivery notifications, and admin audit events. We never see or store your card details; Dodo Payments processes payment as merchant of record under its own privacy policy.</li>
        <li>Cookies and local browser storage: we set only essential, HttpOnly session cookies (beta login, admin login, and report-unlock state), and the beta dashboard may keep your access email and dashboard state in sessionStorage on your device. No advertising, analytics, or cross-site tracking cookies are set.</li>
        <li>Processors: Cloudflare (hosting, database, email delivery, browser rendering — data may be processed on Cloudflare's global network) and Dodo Payments (checkout and payment webhooks).</li>
        <li>Retention: reports expire after 30 days, except reports tied to a paid Fix Pack, which stay available while we operate the service. Admin logs, payment records, and notification logs are kept for operating, support, abuse prevention, and payment reconciliation. Rate-limit counters expire automatically.</li>
        <li>We do not sell your personal data and do not send unrelated promotions.</li>
        <li>Deletion and access: email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> (or reply to any email we send) to request a copy or deletion of your beta data. We honor verified requests within 30 days, except records we must keep for payment reconciliation or abuse prevention.</li>
      </ul>
      <p>Last updated: June 15, 2026.</p>
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function supportHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Support",
    path: "/support",
    description:
      "Get help with SEO Fix Kit: contact support for Fix Pack delivery, billing, and refund questions, or security reports. We reply from support@seofixkit.com.",
    body: `
      <p>Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> for any question, billing issue, or problem — including when an expected email never arrived. You can also reply to any SEO Fix Kit email; we use that thread to verify account ownership.</p>

      <h2>What to include</h2>
      <p>For the fastest answer, include the account email, audited domain, report link or report id, checkout email if different, and the exact repair queue item you are asking about. If the question is about a rerun, include what changed on the site and when it shipped. If the question is about billing, include the Dodo receipt email, payment date, and whether the Fix Pack repair pass has already started.</p>

      <h2>Fix Pack support</h2>
      <ul>
        <li>Fix Pack covers one proof-backed repair pass for one report plus one rerun after fixes.</li>
        <li>No ranking, traffic, or revenue promise is made.</li>
        <li>If payment succeeds but the repair queue cannot start, you are entitled to a full refund.</li>
        <li>Refunds: full refund on request within 14 days of payment if the repair pass has not started. After work starts or delivery, requests are reviewed against the Dodo payment record, report proof, and fulfillment state.</li>
        <li>Security or abuse reports should include the affected URL, account email, and timestamp.</li>
      </ul>

      <h2>Delivery expectations</h2>
      <p>The paid beta is deliberately narrow. We review the saved report, confirm which findings are supported by proof, prepare repair proposals, and keep delivery notes tied to that report. Some fixes are handled as human-readable implementation guidance, some as safe draft actions, and some may be marked unsupported when the product cannot safely execute them yet. We do not log into private CMS accounts, publish changes, merge code, or call provider admin APIs from the browser.</p>

      <h2>Security and abuse</h2>
      <p>Security reports should include the affected route, account email if relevant, timestamp, browser details, and clear reproduction steps. Do not send secrets, private keys, passwords, payment card numbers, or production credentials by email. If you believe a report exposes data from a site or account you do not own, stop using the data and contact support immediately so we can investigate and lock down the affected report.</p>

      <h2>Ownership and deletion</h2>
      <p>SEO Fix Kit is for sites you own or are authorized to audit. We may pause audits, delete reports, or revoke access when ownership is unclear, the target appears abusive, or the crawl could overload a third-party site. To request deletion or a copy of beta data, email from the account address or reply to a SEO Fix Kit email thread so ownership can be verified.</p>
      <p>Last updated: June 19, 2026.</p>
    `
  });
}

function termsHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Terms",
    path: "/terms",
    description: "SEO Fix Kit product terms for audits, Fix Pack checkout, refunds, and fulfillment.",
    body: `
      <p>These terms govern your use of SEO Fix Kit at seofixkit.com ("the service", "we", "us"). By requesting access, running an audit, or purchasing a Fix Pack you agree to them. Contact: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>

      <h2>The service</h2>
      <ul>
        <li>SEO Fix Kit provides proof-backed SEO audits and a paid Fix Pack repair service for proven findings in one report plus one rerun after fixes.</li>
        <li>Reports are diagnostic. They reflect what the crawl and browser render could observe at scan time and may miss issues outside that scope.</li>
        <li>No ranking, indexing, traffic, revenue, or search-engine outcome is promised or implied, before or after repairs.</li>
        <li>The service is in active development; features may change, and beta access may be adjusted or revoked for abuse.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Audit only sites you own or are explicitly authorized to audit. Site verification exists to enforce this.</li>
        <li>Self-serve audits are rate-limited and may be paused for abuse, excessive load, security concerns, or unsupported sites.</li>
        <li>Do not use the service to probe, attack, or overload third-party sites or infrastructure.</li>
      </ul>

      <h2>Payments and refunds</h2>
      <ul>
        <li>Checkout, payment processing, currency handling, refunds, and disputes are processed by Dodo Payments as merchant of record. The price shown at checkout is the price charged.</li>
        <li>If your Fix Pack repair pass has not started, you may request a full refund within 14 days of payment by emailing <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</li>
        <li>After repair work has started or been delivered, refund requests are reviewed against the payment record, the report proof, and the fulfillment state, and may be granted in full, in part, or declined.</li>
        <li>If payment succeeds but the repair queue cannot start, you are entitled to a full refund.</li>
      </ul>

      <h2>Liability</h2>
      <ul>
        <li>The service is provided "as is" without warranties of any kind to the extent permitted by law.</li>
        <li>You remain responsible for changes you (or your developers) make to your site, including changes based on our reports and briefs.</li>
        <li>To the extent permitted by law, our total liability for any claim related to the service is limited to the amount you paid us in the three months before the claim, and we are not liable for indirect, incidental, or consequential damages, including lost profits or lost rankings.</li>
      </ul>

      <h2>General</h2>
      <ul>
        <li>We may update these terms; material changes will be reflected on this page with a new date. Continued use after a change means acceptance.</li>
        <li>These terms are governed by the laws of India, without regard to conflict-of-law rules.</li>
        <li>Questions about these terms or your account: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</li>
      </ul>
      <p>Last updated: June 12, 2026.</p>
    `
  });
}

function policyPageHtml({ origin, title, description, body, path = "/" }) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
${pageSocialHead({ origin, title: `${title} - SEO Fix Kit`, description, path })}
    <style>
      body { margin: 0; min-width: 0; }
      main { margin: 0 auto; max-width: 760px; padding: clamp(40px, 6vw, 72px) 22px 24px; min-width: 0; }
      h1 { font-size: clamp(36px, 5.5vw, 56px); line-height: var(--leading-heading); margin: 0 0 32px; overflow-wrap: break-word; }
      h2 { font-size: clamp(20px, 3vw, 24px); line-height: 1.25; margin: 40px 0 12px; overflow-wrap: break-word; }
      p, li { color: var(--ink-soft); font-size: 17px; line-height: 1.65; overflow-wrap: anywhere; }
      ul { padding-left: 22px; }
      li + li { margin-top: 8px; }
      @media (max-width: 760px) { main { padding-top: 32px; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

// The static 404 page. Cloudflare serves dist/404.html for unknown paths
// ("not_found_handling": "404-page"); vite.config.js writes it from this
// function at build time, so it shares the live header, footer and styles
// instead of a hand-kept copy. The audit card is a small brand moment: the
// broken URL rendered as if SEO Fix Kit had just checked it.
function notFoundHtml(origin = "") {
  const description =
    "This page does not exist on SEO Fix Kit. Start from the homepage, check one page for free, or read the methodology.";
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Page not found - SEO Fix Kit</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href="https://seofixkit.com/" />${publicAssetHead("https://seofixkit.com")}
    <style>
      main { margin: 0 auto; max-width: 1120px; min-width: 0; padding: clamp(40px, 6vw, 72px) 22px 64px; }
      .lost { align-items: center; display: grid; gap: clamp(32px, 5vw, 64px); grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); }
      h1 { font-size: var(--text-display); line-height: var(--leading-display); margin: 16px 0 20px; min-width: 0; overflow-wrap: break-word; }
      p { color: var(--ink-soft); font-size: 18px; line-height: 1.6; margin: 0; overflow-wrap: anywhere; }
      .links { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin: 32px 0 0; min-width: 0; }
      .result { background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); min-width: 0; overflow: hidden; }
      .result-bar { align-items: center; border-bottom: 1px solid var(--line); color: var(--ink-muted); display: flex; font-family: var(--font-mono); font-size: 12px; gap: 10px; padding: 12px 16px; }
      .result-bar i { background: var(--line-strong); border-radius: 50%; display: inline-block; height: 8px; width: 8px; }
      .result-body { display: grid; gap: 12px; padding: 20px; }
      .result-row { align-items: center; background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius); display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 12px 14px; }
      .result-row code { color: var(--ink); font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chip { border-radius: var(--radius-full); flex: none; font-size: 12px; font-weight: 600; padding: 3px 9px; }
      .chip-bad { background: var(--error-surface); color: var(--error); }
      .chip-ok { background: var(--success-surface); color: var(--success); }
      .result-fix { color: var(--ink-muted); font-size: 14px; }
      .result-fix strong { color: var(--ink); font-weight: 600; }
      @media (max-width: 860px) { .lost { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <section class="lost">
        <div class="enter">
          <p class="kicker">404 · Page not found</p>
          <h1>Nothing to fix here.</h1>
          <p>We couldn’t find that page. It may have moved, or the link may be out of date.</p>
          <nav class="links" aria-label="Alternative pages">
            <a class="btn btn-primary" href="${origin}/">Go to homepage</a>
            <a class="btn btn-secondary" href="${origin}/check">Check one page for free</a>
            <a class="btn btn-ghost" href="${origin}/support">Contact support</a>
          </nav>
        </div>
        <figure class="result enter" style="--enter-delay: 120ms" aria-label="This address, checked">
          <div class="result-bar"><i></i><i></i><i></i><span>seofixkit.com · 1 page checked</span></div>
          <div class="result-body">
            <div class="result-row"><code data-lost-path>/this-page</code><span class="chip chip-bad">404</span></div>
            <div class="result-row"><code>Linked from somewhere</code><span class="chip chip-bad">Broken link</span></div>
            <div class="result-row"><code>seofixkit.com/</code><span class="chip chip-ok">200 OK</span></div>
            <p class="result-fix"><strong>Suggested fix:</strong> start from the homepage.</p>
          </div>
        </figure>
      </section>
    </main>
    ${siteFooter(origin)}
    <script>
      for (const el of document.querySelectorAll("[data-lost-path]")) el.textContent = location.pathname;
    </script>
  </body>
</html>`;
}

export {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_WIDTH,
  aiAnswerReadinessHtml,
  demoHtml,
  homeMarkdown,
  llmsText,
  methodologyHtml,
  notFoundHtml,
  pricingHtml,
  policyPageHtml,
  privacyHtml,
  proofCaseHtml,
  proofCaseMarkdown,
  publicAssetHead,
  renderedVsStaticAuditHtml,
  siteFooter,
  siteHeader,
  socialImageMeta,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
};
