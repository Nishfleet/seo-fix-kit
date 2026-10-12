// Site header and footer links, shared by the worker-rendered pages
// (siteHeader()/siteFooter() in worker/routes/pages.js) and the React landing
// page (src/components/SiteChrome.jsx), so the two cannot drift apart.
export const SITE_NAV = [
  {
    label: "Product",
    id: "product",
    items: [
      { href: "/check", label: "Free page check", text: "Check one public page in a real browser. No account." },
      { href: "/demo", label: "Sample report", text: "A real report, with the evidence behind every issue." },
      { href: "/proof", label: "Customer proof", text: "85 to 100 across two fixes, with the reruns on record." },
      { href: "/pricing#plans", label: "Fix Packs", text: "A repair pass and a proof rerun, only when it is needed." }
    ]
  },
  {
    label: "Use cases",
    id: "use-cases",
    items: [
      {
        href: "/small-business-seo-audit",
        label: "Small business sites",
        text: "Find what stops customers finding you."
      },
      {
        href: "/rendered-vs-static-seo-audit",
        label: "JavaScript sites",
        text: "Catch problems that only show up once the page renders."
      },
      { href: "/ai-answer-readiness", label: "AI search readiness", text: "See what AI crawlers can actually read." }
    ]
  },
  { href: "/methodology", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/beta", label: "Sign in", kind: "sign-in" }
];

export const SITE_TAGLINE = "Find the SEO problems that matter, prove them, and fix them.";

export const SITE_FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/check", label: "Free page check" },
      { href: "/demo", label: "Sample report" },
      { href: "/proof", label: "Customer proof" },
      { href: "/pricing", label: "Pricing" }
    ]
  },
  {
    title: "Use cases",
    links: [
      { href: "/small-business-seo-audit", label: "Small business SEO audit" },
      { href: "/rendered-vs-static-seo-audit", label: "JavaScript SEO audit" },
      { href: "/ai-answer-readiness", label: "AI answer readiness" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/methodology", label: "How it works" },
      { href: "/support", label: "Support" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "mailto:support@seofixkit.com", label: "support@seofixkit.com" }
    ]
  }
];
