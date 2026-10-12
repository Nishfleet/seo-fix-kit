// Real engine-captured proof output for the public /demo page.
//
// Every field here is verbatim output from the shared audit engine running
// against SEO Fix Kit's own public test page (/fixture/rendered-page), the
// same page and the same options the private demo audit endpoint uses
// (worker/routes/audits.js runPrivateDemoAudit). Nothing in this module is
// hand-written marketing copy: pages.test.mjs runs the real engine against
// the real fixture and fails when any stored field drifts from live output,
// so the public sample stays truthful as the engine changes.
//
// Origin-dependent strings (canonical URLs, snippet URLs) use the {ORIGIN}
// placeholder and are substituted at render time.
import { VERSION } from "../../shared/audit-engine.js";

export const DEMO_FIXTURE_PATH = "/fixture/rendered-page";

export const DEMO_PROOF = {
  engineVersion: VERSION,
  fixturePath: DEMO_FIXTURE_PATH,
  measured: {
    staticWordCount: 3,
    renderedWordCount: 277,
    renderedH1: "Rendered SaaS page with real content",
    renderedInternalLinkCount: 3,
    renderedTitle: "Proof Demo App Shell"
  },
  guards: [
    {
      severity: "good",
      title: "False positive guarded on home: H1 exists after render",
      why: "The H1 is added by JavaScript. Tools that only read raw HTML would call it missing. The page is fine.",
      evidence: 'Rendered H1: "Rendered SaaS page with real content"',
      fix: "No change needed. Don't add a second H1."
    },
    {
      severity: "good",
      title: "False positive guarded on home: internal links exist after render",
      why: "The links are added by JavaScript. Raw HTML has none, but the loaded page does.",
      evidence: "3 rendered internal links found.",
      fix: "No change needed. Keep them as normal <a href> links."
    },
    {
      severity: "good",
      title: "False positive guarded on home: rendered content is not thin",
      why: "Raw HTML has little text, but the loaded page has plenty.",
      evidence: "277 rendered words found.",
      fix: "No change needed."
    }
  ],
  repairPlan: [
    {
      severity: "critical",
      title: "Canonical conflicts with noindex on home",
      fix: "If the page should be in search, remove noindex. If it shouldn't, remove the canonical tag.",
      snippet: ""
    },
    {
      severity: "critical",
      title: "Noindex found on home",
      fix: "If this page should show up in search, remove the noindex tag or header.",
      snippet: ""
    },
    {
      severity: "warning",
      title: "Social share image incomplete on home",
      fix: "Add og:image and twitter:image tags pointing at a 1200x630 image.",
      snippet: `<!-- The audited page had no working og:image. Create {ORIGIN}/og-image.png (1200x630) or replace it with your real share image. -->
<meta property="og:title" content="Proof Demo App Shell" />
<meta property="og:description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
<meta property="og:image" content="{ORIGIN}/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Proof Demo App Shell" />
<meta name="twitter:description" content="A JavaScript-rendered demo page for proving false-positive SEO audit behavior." />
<meta name="twitter:image" content="{ORIGIN}/og-image.png" />`
    },
    {
      severity: "notice",
      title: "Apple touch icon missing on home",
      fix: 'Add a 180x180 PNG icon and link it with <link rel="apple-touch-icon">.',
      snippet: `<!-- No icon file loaded at {ORIGIN}/apple-touch-icon.png during this audit. Create a square 180x180 PNG there, or point href at your real icon file, before shipping this tag. -->
<link rel="apple-touch-icon" href="{ORIGIN}/apple-touch-icon.png" />`
    },
    {
      severity: "notice",
      title: "Structured data opportunity on home",
      fix: "Add JSON-LD schema that describes only what the page shows.",
      snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Proof Demo App Shell",
  "url": "{ORIGIN}",
  "description": "A JavaScript-rendered demo page for proving false-positive SEO audit behavior."
}
</script>`
    },
    {
      severity: "notice",
      title: "Add answer-ready sections for buyer questions",
      fix: "Add short sections, in the page HTML, that answer what buyers ask. Keep each claim specific and back it up.",
      snippet: ""
    },
    {
      severity: "notice",
      title: "Add truthful entity schema where useful",
      fix: "Add Organization, WebSite, Product, Service, LocalBusiness or FAQ schema, but only for what the page shows.",
      snippet: ""
    }
  ]
};

export function demoProofSnippet(snippet, origin) {
  return String(snippet || "").replaceAll("{ORIGIN}", origin);
}
