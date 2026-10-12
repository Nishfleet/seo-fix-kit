// Site header and footer links, shared by the worker-rendered pages
// (siteHeader()/siteFooter() in worker/routes/pages.js) and the React landing
// page (src/components/SiteChrome.jsx), so the two cannot drift apart.
export const SITE_NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/methodology", label: "How it works" },
  { href: "/beta", label: "Sign in" }
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
