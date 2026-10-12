// Tool guides with affiliate disclosure. Outbound vendor links go through
// /go/<tool> so affiliate URLs can be swapped in one place once approved.
// Until an affiliate URL is set, /go/<tool> redirects to the plain vendor site.
import { publicProductPageHtml } from "./pages.js";

// PLACEHOLDER: replace `url` with the approved affiliate link per program.
const GO_LINKS = {
  semrush: { url: "https://www.semrush.com/", affiliate: false },
  ahrefs: { url: "https://ahrefs.com/", affiliate: false },
  "screaming-frog": { url: "https://www.screamingfrog.co.uk/seo-spider/", affiliate: false },
  "google-search-console": { url: "https://search.google.com/search-console/about", affiliate: false },
  pagespeed: { url: "https://pagespeed.web.dev/", affiliate: false },
  hostinger: { url: "https://www.hostinger.com/", affiliate: false },
  cloudflare: { url: "https://www.cloudflare.com/", affiliate: false }
};

function goRedirect(pathname) {
  const slug = pathname.replace(/^\/go\//, "").replace(/\/$/, "").toLowerCase();
  const target = Object.prototype.hasOwnProperty.call(GO_LINKS, slug) ? GO_LINKS[slug] : null;
  if (!target) return null;
  return new Response(null, {
    status: 302,
    headers: {
      location: target.url,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}

const DISCLOSURE = `
      <section class="band" aria-label="Affiliate disclosure">
        <p><strong>Disclosure:</strong> some links on this page go through <code>/go/…</code> and may be affiliate links. If you buy through them, SEO Fix Kit may earn a commission at no extra cost to you. It does not change what we recommend, and SEO Fix Kit is also an SEO product, so weigh our view accordingly. Check each vendor's current pricing and terms on their own site.</p>
      </section>`;

function out(origin, slug, label) {
  return `<a href="${origin}/go/${slug}" rel="sponsored nofollow noopener" target="_blank">${label}</a>`;
}

function bestSeoAuditToolsHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/guides/best-seo-audit-tools",
    title: "Best SEO Audit Tools (Free and Paid) | SEO Fix Kit Guide",
    description: "How to choose an SEO audit tool: free options from Google, desktop crawlers, all-in-one suites, and when a proof-backed repair audit fits better.",
    eyebrow: "Guide",
    heading: "Best SEO audit tools, by the job you need done",
    lead: "No single tool is best for everyone. Pick by job: free diagnostics first, a crawler for site-wide issues, a suite for keywords and competitors, and a proof-backed check when you need to know what to actually fix.",
    body: `${DISCLOSURE}
      <section class="band">
        <h2>Start free: Google's own tools</h2>
        <ul class="check-list">
          <li>${out(origin, "google-search-console", "Google Search Console")}: indexing, coverage, and query data straight from Google. Set it up before buying anything.</li>
          <li>${out(origin, "pagespeed", "PageSpeed Insights")}: lab and field performance data for one URL.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Site-wide crawling</h2>
        <p>${out(origin, "screaming-frog", "Screaming Frog SEO Spider")} is a desktop crawler with a free tier that has a URL limit; a paid licence removes it. Good for broken links, redirects, titles, and canonicals across a whole site.</p>
      </section>
      <section class="band">
        <h2>All-in-one suites</h2>
        <p>${out(origin, "semrush", "Semrush")} and ${out(origin, "ahrefs", "Ahrefs")} bundle site audits with keyword research, backlinks, and competitor data. Worth it when you also need research, not just a health check. See <a href="${origin}/guides/semrush-vs-alternatives">Semrush vs alternatives</a>.</p>
      </section>
      <section class="band">
        <h2>When you need proof, not a checklist</h2>
        <p>Crawlers that read raw HTML can flag issues that a real browser render does not have. <a href="${origin}/check">SEO Fix Kit's free one-page check</a> renders the page and separates real findings from static-crawler false positives. Work through the free <a href="${origin}/checklist">Proof-First Technical SEO Checklist</a>, then re-measure. It does not replace the suites above for keyword or backlink research.</p>
      </section>`,
    faq: [
      { q: "Do I need a paid SEO tool to start?", a: "No. Google Search Console and PageSpeed Insights are free and cover indexing and performance basics." },
      { q: "Are these affiliate links?", a: "Some outbound links may be affiliate links; see the disclosure at the top of the page." }
    ]
  });
}

function semrushVsAlternativesHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/guides/semrush-vs-alternatives",
    title: "Semrush vs Alternatives: Ahrefs, Free Tools, and Crawlers | SEO Fix Kit Guide",
    description: "When Semrush is worth it, when Ahrefs or a crawler fits better, and what you can do free first.",
    eyebrow: "Guide",
    heading: "Semrush vs alternatives: choose by workflow",
    lead: "Semrush, Ahrefs, and desktop crawlers overlap but are not the same purchase. Decide by what you will do every week.",
    body: `${DISCLOSURE}
      <section class="band">
        <h2>Pick Semrush if</h2>
        <ul class="check-list">
          <li>You want keyword research, site audit, competitor and advertising data in one subscription.</li>
          <li>You can make use of a trial before committing. ${out(origin, "semrush", "See Semrush plans")}.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Pick Ahrefs if</h2>
        <p>Backlink research and content exploration are your main weekly tasks. ${out(origin, "ahrefs", "See Ahrefs plans")}.</p>
      </section>
      <section class="band">
        <h2>Pick a crawler (or stay free) if</h2>
        <p>You only need technical health checks. ${out(origin, "screaming-frog", "Screaming Frog")} plus ${out(origin, "google-search-console", "Search Console")} covers most of it, and <a href="${origin}/check">SEO Fix Kit's free check</a> verifies findings against the rendered page.</p>
      </section>
      <section class="band">
        <h2>Pricing note</h2>
        <p>Plans and prices change often. We do not list prices here; check each vendor's pricing page before buying.</p>
      </section>`,
    faq: [
      { q: "Is Semrush better than Ahrefs?", a: "Neither is better for everyone. Semrush is broader across marketing tasks; Ahrefs is often chosen for backlink work. Match the tool to your weekly workflow." }
    ]
  });
}

function fastHostingForSeoHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/guides/fast-hosting-for-seo",
    title: "Fast Hosting for SEO: What Actually Matters | SEO Fix Kit Guide",
    description: "How hosting affects SEO through server response time and uptime, what to measure, and how to choose shared, cloud, or VPS hosting plus a CDN.",
    eyebrow: "Guide",
    heading: "Fast hosting for SEO: measure first, then move",
    lead: "Hosting affects SEO mainly through server response time, uptime, and how reliably crawlers can fetch your pages. Measure before you migrate.",
    body: `${DISCLOSURE}
      <section class="band">
        <h2>Measure your current host</h2>
        <ul class="check-list">
          <li>Run key URLs through ${out(origin, "pagespeed", "PageSpeed Insights")} and note server response time and field data.</li>
          <li>Check crawl stats and server errors in ${out(origin, "google-search-console", "Search Console")}.</li>
        </ul>
      </section>
      <section class="band">
        <h2>Choosing a host</h2>
        <p>Shared hosting suits small sites; cloud or VPS suits heavier or growing sites. ${out(origin, "hostinger", "Hostinger")} offers shared, cloud, and VPS plans. Put a CDN such as ${out(origin, "cloudflare", "Cloudflare")} in front for caching and TLS.</p>
      </section>
      <section class="band">
        <h2>After you move</h2>
        <p>Re-run the same measurements and use <a href="${origin}/check">SEO Fix Kit's free check</a> to confirm the rendered page still serves the right titles, canonicals, and content. The <a href="${origin}/checklist">proof-first checklist</a> has a speed and hosting section. No host guarantees rankings.</p>
      </section>`,
    faq: [
      { q: "Will faster hosting improve my rankings?", a: "It can remove a bottleneck, but no host guarantees rankings. Measure response time before and after." }
    ]
  });
}

const GUIDE_ROUTES = {
  "/guides/best-seo-audit-tools": bestSeoAuditToolsHtml,
  "/guides/semrush-vs-alternatives": semrushVsAlternativesHtml,
  "/guides/fast-hosting-for-seo": fastHostingForSeoHtml
};

export { GO_LINKS, GUIDE_ROUTES, goRedirect, bestSeoAuditToolsHtml, semrushVsAlternativesHtml, fastHostingForSeoHtml };
