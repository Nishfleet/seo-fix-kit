export const SITE_NAV = [
  {
    label: "Product",
    id: "product",
    items: [
      { href: "/check", label: "Free page check", text: "Check one public page in a real browser. No account." },
      { href: "/demo", label: "Sample report", text: "Real engine output for a test page, with the evidence." },
      { href: "/proof", label: "Case study", text: "Our founder’s site, from 85 to 100 in two fixes." },
      { href: "/pricing#plans", label: "Fix Pack", text: "A $99 repair pass with a rerun that confirms it." }
    ]
  },
  {
    label: "Use cases",
    id: "use-cases",
    items: [
      {
        href: "/small-business-seo-audit",
        label: "Small business sites",
        text: "A plain audit for sites without an SEO team."
      },
      {
        href: "/rendered-vs-static-seo-audit",
        label: "JavaScript sites",
        text: "Compare raw HTML with the rendered page."
      },
      {
        href: "/ai-answer-readiness",
        label: "AI search readiness",
        text: "See what AI crawlers can read on your pages."
      }
    ]
  },
  { href: "/tools", label: "Free tools" },
  { href: "/methodology", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/beta", label: "Sign in", kind: "sign-in" }
];

export const SITE_TAGLINE = "The SEO audit that checks its own work.";

export const SITE_FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/check", label: "Free page check" },
      { href: "/demo", label: "Sample report" },
      { href: "/proof", label: "Case study" },
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
    title: "Free tools",
    links: [
      { href: "/tools/meta-tags", label: "Meta tag generator" },
      { href: "/tools/schema", label: "Schema generator" },
      { href: "/tools/robots-txt", label: "Robots.txt generator" },
      { href: "/tools/serp-preview", label: "SERP preview" },
      { href: "/tools", label: "All free tools" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/methodology", label: "How it works" },
      { href: "/support", label: "Support" },
      { href: "/status", label: "Status" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "mailto:support@seofixkit.com", label: "support@seofixkit.com" }
    ]
  }
];
