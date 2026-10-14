export const SEO_CHECKLIST = [
  {
    id: "crawl",
    title: "Crawling and indexing",
    items: [
      { id: "https", text: "Every page loads over HTTPS, with no http:// images or scripts.", auto: true },
      { id: "one-host", text: "One version of the site: http and www both redirect to the main address." },
      {
        id: "robots",
        text: "robots.txt exists and doesn’t block pages, CSS or JavaScript you need indexed.",
        tool: "robots-txt-tester"
      },
      {
        id: "sitemap",
        text: "An XML sitemap lists every page you want indexed, and only those.",
        tool: "sitemap-generator"
      },
      {
        id: "search-console",
        text: "The site is verified in Google Search Console and Bing Webmaster Tools, with the sitemap submitted."
      },
      { id: "noindex", text: "No important page carries noindex by mistake.", auto: true },
      { id: "canonical", text: "Each page has a canonical URL pointing at itself or the main version.", auto: true },
      { id: "redirects", text: "Old URLs redirect in one hop to the closest new page.", auto: true, tool: "redirects" },
      { id: "broken-links", text: "No broken internal links or images.", auto: true },
      {
        id: "rendering",
        text: "Key content and links are in the HTML, not only added later by JavaScript.",
        auto: true
      }
    ]
  },
  {
    id: "page",
    title: "On each page",
    items: [
      {
        id: "title",
        text: "A unique title under about 60 characters that says what the page offers.",
        auto: true,
        tool: "serp-preview"
      },
      {
        id: "description",
        text: "A unique meta description under about 160 characters.",
        auto: true,
        tool: "meta-tags"
      },
      { id: "h1", text: "Exactly one H1 that matches the search the page targets.", auto: true },
      { id: "headings", text: "Headings follow in order (H2 under H1, H3 under H2).", auto: true },
      { id: "alt", text: "Meaningful images have alt text.", auto: true },
      { id: "lang", text: "The <html> tag declares the page language.", auto: true },
      { id: "viewport", text: "The page has a mobile viewport tag and works on a phone.", auto: true },
      { id: "url", text: "URLs are short, readable and use dashes between words." },
      {
        id: "internal-links",
        text: "Every important page is linked from other pages with descriptive link text.",
        auto: true
      },
      { id: "social", text: "Open Graph tags and a 1200 × 630 share image are set.", auto: true, tool: "open-graph" }
    ]
  },
  {
    id: "speed",
    title: "Speed and experience",
    items: [
      { id: "lcp", text: "The main content shows within 2.5 seconds on a phone (LCP)." },
      { id: "cls", text: "Nothing jumps around while the page loads (CLS under 0.1)." },
      {
        id: "images",
        text: "Images are compressed and sized for the screen (WebP or AVIF where possible).",
        auto: true
      },
      { id: "popups", text: "No pop-up covers the content on phones before people can read it." }
    ]
  },
  {
    id: "content",
    title: "Content",
    items: [
      { id: "intent", text: "Each page answers one search better than the pages already ranking for it." },
      { id: "answer-first", text: "The direct answer comes first, then the detail.", tool: "word-counter" },
      { id: "thin", text: "No thin or near-duplicate pages. Merge or improve them.", auto: true },
      {
        id: "keywords",
        text: "The words searchers use appear naturally in the title, H1 and opening.",
        tool: "keyword-density"
      },
      { id: "fresh", text: "Facts, prices and dates are current, and pages show when they were last updated." },
      { id: "authors", text: "Articles name a real author with relevant experience." }
    ]
  },
  {
    id: "ai",
    title: "AI search",
    items: [
      {
        id: "ai-crawlers",
        text: "robots.txt allows the AI search crawlers you want citing you (OAI-SearchBot, Claude-SearchBot, PerplexityBot).",
        tool: "robots-txt"
      },
      {
        id: "schema",
        text: "Structured data describes the business, products and articles, and the JSON is valid.",
        auto: true,
        tool: "schema"
      },
      {
        id: "facts",
        text: "Key facts (prices, locations, hours, specs) are in plain text on the page, not only in images."
      },
      { id: "questions", text: "Common questions are answered in their own short sections with clear headings." },
      { id: "llms", text: "An llms.txt points AI tools at your most useful pages (optional).", tool: "llms-txt" },
      {
        id: "entity",
        text: "Your name, address and profiles match everywhere: site, Google Business Profile and social pages."
      }
    ]
  },
  {
    id: "local",
    title: "International and local (if relevant)",
    items: [
      {
        id: "hreflang",
        text: "Language versions link to each other with valid hreflang codes.",
        auto: true,
        tool: "hreflang"
      },
      { id: "gbp", text: "Your Google Business Profile is claimed, complete and in the right category." },
      { id: "reviews", text: "You ask happy customers for reviews and reply to every review." }
    ]
  }
];
