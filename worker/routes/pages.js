import { SITE_FOOTER, SITE_NAV, SITE_TAGLINE } from "../../shared/site-nav.js";
import { escapeHtml } from "../../shared/audit-engine.js";
import { FREE_TOOLS } from "../../shared/free-tools/catalog.js";
import { DEMO_PROOF, DEMO_FIXTURE_PATH, demoProofSnippet } from "./demo-proof.js";

const FIX_PACK_PUBLIC_PRICE = "$99.00 one-time";

// Social platforms ignore SVG share images.
const SOCIAL_IMAGE_PATH = "/og-image.png";
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

function socialImageMeta() {
  return `
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${SOCIAL_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${SOCIAL_IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="SEO Fix Kit: the SEO audit that checks its own work" />`;
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

## Free tools
No account. Each tool runs in the browser and sends nothing to SEO Fix Kit.
- [${origin}/tools](https://seofixkit.com/tools): Index of the free SEO tools.
${FREE_TOOLS.map((tool) => `- [${origin}/tools/${tool.slug}](https://seofixkit.com/tools/${tool.slug}): ${tool.description}`).join("\n")}

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
- Paid Fix Pack fulfillment includes a downloadable fix-files bundle (fix checklist, tracker CSV, per-page code, sitemap.xml, robots.txt changes, llms.txt, broken-link list, AI prompt), owner-approved repair proposals, status, delivery notes, and one rerun after fixes.
- Proof Monitoring checkout is config-gated behind the Dodo subscription product and webhook entitlement sync; access activates from subscription webhooks, not redirects.
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
- ${origin}/tools
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

function ldBlock(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

function publicAssetHead(origin) {
  return `
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${origin}/apple-touch-icon.png" sizes="180x180" />
    <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/tokens.css" />
    <script>document.documentElement.classList.add("js")</script>
    <script src="/site.js" defer></script>`;
}

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
          <a class="btn btn-primary btn-sm header-cta" href="${origin}/check">Check a page</a>
          <button class="site-menu-button" type="button" aria-controls="site-nav" aria-expanded="false" data-site-menu>
            Menu
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 5h11M2.5 11h11" /></svg>
          </button>
        </div>
      </div>
    </header>`;
}

function siteCtaBand(origin) {
  return `<section class="site-cta" data-theme="dark" aria-labelledby="site-cta-title">
        <h2 id="site-cta-title">See what’s wrong with your site.</h2>
        <p>Check one page free with no account, or audit the whole site and fix what it finds.</p>
        <div class="site-cta-actions">
          <a class="btn btn-primary btn-lg" href="${origin}/check">Check a page <span class="arrow" aria-hidden="true">→</span></a>
          <a class="btn btn-secondary btn-lg" href="${origin}/#get-started">Create an account</a>
        </div>
      </section>`;
}

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
    <title>Sample Report - SEO Fix Kit</title>
    <meta name="description" content="Real SEO Fix Kit output for a test page: the warnings a real browser ruled out, and the problems that made the repair queue with fixes." />
${pageSocialHead({ origin, title: "Sample Report - SEO Fix Kit", description: "Real SEO Fix Kit output for a test page: the warnings a real browser ruled out, and the problems that made the repair queue with fixes.", path: "/demo" })}
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
        <p class="kicker">Sample report</p>
        <h1>See which warnings a real browser rules out.</h1>
        <p>Basic SEO scanners read only a page’s raw code, so they flag headings and text that JavaScript adds later. SEO Fix Kit loads the page in a real browser, shows the evidence, and suggests a fix only when something is actually wrong.</p>
      </section>
      <section class="grid" aria-label="Sample audit outcome">
        <article class="panel">
          <strong>Static scanner</strong>
          <p>The raw HTML has ${DEMO_PROOF.measured.staticWordCount} visible words and no heading or link. A scanner that reads only raw HTML calls this a thin, broken page.</p>
        </article>
        <article class="panel proof">
          <strong>Real browser</strong>
          <p>After rendering, the page has one H1, three internal links and ${DEMO_PROOF.measured.renderedWordCount} words. The thin page exists only in the raw HTML.</p>
        </article>
        <article class="panel">
          <strong>Repair queue</strong>
          <p>No thin-content fix is queued, because the browser evidence rules it out. Real problems still show up (noindex, a canonical conflict, a missing share image, missing schema) with a suggested fix and an exact snippet when the engine can generate one.</p>
        </article>
      </section>
      <section class="panel proof">
        <h2>Engine output for our test page</h2>
        <p>Everything below is unedited output from the SEO Fix Kit audit engine, run against our own <a href="${origin}${DEMO_FIXTURE_PATH}">public test page</a>. It uses the same engine and the same fields as private reports. None of it is written by hand.</p>
        <p><strong>Measured on the test page:</strong> ${DEMO_PROOF.measured.staticWordCount} visible words in the raw HTML, against ${DEMO_PROOF.measured.renderedWordCount} words, one H1 and ${DEMO_PROOF.measured.renderedInternalLinkCount} internal links after rendering.</p>
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
        <p><strong>What the engine queues for the test page</strong> (severity, problem, suggested fix, and a snippet when the engine can generate one):</p>
        <ul>
${DEMO_PROOF.repairPlan.map((item) => `          <li><strong>${escapeHtml(item.severity)}</strong> ${escapeHtml(item.title)}: ${escapeHtml(item.fix)}${item.snippet ? `\n            <code class="code-block">${escapeHtml(demoProofSnippet(item.snippet, origin))}</code>` : ""}</li>`).join("\n")}
        </ul>
        <p>Generated with engine v${escapeHtml(DEMO_PROOF.engineVersion)}. Page speed checks are not part of this excerpt. The test page is set to noindex on purpose, and the report says so. After a change ships, rerun the same page: each problem shows as fixed, still open, new or regressed.</p>
      </section>
      <section>
        <h2>What this sample shows</h2>
        <p>A useful report has to tell a crawler limitation apart from a real problem. SEO Fix Kit does not stop at the first HTML response. It opens the page in a browser, reads the rendered title, description, headings, internal links, schema, social tags, images and body text, and records which raw-HTML warnings are false alarms.</p>
        <p>On this test page, the raw HTML suggested a missing H1, missing internal links and thin content: ${DEMO_PROOF.measured.staticWordCount} visible words in the raw HTML against ${DEMO_PROOF.measured.renderedWordCount} rendered words. The same comparison filters missing-H1 and missing-link warnings on any site that builds its content with JavaScript.</p>
        <p>This matters when an AI agent does the fixing. If a scanner says “add an H1” when the page already has one, the agent adds a duplicate heading and makes the page worse. SEO Fix Kit keeps that item out of the repair queue and says why.</p>
      </section>
      <section class="grid" aria-label="What a paid Fix Pack uses from the sample">
        <article class="panel proof">
          <strong>Evidence</strong>
          <p>Each problem shows the page URL, the rendered facts, the evidence, and whether it is a real problem or a filtered false alarm. These are the same fields as the engine output above.</p>
        </article>
        <article class="panel proof">
          <strong>Repair scope</strong>
          <p>Only confirmed problems enter the queue. Each has a severity, a suggested fix, a snippet when the engine can generate one, and a check you can rerun.</p>
        </article>
        <article class="panel proof">
          <strong>Rerun</strong>
          <p>After a change ships, the same audit checks whether each problem is fixed, still open, new or regressed.</p>
        </article>
      </section>
      <section>
        <h2>What this sample does not claim</h2>
        <p>This is a sample, not an audit of your site. The output above is for our test page only. Anonymous one-page checks are live at ${origin}/check: paste a public URL to see the rendered evidence, the false alarms ruled out, and real problems with fixes. No account, no email, nothing stored. Full site audits need an email sign-in, and deeper crawls need site verification. Neither the sample nor the check promises rankings, traffic, indexing, revenue, AI citations or visibility in AI answers.</p>
      </section>
      ${siteCtaBand(origin)}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function methodologyHtml(origin) {
  const ext = (href, text) => `<a href="${href}" rel="nofollow noopener" target="_blank">${text}</a>`;
  return publicProductPageHtml({
    origin,
    path: "/methodology",
    title: "How SEO Fix Kit works",
    description:
      "How SEO Fix Kit audits a site: real-browser rendering, a repair queue of confirmed problems, and reruns that mark each one fixed. Plus what it does not do.",
    eyebrow: "How it works",
    heading: "How SEO Fix Kit works",
    lead: "Every audit loads your pages in a real browser, keeps only the problems it has evidence for, and runs the same checks again after you ship a fix. It never edits your site.",
    body: `
      <section class="band">
        <h2>The audit loop</h2>
        <div class="grid three">
          <article class="panel proof"><strong>1. Render</strong><p>We fetch the raw HTML and load the page in Chromium. If the rendered page already has what the raw HTML seems to be missing, the warning is dropped.</p></article>
          <article class="panel proof"><strong>2. Queue</strong><p>Each confirmed problem goes into the repair queue with its severity, the evidence, a suggested fix and a check you can rerun.</p></article>
          <article class="panel proof"><strong>3. Rerun</strong><p>Reruns and weekly monitoring set the status of every item: fixed, still open, new or regressed.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>What it checks today</h2>
        <ul class="check-list">
          <li>One-page checks at <a href="${origin}/check">${origin}/check</a>, with no account and nothing stored. You get the rendered evidence, the false alarms that were ruled out, and the real problems with fixes.</li>
          <li>Site audits of up to 1,000 pages for sites you have verified. Before verification, you can run a one-page audit.</li>
          <li>Rendered page checks, a sitemap inventory of up to 50,000 URLs, internal links and duplicate content, page load waterfalls, WordPress and online store checks, AI Answer Readiness, draft-only growth briefs, competitor homepage comparisons, and imports of your backlink, local and keyword data.</li>
          <li>A repair queue on every report: evidence, status, draft actions, approvals, implementation notes for your developer, confirmation after each rerun, and teammate assignment. Reports with real problems offer the Fix Pack.</li>
          <li>A developer API and webhooks for audits, reports and the repair queue.</li>
        </ul>
        <p><a class="cta" href="${origin}/check">Check a page</a></p>
      </section>
      <section class="band">
        <h2>What it does not do</h2>
        <div class="grid two">
          <article class="panel"><strong>No AI visibility tracking</strong><p>AI Answer Readiness is worked out from your rendered pages, schema, canonicals, links, sitemap and optional llms.txt. We do not sample AI engines, monitor AI citations or track a visibility score.</p></article>
          <article class="panel"><strong>No hidden site writes</strong><p>Draft actions, implementation notes and growth briefs are documents for you to review. We do not log in to your CMS, publish pages, merge code or use your provider credentials.</p></article>
          <article class="panel"><strong>No backlink database</strong><p>Backlink checks use the rows you import. SEO Fix Kit does not replace Ahrefs, Semrush or other backlink databases.</p></article>
          <article class="panel"><strong>Large crawls are early access</strong><p>50,000-page rendered crawls run in stages over days or weeks. We do not call one complete until every batch has page-level evidence.</p></article>
        </div>
      </section>
      <section class="band">
        <h2>When a fix counts as done</h2>
        <p>A problem is closed only when the report names it, shows the evidence, gives a concrete fix, and a rerun passes the same check. Rankings, traffic, indexing, citations and revenue are never guaranteed.</p>
      </section>
      <section class="band">
        <h2>Why there is a repair queue</h2>
        <p>Most SEO audits end at a long list. Every item is marked high priority, nobody owns it after delivery, and the fixes never ship. Free tools now render pages and compare raw HTML with the rendered page too, so finding problems is no longer the hard part.</p>
        <p>The repair queue keeps each confirmed problem, who owns it, whether it is approved, and whether a rerun confirmed the fix. It carries over from one report to the next, so the list does not reset every time you scan.</p>
      </section>
      <section class="band">
        <h2>Compared with other tools</h2>
        <p>The tools below are good at what they do. Each summary uses the tool's own published claims. Our limits apply to every comparison: no live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>Compared with SEOmator</h2>
        <p>SEOmator lists ${ext("https://seomator.com/free-tools", "39 free SEO tools")} with no signup. Its ${ext("https://seomator.com/free-seo-audit-tool", "free SEO audit")} runs a 251-check rule engine across 16 categories and renders JavaScript. Its ${ext("https://seomator.com/geo-audit-tool", "free GEO audit")} crawls up to 50 pages and checks access for 14 AI-specific crawlers including GPTBot, ClaudeBot, and PerplexityBot. There is also an npm CLI (<code>@seomator/seo-audit</code>). For a broad free audit, it is a good choice.</p>
        <p>SEOmator gives you a list of findings. SEO Fix Kit puts each confirmed finding in a repair queue and reruns the audit after your fix ships, so every item ends as fixed, still open, new or regressed. SEOmator's GEO audit reads AI crawler access from robots.txt; our AI Answer Readiness checks the rendered page.</p>
      </section>
      <section class="band">
        <h2>Compared with Volume Nine's GEO Grader</h2>
        <p>Volume Nine, a Denver-based digital marketing agency, publishes the ${ext("https://www.v9digital.com/geo-grader/", "free GEO Grader")}. Its quick facts say it launched in January 2026 and is totally free, and the grader runs at ${ext("https://geo.v9digital.com/grader/", "geo.v9digital.com")}. It scores 60+ signals across six categories: discoverability, structured data, AI readiness, performance, reputation and trust, and LLM-ready content. It reads robots.txt rules to check whether AI and search crawlers are allowed in, and samples ChatGPT, Claude, Gemini, Perplexity, and Grok live during a run.</p>
        <p>The GEO Grader emails a detailed report with actionable to-dos. SEO Fix Kit does not sample AI models. It checks your rendered pages and keeps each confirmed problem in the repair queue until a rerun clears it. Volume Nine's FAQ notes that scores can vary between runs as live conditions change.</p>
      </section>
      <section class="band">
        <h2>Compared with Juma.ai's GEO Audit</h2>
        <p>Juma.ai publishes a ${ext("https://geo.juma.ai/", "free GEO Audit")} with no signup and no card that returns a shareable report. It scores pages with a ${ext("https://geo.juma.ai/methodology", "published open methodology")} of ten weighted dimensions and ranks findings on an impact × effort matrix. The same audit is available through Juma's ${ext("https://juma.ai/mcp", "MCP server")} as a <code>run_geo_audit</code> tool.</p>
        <p>Juma's methodology scores robots.txt crawler access, page HTML, Firecrawl-rendered content, and SERP and AI Overview citations, rather than sampling ChatGPT, Claude, Gemini, or Perplexity live during a run. Juma hands you a ranked report. SEO Fix Kit tracks each confirmed finding in a repair queue and reruns the audit to confirm the fix.</p>
      </section>
      <section class="band">
        <h2>Compared with AEO Engine</h2>
        <p>AEO Engine calls itself a ${ext("https://aeoengine.ai", "human-managed, AI-powered Growth Engine")}. Its ${ext("https://aeoengine.ai/geo-audit", "free GEO audit")} reviews crawlability, schema, content structure, entity clarity, and citation readiness for ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews. The same page says AEO Engine ${ext("https://aeoengine.ai/geo-audit", "turns GEO audit findings into shipped fixes")}, from schema and crawl access to new content and recurring AI visibility checks. It also offers an ${ext("https://aeoengine.ai/embed/geo-audit?utm_source=embed&utm_medium=widget&utm_campaign=aeo_tools", "embeddable GEO audit widget")}.</p>
        <p>AEO Engine is a service that ships fixes for you. SEO Fix Kit is approval-first: you approve every repair-queue item, your team ships it, and a rerun confirms it. We do not publish CMS changes, open pull requests, merge code, or call provider admin APIs.</p>
      </section>
      <section class="band">
        <h2>Compared with Otterly.ai and Peec.ai</h2>
        <p>${ext("https://otterly.ai", "Otterly.ai")} says it is trusted by 40,000+ Marketing Pros worldwide. Its ${ext("https://otterly.ai/pricing", "pricing page")} lists a $29/mo Lite plan with Tracking of 4 AI Search Engines: ChatGPT, Google AI Overviews, Perplexity, MS Copilot, with Claude, Google AI Mode, Gemini as paid add-ons. ${ext("https://peec.ai", "Peec AI")} says it is trusted by 3000+ brands and agencies. Its ${ext("https://peec.ai/pricing", "pricing page")} lists a $80/mo Starter plan (annual, 50 prompts), and its ${ext("https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search", "funding announcement")} states a $21M Series A led by Singular, after a Seed led by 20VC, bringing total funding to $29M.</p>
        <p>Otterly.ai and Peec.ai track how a brand shows up in AI search: mentions, position and sentiment. For ongoing AI visibility monitoring, they are good choices. SEO Fix Kit audits the page itself, puts each confirmed problem in a repair queue, and reruns the audit to confirm the fix.</p>
      </section>
      <section class="band">
        <h2>Compared with agents that file GitHub issues</h2>
        <p>SEO Automation Club ${ext("https://seoautomationclub.com/agentic-seo-autonomous-technical-audit-claude-code-github-issues/", "published a teardown")} of a scheduled technical auditor that crawls on a cadence, diffs each run against the previous run, and files GitHub issues only for new findings. Resolved findings close their issue automatically. For engineering teams that want SEO findings in their issue tracker, it is a good pattern.</p>
        <p>That agent files issues with no approval step, no evidence handoff, and no proof receipt after a fix. A rendered-vs-static false alarm still becomes an issue. In SEO Fix Kit's repair queue, nothing moves until the owner approves it, and a rerun issues a proof receipt that says fixed, still open, new or regressed. This comparison covers issue-filing agents, not agents that edit code directly.</p>
      </section>
      <section class="band">
        <h2>Compared with free AI SEO agent skills</h2>
        <p>Free SEO skills you install in an AI agent are useful for quick one-page checks: read a page, spot a missing title, draft a fix. Open-source SEO tooling is good at that, and you should keep using it. Those skills run one prompt at a time and keep nothing between runs.</p>
        <p>SEO Fix Kit handles what needs a server: audits of up to 1,000 pages, a sitemap inventory of up to 50,000 URLs, staged large crawls, a repair queue that keeps approvals and rerun results, implementation notes, and the Fix Pack. For one page, <a href="${origin}/check">${origin}/check</a> is free with no account. For a whole site, see <a href="${origin}/pricing">pricing</a>.</p>
      </section>
    `
  });
}

const PRICING_PLANS = [
  {
    key: "check",
    name: "Page check",
    price: "Free",
    cadence: "No account needed",
    summary: "Load one public page in a real browser and see what is wrong, with the evidence.",
    cta: { label: "Check a page", href: "/check" }
  },
  {
    key: "audit",
    name: "Site audit",
    price: "Free",
    cadence: "During the beta",
    summary: "Audit up to 1,000 pages, keep every report, and work through the fixes in a repair queue.",
    cta: { label: "Create an account", href: "/#get-started" },
    featured: true
  },
  {
    key: "fixpack",
    name: "Fix Pack",
    price: FIX_PACK_PUBLIC_PRICE.replace(/\.00 one-time$/, ""),
    cadence: "One-time, per report",
    summary:
      "Download every fix as ready-to-ship files, go through them with us, then rerun the audit to show what got fixed.",
    cta: { label: "Start with a free audit", href: "/#get-started" }
  }
];

const PRICING_FEATURES = [
  { label: "Real-browser rendering with evidence", plans: ["check", "audit", "fixpack"] },
  { label: "False alarms filtered out", plans: ["check", "audit", "fixpack"] },
  { label: "Pages per audit", values: { check: "1", audit: "Up to 1,000", fixpack: "Up to 1,000" } },
  { label: "Score with points gained per fix", plans: ["check", "audit", "fixpack"] },
  { label: "AI fix prompt for ChatGPT, Claude or Cursor", plans: ["check", "audit", "fixpack"] },
  { label: "AI crawler access checks (GPTBot, ClaudeBot)", plans: ["check", "audit", "fixpack"] },
  { label: "Saved reports and history", plans: ["audit", "fixpack"] },
  { label: "Repair queue with code to paste", plans: ["audit", "fixpack"] },
  { label: "Weekly monitoring for verified sites", plans: ["audit", "fixpack"] },
  { label: "Developer API and webhooks", plans: ["audit", "fixpack"] },
  { label: "Client report links and PDFs", plans: ["audit", "fixpack"] },
  { label: "Score badge and share page", plans: ["audit", "fixpack"] },
  { label: "Fix files: code for every page, sitemap, robots.txt, llms.txt", plans: ["fixpack"] },
  { label: "Fix list as a spreadsheet for Jira, Trello or Asana", plans: ["fixpack"] },
  { label: "Your logo, colours and domain on client reports", plans: ["fixpack"] },
  { label: "Lead-capture audit widget for your own site", plans: ["fixpack"] },
  { label: "Guided repair pass on one report", plans: ["fixpack"] },
  { label: "Rerun that confirms each fix", plans: ["fixpack"] }
];

const PRICING_FAQ = [
  {
    q: "When do I pay?",
    a: `Only if you buy a Fix Pack. Page checks and site audits are free during the beta. The Fix Pack (${FIX_PACK_PUBLIC_PRICE}) is offered on reports with real problems, and the final price including any local tax is shown at checkout before you pay.`
  },
  {
    q: "Who processes payment?",
    a: "Dodo Payments handles checkout as merchant of record: cards, local taxes and receipts. We never see or store your card details."
  },
  {
    q: "What if the Fix Pack can’t start?",
    a: "If you have paid and the repair pass can’t start, we refund you in full. The support page has the refund policy."
  },
  {
    q: "Do you guarantee rankings or traffic?",
    a: "No. We show what is broken, help you fix it, and rerun the same audit to confirm the fix. No ranking or traffic guarantee is made."
  },
  {
    q: "Will you change my site?",
    a: "No. You approve each fix and your developer ships it. Then we rerun the audit to confirm."
  },
  {
    q: "How is this different from GEO Auditor’s $29 Agent Fix Mode?",
    a: "GEO Auditor’s Agent Fix Mode gives you one command, and your AI agent applies every fix automatically. That is fast and fairly priced. The Fix Pack is slower and more careful: every fix comes with evidence from a real browser, you approve each one before anything changes, and a rerun shows what actually got fixed."
  },
  {
    q: "Is monitoring included?",
    a: "Yes, for verified sites during the beta: we rerun the audit every week. A paid monitoring plan is planned but not on sale yet."
  }
];

function pricingCheck(included) {
  return included
    ? `<span class="tick" aria-label="Included">✓</span>`
    : `<span class="dash" aria-label="Not included">–</span>`;
}

function planFeatureLine(feature, planKey) {
  if (!feature.values) return feature.label;
  const value = feature.values[planKey];
  return `${value} ${value === "1" ? "page" : "pages"} per audit`;
}

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
          ${plan.featured ? `<p class="plan-badge">Start here</p>` : ""}
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
    description: `Free page checks and free site audits during the beta. The ${FIX_PACK_PUBLIC_PRICE} Fix Pack is offered only when a report finds real problems.`,
    eyebrow: "Pricing",
    heading: "Audits are free. Fixes are $99 per report.",
    lead: "Check a page or audit up to 1,000 pages free during the beta. When a report finds real problems, the Fix Pack gives you every fix as ready-to-ship files, a guided repair pass and the rerun that confirms it.",
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
          <p>Weekly reruns, a list of what changed, and alerts when something breaks again. Free for verified sites during the beta; a paid plan is not on sale yet.</p>
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
      "An SEO audit for small business sites: check one page free, see the evidence behind each problem, and pay for a repair pass only when there is something real to fix.",
    eyebrow: "Small business SEO audit",
    heading: "An SEO audit that shows its evidence.",
    lead: "Most audit tools hand small businesses a long list of red flags and a generic checklist. SEO Fix Kit checks one page free, shows the rendered evidence behind each problem, and only queues a fix when the page a visitor sees is actually wrong.",
    softwareDescription:
      "SEO audit software for small business sites that loads pages in a real browser, lists confirmed problems with fixes, and reruns the audit to confirm repairs.",
    body: `
      <section class="band">
        <h2>What you get from an audit</h2>
        <ul class="check-list">
          <li>For each page, the first thing that fails, with evidence you can open and check yourself.</li>
          <li>Which problems are real, and which are false alarms caused by JavaScript the scanner did not run.</li>
          <li>A plain repair brief for each problem: priority, effort, and a check you can rerun after the change ships.</li>
          <li>After a rerun, each problem is marked fixed, still open, new or regressed.</li>
        </ul>
      </section>
      <section class="grid three" aria-label="How to start">
        <article class="panel proof"><strong>Free one-page check</strong><p>Paste a public URL at ${origin}/check. You get the rendered evidence, the false alarms ruled out, and real problems with fixes. No account, no email, nothing stored.</p></article>
        <article class="panel"><strong>Audit your whole site</strong><p>Sign in with an emailed link to run audits. Once you verify the site, each audit can cover up to 1,000 pages.</p></article>
        <article class="panel"><strong>Fix Pack when you need it</strong><p>One repair pass on one report, plus one rerun after the fixes ship. You see the price at checkout before you pay.</p></article>
      </section>
      <section class="band">
        <h2>Why evidence beats a checklist</h2>
        <p>A generic audit can tell you to “add an H1” on a page that already has one once it loads. SEO Fix Kit opens the page in a real browser, compares the raw HTML with the rendered page, and keeps that item off your list. Every report works the same way: render, confirm, queue, rerun.</p>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page describes the product; it is not an audit of your site. The free check covers one public page at one moment. Full site audits need an account. SEO Fix Kit does not replace Ahrefs or Semrush, does not provide live AI citation monitoring or answer-engine sampling, and never guarantees rankings, traffic, indexing or revenue.</p>
      </section>
      <section class="band">
        <h2>Start with one page</h2>
        <p><a class="cta" href="${origin}/check">Check a page</a></p>
        <p><a href="${origin}/demo">See a sample report</a> · <a href="${origin}/methodology">How it works</a> · <a href="${origin}/pricing">Pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Can I check my site for free before signing up?",
        a: "Yes. The one-page check at /check loads one public URL in a real browser and shows the evidence and any problems it finds. No account, no email, nothing stored."
      },
      {
        q: "What does the Fix Pack include?",
        a: "One repair pass on one saved report, plus one rerun after your fixes ship. You see the price at checkout before you pay. No ranking, traffic or revenue promise is made."
      },
      {
        q: "Do I need to verify my site first?",
        a: "Not for a one-page audit. Once you verify the site, each audit can cover up to 1,000 pages."
      },
      {
        q: "Will SEO Fix Kit guarantee my rankings?",
        a: "No. A report shows what the crawl and the browser could see at the time of the audit. Rankings, traffic, indexing and revenue are never guaranteed."
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
      "AI crawlers like GPTBot read raw HTML and skip JavaScript. Compare the raw HTML with the rendered page to see what they miss, without false alarms.",
    eyebrow: "JavaScript sites and AI crawlers",
    heading: "See your page the way a crawler sees it.",
    lead: "Scanners that read only raw HTML flag problems on JavaScript sites that are not really there. AI crawlers read that same raw HTML and never run JavaScript. SEO Fix Kit loads the page in a real browser, compares it with the raw HTML, shows what a crawler without JavaScript can see, and only queues a fix when the page a visitor sees is actually wrong.",
    softwareDescription:
      "SEO audit software that loads pages in a real browser and compares them with the raw HTML, to show what crawlers that skip JavaScript can read and to filter out false alarms.",
    body: `
      <section class="grid three" aria-label="Raw HTML scanner compared with a real browser">
        <article class="panel"><strong>Raw HTML scanner</strong><p>No H1. No internal links. Thin content.</p></article>
        <article class="panel proof"><strong>Real browser</strong><p>One H1, normal internal links, and the full page content.</p></article>
        <article class="panel"><strong>Repair queue</strong><p>Nothing to fix for those three. Rerun after the content changes.</p></article>
      </section>
      <section class="band">
        <h2>The same comparison shows what AI crawlers can read</h2>
        <p>Search Engine Journal reports that the major AI crawlers (GPTBot from OpenAI, ClaudeBot from Anthropic, PerplexityBot and CCBot) fetch raw HTML and do not run JavaScript. If your content only appears after rendering, those crawlers get an empty shell: no headings, no links, no text to quote. The raw-HTML side of the comparison is exactly what they can read.</p>
      </section>
      <section class="band">
        <h2>Why this matters for fixes</h2>
        <p>An agent that trusts a raw-HTML scan can make a site worse. If the scanner says “add an H1” when the rendered page already has one, the fix is a duplicate heading. Comparing both views separates a crawler limitation from a real problem, so the repair queue only gets confirmed problems. It also shows which pages stay invisible to AI crawlers until the content is in the raw HTML.</p>
      </section>
      <section class="band">
        <h2>Compared with free static-vs-rendered checkers</h2>
        <p>Three free tools already compare raw HTML with the rendered page or test crawlers that skip JavaScript.</p>
        <ul class="check-list">
          <li><a href="https://llmpulse.ai/geo-crawlability-checker" rel="nofollow noopener" target="_blank">LLM Pulse GEO Crawlability Checker</a> fetches the page once as a plain HTTP request and once with JavaScript, then compares headings, body text, links, meta tags and structured data. It is free and emails the report. LLM Pulse has more free GEO tools at <a href="https://llmpulse.ai/free-ai-search-tools" rel="nofollow noopener" target="_blank">llmpulse.ai/free-ai-search-tools</a>.</li>
          <li><a href="https://freeseoaudit.vercel.app/" rel="nofollow noopener" target="_blank">Free SEO Auditor</a> (open source, MIT, <a href="https://github.com/ravigupta0210/seo-auditor" rel="nofollow noopener" target="_blank">ravigupta0210/seo-auditor</a>) runs a no-signup audit with copy-paste fixes, a JavaScript dependency check, cloaking detection across five AI user agents, and an optional Playwright renderer. Site crawls default to 25 pages from sitemap.xml.</li>
          <li><a href="https://github.com/abouchard11/geo-crawl-audit" rel="nofollow noopener" target="_blank">geo-crawl-audit</a> is a Python and curl script with no dependencies. It fetches with a browser user agent, then with about 12 real AI crawler user agents, and reports TTFB, differences between bots, and a raw-HTML class of SSR_FULL / SSR_THIN / CSR_SHELL without running JavaScript. A free single-domain scan is at <a href="https://readablebyai.com" rel="nofollow noopener" target="_blank">readablebyai.com</a>.</li>
        </ul>
        <p>If you only need that one-page comparison, any of them is a fair choice. SEO Fix Kit uses the comparison to filter false alarms, so its persistent repair queue only receives proven findings, and each rerun marks them fixed, still-open, new, or regressed. Audits cover up to 1,000 pages, with a sitemap inventory of up to 50,000 URLs and staged large crawls. No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>See it on a real page</h2>
        <ul class="check-list">
          <li><a href="${origin}/demo">${origin}/demo</a>: a sample report that shows a raw-HTML false alarm next to the rendered evidence.</li>
          <li><a href="${origin}/check">${origin}/check</a>: paste any public URL to see the rendered evidence, the false alarms ruled out, and real problems with fixes. No account, nothing stored.</li>
          <li>Reports for verified sites add internal link analysis, page load waterfalls and rerun comparisons.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>The one-page check covers a single public URL, not a full site audit. Full site audits need an account. “What AI crawlers can read” here means what a fetcher that does not run JavaScript gets from your raw HTML, based on public reporting about those crawlers. It is not live sampling of ChatGPT, Perplexity or any other answer engine, and SEO Fix Kit does not provide live AI citation monitoring or answer-engine sampling. SEO Fix Kit never guarantees rankings, traffic, indexing, revenue or AI citations.</p>
      </section>
      <section class="band">
        <h2>Start with one page</h2>
        <p><a class="cta" href="${origin}/check">Check a page</a></p>
        <p><a href="${origin}/demo">See a sample report</a> · <a href="${origin}/methodology">How it works</a> · <a href="${origin}/pricing">Pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Why does my SEO tool report problems I can’t see in the browser?",
        a: "Most scanners read only the raw HTML and miss content that JavaScript adds. SEO Fix Kit loads the page in a real browser and reports only what the rendered page actually shows."
      },
      {
        q: "Which AI crawlers can’t see content rendered with JavaScript?",
        a: "Search Engine Journal reports that GPTBot, ClaudeBot, PerplexityBot and CCBot fetch raw HTML without running JavaScript. If your content only exists after rendering, they never see it. The raw-HTML side of the comparison shows exactly what they can read."
      },
      {
        q: "Is this the same as checking what ChatGPT or Perplexity say about me?",
        a: "No. SEO Fix Kit never queries AI engines. It measures your own pages: the raw HTML is what a crawler without JavaScript gets, and the rendered page is what a visitor gets."
      },
      {
        q: "Can I see an example before signing up?",
        a: "Yes. The sample report at /demo shows a raw-HTML false alarm next to the rendered evidence, and the free check at /check runs the same comparison on any public URL."
      },
      {
        q: "Why not use a free static-vs-rendered checker like LLM Pulse?",
        a: "Use one if you only need a one-page comparison. LLM Pulse, Free SEO Auditor and geo-crawl-audit do that for free. SEO Fix Kit uses the same comparison to keep false alarms out of a repair queue that tracks approvals and rerun results. It does not sample live answer engines or monitor citations."
      },
      {
        q: "Does a clean result guarantee rankings?",
        a: "No. A report shows what the crawl could see at the time of the audit. Rankings, traffic, indexing, revenue and AI citations are never guaranteed."
      },
      {
        q: "How does the repair queue use the comparison?",
        a: "Only confirmed problems enter the queue. Each keeps its evidence, a suggested fix, an effort estimate and a check you can rerun after the change ships."
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
      "Check whether AI answer engines can read and use your pages: rendered content, schema, links and sitemap. Optionally rank problems by Search Console traffic. No citation tracking.",
    eyebrow: "AI Answer Readiness",
    heading: "Check whether AI engines can use your pages.",
    lead: "AI answers start with pages an engine can read. SEO Fix Kit works out AI Answer Readiness from your rendered pages, schema, links, sitemap and optional llms.txt. Import Search Console rows and the problems are ranked by the traffic behind them. It does not sample live answer engines or monitor citations.",
    softwareDescription:
      "SEO audit software with AI Answer Readiness checks built from rendered content, schema, canonical and internal-link clarity, sitemap context, and optional llms.txt reachability. Imported Search Console rows rank the problems by clicks and impressions on the affected pages.",
    body: `
      <section class="band">
        <h2>What the check measures</h2>
        <ul class="check-list">
          <li>Content depth: whether the rendered page has enough real text to quote.</li>
          <li>Schema: Organization, WebSite, SoftwareApplication, WebPage, FAQPage and product markup that names things clearly.</li>
          <li>Canonicals and internal links: one canonical per URL, and links an engine can follow.</li>
          <li>Structure: headings and text that answer the questions people ask.</li>
          <li>Sitemap coverage, plus llms.txt if you have one.</li>
          <li>Traffic ranking: import Search Console or rank tracker rows, and problems on pages with more clicks and impressions come first.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Compared with CrawlRaven</h2>
        <p>CrawlRaven describes AI search readiness auditors as tools that find the technical reasons you are not cited. It sells a one-time readiness audit that connects Search Console and GA4 so problems are ranked by the traffic behind them. SEO Fix Kit's AI Answer Readiness does the same job: show why a rendered page is hard for an answer engine to use.</p>
        <ul class="check-list">
          <li>When you import Search Console or rank tracker rows, SEO Fix Kit ranks readiness problems by the clicks and impressions on the affected pages.</li>
          <li>SEO Fix Kit does not connect to Search Console or GA4 automatically, and it does not sample ChatGPT, Perplexity, Google AI Overviews or other engines.</li>
          <li>Without traffic data the check still tells you why a page is thin, unclear or missing schema. Traffic data then puts problems on pages with real search demand first.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Compared with free AI visibility checkers</h2>
        <p>These free tools check whether AI engines cite or mention your site. That is AI citation tracking. SEO Fix Kit does not check AI-engine citations or visibility scores.</p>
        <ul class="check-list">
          <li><a href="https://definiteseo.com/ai-visibility-checker" rel="nofollow noopener" target="_blank">DefiniteSEO</a> checks whether ChatGPT and Google AI Overviews cite your site.</li>
          <li><a href="https://revsurgedigital.com/free-tools/geo-audit" rel="nofollow noopener" target="_blank">RevSurge Digital</a> checks whether AI answer engines can read, understand and cite your website.</li>
          <li><a href="https://answervisibilitylab.com/geo-audit-tool" rel="nofollow noopener" target="_blank">Answer Visibility Lab</a> checks brand mentions and citations of your URLs across ChatGPT, Perplexity, Gemini, Claude and Google AI Overviews.</li>
          <li><a href="https://websiteaeogeochecker.com" rel="nofollow noopener" target="_blank">Website AEO GEO Checker</a> shows how ChatGPT, Perplexity, Gemini, Claude AI and Bing AI read your site.</li>
          <li><a href="https://www.veuno.com/ai-visibility-checker" rel="nofollow noopener" target="_blank">Veuno</a> scores how easily ChatGPT, Claude, Perplexity and Google AI Overviews can find, understand and cite your website.</li>
        </ul>
        <p>If you only need a visibility score, those tools are a fair choice. SEO Fix Kit checks your own pages, and only confirmed problems reach the repair queue, where a rerun confirms each fix.</p>
        <p>No live AI-engine sampling, no AI citation monitoring, and no ranking guarantees.</p>
      </section>
      <section class="band">
        <h2>On "technical readiness predicts nothing (r=0.009)"</h2>
        <p>getaisearchscore.com studied 441 domains, Perplexity-only citations, cross-sectional, and found its original 26-check score did not predict citations (r=0.009). It rebuilt its product around content relevance. The result is real, and it fits our limits:</p>
        <ul class="check-list">
          <li>The null result is on one vendor's combined score, not on individual technical faults. A site that blocks AI crawlers is invisible, and a page that only renders with JavaScript is empty to an extractor. getaisearchscore.com itself calls AI crawler access “the only structural factor with an unambiguous effect.”</li>
          <li>The study could not see content that appears only after JavaScript runs. SEO Fix Kit judges readiness on the rendered page, the version an answer engine would parse.</li>
          <li>“Not enough on its own” is different from “predicts nothing.” The vendor's own finding that low-scoring established brands are cited 38.8% of the time points to domain authority, not to technical faults being irrelevant.</li>
        </ul>
        <p>SEO Fix Kit never claims to predict citations. Readiness is a diagnostic, not a citation guarantee. Content relevance is the citation driver; technical health is the hygiene floor that keeps content readable at all. We agree with getaisearchscore.com on both.</p>
      </section>
      <section class="grid two" aria-label="Limits of the readiness check">
        <article class="panel"><strong>No live answer-engine sampling</strong><p>SEO Fix Kit does not ask ChatGPT, Perplexity, Google AI Overviews or other engines what they say about your site.</p></article>
        <article class="panel"><strong>No AI citation monitoring</strong><p>There is no tracking of citations, mentions or visibility scores across AI engines.</p></article>
        <article class="panel"><strong>llms.txt stays optional</strong><p>llms.txt is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or AI search.</p></article>
        <article class="panel"><strong>Your pages only</strong><p>Readiness comes from your rendered pages, schema, links, sitemap and optional llms.txt, not from how any engine works inside.</p></article>
      </section>
      <section class="band">
        <h2>How to run the check</h2>
        <ul class="check-list">
          <li>Free: paste a public URL at <a href="${origin}/check">${origin}/check</a> to see the rendered evidence, the false alarms ruled out, and real problems with fixes. No account, nothing stored.</li>
          <li>Reports for verified sites include AI Answer Readiness next to the rest of the audit. Import Search Console rows on the same audit to rank the problems by traffic.</li>
          <li>Read the limits on <a href="${origin}/methodology">How it works</a> before relying on any readiness signal.</li>
        </ul>
      </section>
      <section class="band">
        <h2>What this page does not claim</h2>
        <p>This page describes the check; it is not a readiness report for your site. SEO Fix Kit does not provide live AI citation monitoring or answer-engine sampling, does not connect Search Console or GA4 automatically, and does not guarantee rankings, traffic, AI citations or revenue.</p>
      </section>
      <section class="band">
        <h2>Start with one page</h2>
        <p><a class="cta" href="${origin}/check">Check a page</a></p>
        <p><a href="${origin}/demo">See a sample report</a> · <a href="${origin}/methodology">How it works</a> · <a href="${origin}/pricing">Pricing</a></p>
      </section>
    `,
    faq: [
      {
        q: "Is this the same as tracking citations in ChatGPT or Perplexity?",
        a: "No. Readiness looks at what your rendered pages, schema, links, sitemap and optional llms.txt let an answer engine understand. Live answer-engine sampling, AI citation monitoring and AI visibility score tracking are not part of the product."
      },
      {
        q: "Does SEO Fix Kit rank AI readiness faults by traffic like CrawlRaven?",
        a: "Yes, when you import Search Console or rank tracker rows: problems are ranked by the clicks and impressions on the affected pages. SEO Fix Kit does not connect Search Console or GA4 automatically, and it does not provide live AI citation monitoring or answer-engine sampling."
      },
      {
        q: "Do I need an llms.txt file to pass?",
        a: "No. llms.txt is an optional signal. SEO Fix Kit does not claim llms.txt is required for Google Search or AI search."
      },
      {
        q: "Can I check AI readiness for free?",
        a: "The one-page check at /check loads one public URL in a real browser and shows the evidence and any problems. Full AI Answer Readiness checks are in reports for verified sites."
      },
      {
        q: "Does a good readiness result guarantee AI visibility?",
        a: "No. Readiness is a diagnostic. Rankings, traffic, AI citations and revenue are never guaranteed."
      }
    ]
  });
}

function aboutHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/about",
    title: "About",
    description:
      "Why SEO Fix Kit exists, how it works, and the limits it keeps: real-browser evidence, only problems that are really there, and a rerun that proves each fix.",
    eyebrow: "About",
    heading: "We built the SEO audit we wanted to trust.",
    lead: "Most audit tools read raw HTML, flag hundreds of warnings and leave you to work out which are real. SEO Fix Kit loads each page in a real browser, reports only what it can prove, and reruns after you ship to show each fix worked.",
    body: `
      <section class="grid two" aria-label="How we work">
        <article class="panel"><strong>Evidence over scores</strong><h3>Every problem shows its proof.</h3><p>Each finding comes with what the browser saw on your page, so you can check it yourself before you spend time on it.</p></article>
        <article class="panel"><strong>Fewer, real problems</strong><h3>False alarms are ruled out, in the open.</h3><p>When a simple crawler would flag something the rendered page gets right, the report says so instead of padding the list.</p></article>
        <article class="panel"><strong>Proof after the fix</strong><h3>Done means the rerun passed.</h3><p>A fix counts when a fresh audit of the live page confirms it, not when someone ticks a box. <a href="${origin}/proof">See a real before and after</a>.</p></article>
        <article class="panel"><strong>Honest limits</strong><h3>We say what we don’t do.</h3><p>No ranking guarantees, no traffic estimates, and no claims about AI answers we can’t measure. <a href="${origin}/methodology">Read the full method</a>.</p></article>
      </section>
      <section class="band">
        <h2>The company</h2>
        <ul class="check-list">
          <li>SEO Fix Kit is in beta. Page checks, site audits of up to 1,000 pages and the ${FIX_PACK_PUBLIC_PRICE.replace(" one-time", "")} Fix Pack are live today.</li>
          <li>It runs on Cloudflare: pages are rendered with Cloudflare’s browser service and reports are stored in Cloudflare’s data centres.</li>
          <li>Payments are handled by Dodo Payments as merchant of record. We never see your card details.</li>
          <li>Full site audits run only on sites whose owners have verified them. The free page check stores nothing.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Get in touch</h2>
        <p>Questions, feedback or a problem with a report: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>. Security reports: see <a href="${origin}/.well-known/security.txt">security.txt</a>. Live service health: <a href="${origin}/status">status page</a>.</p>
      </section>`
  });
}

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
  extraStyle = "",
  structuredData = [],
  scripts = ""
}) {
  const extraLd = structuredData.map(ldBlock);
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
    ${siteFooter(origin)}${scripts}
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
  const description = `Case study: a portfolio site went from ${PROOF_CASE.before.score}/100 with ${PROOF_CASE.before.findings} problems to ${PROOF_CASE.after.score}/100 with ${PROOF_CASE.after.findings} after two owner-approved fixes, measured by the same audit each time.`;
  const title = "Case Study: 85 to 100 in Two Fixes - SEO Fix Kit";
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
    "SEO audits in a real browser with a repair queue, implementation notes and reruns that confirm each fix. It never publishes changes to your site and makes no ranking promise."
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
        <p class="kicker">Case study</p>
        <h1>85 to 100 in two fixes.</h1>
        <p>The first repair done with SEO Fix Kit was on our founder’s own portfolio site, Tiny Studio, published here with consent. The owner shipped two changes using an SEO Fix Kit implementation pack, and the same audit ran on the same host before and after each one.</p>
        <p><a class="cta" href="${origin}/proof.md">Download as Markdown</a></p>
      </section>
      <section class="grid" aria-label="Audit scores before and after each fix">
        <article class="panel before score" style="--score: ${PROOF_CASE.before.score}">
          <strong>Before</strong>
          <p>Score <strong>${PROOF_CASE.before.score}</strong>/100 &middot; ${PROOF_CASE.before.findings} problems</p>
          <p><a href="${PROOF_CASE.before.reportUrl}">Report</a></p>
        </article>
        <article class="panel intermediate score" style="--score: ${PROOF_CASE.intermediate.score}">
          <strong>After fix 1</strong>
          <p>Score <strong>${PROOF_CASE.intermediate.score}</strong>/100 &middot; ${PROOF_CASE.intermediate.findings} problems</p>
          <p><a href="${PROOF_CASE.intermediate.reportUrl}">Report</a></p>
        </article>
        <article class="panel after score" style="--score: ${PROOF_CASE.after.score}">
          <strong>After fix 2</strong>
          <p>Score <strong>${PROOF_CASE.after.score}</strong>/100 &middot; ${PROOF_CASE.after.findings} problems</p>
          <p><a href="${PROOF_CASE.after.reportUrl}">Report</a></p>
        </article>
      </section>
      <section class="receipt" aria-label="Case details">
        <h3>Details</h3>
        <dl>
          <dt>Site</dt><dd>${escapeHtml(PROOF_CASE.siteLabel)} (${escapeHtml(PROOF_CASE.site)})</dd>
          <dt>Owner</dt><dd>${escapeHtml(PROOF_CASE.owner)}</dd>
          <dt>Case date</dt><dd>${PROOF_CASE.caseDate}</dd>
          <dt>Audit</dt><dd>SEO Fix Kit production audit of <code>https://${PROOF_CASE.site}/</code></dd>
          <dt>Reruns</dt><dd>After fix 1: ${PROOF_CASE.intermediate.score}/100, ${PROOF_CASE.intermediate.findings} problems. After fix 2: ${PROOF_CASE.after.score}/100, ${PROOF_CASE.after.findings} problems.</dd>
          <dt>Approval</dt><dd>Owner-approved implementation pack; merged PRs ${PROOF_CASE.changes.map((change) => change.label).join(" and ")}</dd>
          <dt>Result</dt><dd>${PROOF_CASE.before.findings} problems to ${PROOF_CASE.after.findings}; score ${PROOF_CASE.before.score} &rarr; ${PROOF_CASE.after.score}/100</dd>
        </dl>
      </section>
      <section>
        <h2>What changed</h2>
        <ul>
${PROOF_CASE.changes.map((change) => `          <li><strong>${escapeHtml(change.label)}</strong>: ${escapeHtml(change.summary)} (<a href="${escapeHtml(change.ref)}">${escapeHtml(change.ref)}</a>)</li>`).join("\n")}
        </ul>
      </section>
      <section class="boundary">
        <h2>What this case study does not claim</h2>
        <ul>
          <li>No ranking, traffic, indexing, citation, or revenue promise is made for ${escapeHtml(PROOF_CASE.site)} or any other site.</li>
          <li>SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs. The owner applied and merged both PRs.</li>
          <li>Published with the founder’s consent, with internal details removed. It is not a paid Fix Pack delivery.</li>
          <li>Another site will start from different numbers and end at different ones. This result applies to this site only.</li>
        </ul>
      </section>
      <section>
        <h2>How to read this page</h2>
        <p>The same audit ran three times on the same host: before the repair, after the first merge and after the second. The report links, scores, problem counts and PR links are all here, so anyone can audit <code>https://${PROOF_CASE.site}/</code> again and compare. This is not a prediction of your results. It shows real problems, the fixes that closed them, and the reruns that confirmed it.</p>
        <p><a href="${origin}/check">Check a page on your site</a>, read <a href="${origin}/methodology">how the audit works</a>, or see <a href="${origin}/pricing">pricing</a>.</p>
      </section>
      ${siteCtaBand(origin)}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function proofCaseMarkdown(origin) {
  return `# SEO Fix Kit case study: 85 to 100 in two fixes (${PROOF_CASE.caseDate})

Our founder’s ${PROOF_CASE.siteLabel} (${PROOF_CASE.site}) went from ${PROOF_CASE.before.score}/100 with ${PROOF_CASE.before.findings} problems to ${PROOF_CASE.after.score}/100 with ${PROOF_CASE.after.findings} problems after two owner-approved changes. Published with consent, with internal details removed.

## Details

- Site: ${PROOF_CASE.siteLabel} (${PROOF_CASE.site})
- Owner: ${PROOF_CASE.owner}
- Case date: ${PROOF_CASE.caseDate}
- Audit: SEO Fix Kit production audit of https://${PROOF_CASE.site}/
- Reruns: after fix 1, ${PROOF_CASE.intermediate.score}/100 with ${PROOF_CASE.intermediate.findings} problems; after fix 2, ${PROOF_CASE.after.score}/100 with ${PROOF_CASE.after.findings} problems
- Approval: Owner-approved implementation pack; merged PRs ${PROOF_CASE.changes.map((change) => change.label).join(" and ")}
- Result: ${PROOF_CASE.before.findings} problems to ${PROOF_CASE.after.findings}; score ${PROOF_CASE.before.score} -> ${PROOF_CASE.after.score}/100

## Scores

| Stage | Score | Problems | Report |
| --- | --- | --- | --- |
| Before | ${PROOF_CASE.before.score} | ${PROOF_CASE.before.findings} | ${PROOF_CASE.before.reportUrl} |
| After fix 1 | ${PROOF_CASE.intermediate.score} | ${PROOF_CASE.intermediate.findings} | ${PROOF_CASE.intermediate.reportUrl} |
| After fix 2 | ${PROOF_CASE.after.score} | ${PROOF_CASE.after.findings} | ${PROOF_CASE.after.reportUrl} |

## What changed

${PROOF_CASE.changes.map((change) => `- ${change.label}: ${change.summary} (${change.ref})`).join("\n")}

## What this case study does not claim

- No ranking, traffic, indexing, citation, or revenue promise is made for ${PROOF_CASE.site} or any other site.
- SEO Fix Kit did not publish CMS changes, open GitHub pull requests, merge code, or call provider admin APIs. The owner applied and merged both PRs.
- Published with the founder’s consent, with internal details removed. It is not a paid Fix Pack delivery.
- Another site will start from different numbers and end at different ones. This result applies to this site only.

## How to read this page

The same audit ran three times on the same host: before the repair, after the first merge and after the second. The report links, scores, problem counts and PR links are all here, so anyone can audit https://${PROOF_CASE.site}/ again and compare. This is not a prediction of your results. It shows real problems, the fixes that closed them, and the reruns that confirmed it.

- Anonymous one-page check: ${origin}/check
- How the audit works: ${origin}/methodology
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
    <meta name="description" content="What SEO Fix Kit collects, why, who processes it, how long we keep it, and how to have it deleted." />
${pageSocialHead({ origin, title: "Privacy - SEO Fix Kit", description: "What SEO Fix Kit collects, why, who processes it, how long we keep it, and how to have it deleted.", path: "/privacy" })}
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
      <p>SEO Fix Kit ("we") collects only what we need to sign you in, run your audits, take payment for a Fix Pack, and send you repair updates. We are the data controller for this information. Contact us at <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>
      <ul>
        <li>We store your email address, signup source, UTM fields, landing path, referrer, browser user agent, country code when Cloudflare provides it, signup timestamps, and short-lived access-link records.</li>
        <li>Private audits store the website URL, rendered-page audit findings, screenshots or extracted page facts when available, report owner, beta session reference, target host, and report expiry timestamp.</li>
        <li>Fix Pack records store checkout status, Dodo payment identifiers, payment amount and currency, fulfillment notes, final rerun report links, delivery notifications, and admin audit events. We never see or store your card details; Dodo Payments processes payment as merchant of record under its own privacy policy.</li>
        <li>Audit widgets and score badges: when you check a site through an audit widget on someone else's website, we store the email and site address you enter, the score and problem count, and pass them to that widget's owner, who decides how to contact you. Public score badges and score pages show only a site's score, problem count and trend, never the problems themselves. Widget leads are deleted after 12 months.</li>
        <li>Cookies and local browser storage: we set only essential, HttpOnly session cookies (beta login, admin login, and report-unlock state), and the beta dashboard may keep your access email and dashboard state in sessionStorage on your device. No advertising, analytics, or cross-site tracking cookies are set.</li>
        <li>Processors: Cloudflare (hosting, database, email delivery, browser rendering; data may be processed anywhere on Cloudflare's network), Dodo Payments (checkout and payment webhooks), and Sentry (Functional Software, Inc., USA; error monitoring: when the service hits an error, a scrubbed error report with the request method, path and stack trace is sent, with request bodies, cookies, query strings and email addresses removed).</li>
        <li>Retention: reports expire after 30 days, except reports tied to a paid Fix Pack, which stay available while we operate the service. To show your progress over time, we keep each report’s page address, score, problem count and date for 12 months. Admin logs, payment records, and notification logs are kept for operating, support, abuse prevention, and payment reconciliation. Rate-limit counters expire automatically.</li>
        <li>We do not sell your personal data and do not send unrelated promotions.</li>
        <li>Deletion: delete your account yourself under Billing in your account (sign in with an email link first, even if you only joined the waitlist). It takes effect right away and removes your reports and stored report files, sites, checks, alerts, API keys, team, widget and badge data, settings, sign-in records and waitlist signup, and your email from other accounts' teams and repair boards. We keep only the payment records accounting and tax rules require (amounts, dates, payment, refund and dispute IDs), with your email, site and notes removed; Dodo Payments keeps its own records as merchant of record. If a Fix Pack is paid but not delivered, or a refund, dispute or subscription is still open, deletion waits until it settles. Deletion requests sent to <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> run through the same process once we confirm the address is yours.</li>
        <li>Access: email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> (or reply to any email we send) for a copy of your data. We answer verified requests within 30 days.</li>
      </ul>
      <p>Last updated: October 28, 2026.</p>
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
      "Email support@seofixkit.com for help with audits, the Fix Pack, billing, refunds or security reports.",
    body: `
      <p>Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a> with any question or problem, including an email you expected that never arrived. You can also reply to any SEO Fix Kit email; we use that thread to confirm the account is yours.</p>

      <h2>What to include</h2>
      <p>Include your account email, the site, the report link or ID, your checkout email if it is different, and the repair-queue item you are asking about. For a rerun question, say what changed on the site and when it shipped. For billing, include the Dodo receipt email, the payment date, and whether the Fix Pack repair pass has started.</p>

      <h2>Fix Pack support</h2>
      <ul>
        <li>The Fix Pack covers one repair pass on one report, plus one rerun after the fixes ship.</li>
        <li>No ranking, traffic, or revenue promise is made.</li>
        <li>If payment succeeds but the repair pass can’t start, you get a full refund.</li>
        <li>Refunds: a full refund on request within 14 days of payment if the repair pass has not started. After work starts, requests are reviewed against the Dodo payment record, the report and the delivery status.</li>
        <li>Security or abuse reports should include the affected URL, account email, and timestamp.</li>
      </ul>

      <h2>Delivery expectations</h2>
      <p>The Fix Pack is deliberately narrow. We review the saved report, confirm which problems have evidence, prepare repair proposals, and keep delivery notes on the report. Some fixes come as written instructions, some as draft actions you approve, and some may be marked unsupported when we can’t do them safely yet. We do not log in to your CMS, publish changes, merge code, or call provider admin APIs from the browser.</p>

      <h2>Security and abuse</h2>
      <p>Include the affected page or route, your account email if relevant, the time, your browser, and steps to reproduce. Do not send secrets, private keys, passwords, payment card numbers, or production credentials by email. If a report shows data from a site or account you do not own, stop using it and email support right away so we can lock the report.</p>

      <h2>Ownership and deletion</h2>
      <p>SEO Fix Kit is for sites you own or are authorized to audit. We may pause audits, delete reports or revoke access when ownership is unclear, the target looks abusive, or a crawl could overload someone else’s site. To delete your account and its data, use Delete account under Billing in your account. To get a copy of your data, email us from your account address or reply to an SEO Fix Kit email so we can confirm it is you.</p>
      <p>Last updated: June 19, 2026.</p>
    `
  });
}

function termsHtml(origin) {
  return policyPageHtml({
    origin,
    title: "Terms",
    path: "/terms",
    description: "The terms for using SEO Fix Kit: audits, the Fix Pack, payments, refunds and liability.",
    body: `
      <p>These terms govern your use of SEO Fix Kit at seofixkit.com ("the service", "we", "us"). By requesting access, running an audit, or purchasing a Fix Pack you agree to them. Contact: <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>.</p>

      <h2>The service</h2>
      <ul>
        <li>SEO Fix Kit provides SEO audits and a paid Fix Pack: one repair pass on the confirmed problems in one report, plus one rerun after the fixes.</li>
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

// Cloudflare serves dist/404.html for unknown paths ("not_found_handling": "404-page").
function notFoundHtml(origin = "") {
  const description =
    "This page does not exist on SEO Fix Kit. Go to the homepage, check a page for free, or contact support.";
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
            <a class="btn btn-secondary" href="${origin}/check">Check a page</a>
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
  aboutHtml,
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
  publicProductPageHtml,
  renderedVsStaticAuditHtml,
  siteFooter,
  siteHeader,
  socialImageMeta,
  smallBusinessSeoAuditHtml,
  supportHtml,
  termsHtml
};
