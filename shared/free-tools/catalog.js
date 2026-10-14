import {
  SCHEMA_TYPES,
  disavow,
  hreflang,
  keywordDensity,
  llmsTxt,
  metaTags,
  openGraph,
  redirects,
  robotsTest,
  robotsTxt,
  schemaMarkup,
  serpPreview,
  sitemapXml,
  utmLink,
  wordCount
} from "./generators.js";
import { SEO_CHECKLIST } from "./checklist.js";

export const TOOL_CATEGORIES = [
  { id: "generate", title: "Generate code", text: "Copy-ready tags and files, checked as you type." },
  { id: "check", title: "Check and preview", text: "See what Google and crawlers will see before you publish." },
  { id: "content", title: "Content", text: "Measure the words on a page." },
  { id: "plan", title: "Plan", text: "Work through the basics in order." }
];

const SAMPLE_TEXT = `Running shoes wear out faster than most runners think. A good pair of running shoes lasts between 500 and 800 kilometres, depending on your weight, your stride and the surface you run on.

How do you know when running shoes are worn out? Look at the midsole. Deep creases, a flat feel underfoot and new aches in your knees are all signs. The tread on the outsole matters less than the foam inside.

Rotating two pairs of running shoes lets the foam recover between runs, so both pairs last longer.`;

const text = (name, label, value = "", extra = {}) => ({ name, label, type: "text", value, ...extra });
const url = (name, label, value = "", extra = {}) => ({
  name,
  label,
  type: "url",
  value,
  placeholder: "https://",
  ...extra
});
const area = (name, label, value = "", extra = {}) => ({
  name,
  label,
  type: "textarea",
  value,
  rows: 5,
  wide: true,
  ...extra
});
const select = (name, label, options, value, extra = {}) => ({
  name,
  label,
  type: "select",
  options,
  value: value ?? options[0].value,
  ...extra
});
const opts = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const when = (field, ...values) => ({ showWhen: { field, values } });

const schemaShow = (...types) => when("schemaType", ...types);

export const FREE_TOOLS = [
  {
    slug: "meta-tags",
    category: "generate",
    name: "Meta tag generator",
    short: "Title, description, canonical, robots and share tags in one block.",
    title: "Free meta tag generator",
    description:
      "Generate the title, meta description, canonical, robots and social tags for a page, with length checks and a live Google preview.",
    lead: "Fill in the page details and copy one block of tags into your page’s <head>. Lengths are checked as you type.",
    generate: metaTags,
    fields: [
      text("title", "Page title", "Trail Running Shoes for Wet Ground | Ridgeline", { wide: true }),
      area(
        "description",
        "Meta description",
        "Grippy, waterproof trail shoes tested on 40 km of wet hills. Free returns for 60 days and free delivery over $50.",
        { rows: 3 }
      ),
      url("url", "Canonical URL", "https://ridgeline.example/trail-shoes"),
      url("image", "Share image URL", "https://ridgeline.example/og/trail-shoes.png"),
      text("siteName", "Site name", "Ridgeline"),
      text("twitterHandle", "X (Twitter) handle", "", { placeholder: "@yourbrand" }),
      select(
        "robots",
        "Search engines may",
        opts(
          ["index, follow", "Index and follow links"],
          ["noindex, follow", "Not index, but follow links"],
          ["noindex, nofollow", "Not index or follow links"]
        )
      ),
      select("type", "Page type", opts(["website", "Website or product page"], ["article", "Article or blog post"]))
    ],
    howTo: [
      "Write a title under 60 characters that says what the page is and who it’s for.",
      "Write a description under 160 characters that gives a reason to click.",
      "Copy the block into the page’s <head>, replacing any tags it already has."
    ],
    faq: [
      {
        q: "Does Google always use my meta description?",
        a: "No. Google rewrites the snippet when it thinks other text on the page answers the search better. A clear, specific description is still used most of the time."
      },
      {
        q: "Do meta keywords matter?",
        a: "No. Google has ignored the meta keywords tag for over a decade, so this tool leaves it out."
      }
    ],
    related: ["serp-preview", "open-graph", "schema"]
  },
  {
    slug: "serp-preview",
    category: "check",
    name: "Google SERP preview",
    short: "See how a title and description fit on desktop and mobile results.",
    title: "Free Google SERP preview tool",
    description:
      "Preview how your title and meta description appear in Google results on desktop and mobile, measured in pixels the way Google truncates them.",
    lead: "Google cuts titles and descriptions by width, not by character count. This preview measures in pixels, so you see where the cut falls.",
    generate: serpPreview,
    fields: [
      text("title", "Title", "Trail Running Shoes for Wet Ground | Ridgeline", { wide: true }),
      area(
        "description",
        "Meta description",
        "Grippy, waterproof trail shoes tested on 40 km of wet hills. Free returns for 60 days and free delivery over $50.",
        { rows: 3 }
      ),
      url("url", "Page URL", "https://ridgeline.example/trail-shoes", { wide: true })
    ],
    howTo: [
      "Paste the title and description you plan to publish.",
      "Check that the most important words appear before the cut on both previews.",
      "Shorten or reorder until nothing important falls after the ellipsis."
    ],
    faq: [
      {
        q: "How accurate are the pixel limits?",
        a: "They are close but approximate. Google doesn’t publish exact limits and changes its layout from time to time. Roughly 600px for titles and 920px for descriptions on desktop holds up well."
      },
      {
        q: "Why does Google show a different title from mine?",
        a: "Google rewrites titles that are too long, stuffed with keywords or don’t match the page. A short, accurate title is rewritten far less."
      }
    ],
    related: ["meta-tags", "open-graph", "word-counter"]
  },
  {
    slug: "open-graph",
    category: "generate",
    name: "Open Graph generator",
    short: "Share tags for Facebook, LinkedIn, Slack, X and iMessage, with a preview.",
    title: "Free Open Graph and Twitter Card generator",
    description:
      "Generate Open Graph and Twitter Card tags with a live share preview, so links to your pages look right on social apps and in chat.",
    lead: "These tags decide the title, text and image people see when your link is shared in chat or on social apps.",
    generate: openGraph,
    fields: [
      text("title", "Title", "Trail Running Shoes for Wet Ground", { wide: true }),
      area("description", "Description", "Grippy, waterproof trail shoes tested on 40 km of wet hills.", { rows: 2 }),
      url("url", "Page URL", "https://ridgeline.example/trail-shoes"),
      url("image", "Image URL (1200 × 630 px)", "https://ridgeline.example/og/trail-shoes.png"),
      text("imageAlt", "Image alt text", "A muddy trail shoe on a wet rock"),
      text("siteName", "Site name", "Ridgeline"),
      select("type", "Type", opts(["website", "Website"], ["article", "Article"], ["product", "Product"])),
      select(
        "twitterCard",
        "X card size",
        opts(["summary_large_image", "Large image"], ["summary", "Small square image"])
      ),
      text("twitterSite", "X (Twitter) handle", "", { placeholder: "@yourbrand" }),
      text("locale", "Locale", "en_US")
    ],
    howTo: [
      "Use an image of 1200 × 630 pixels with the important part in the centre.",
      "Paste the tags into the page’s <head>.",
      "Check the result with each platform’s own debugger, since they cache old previews."
    ],
    faq: [
      {
        q: "Why isn’t my new image showing when I share the link?",
        a: "Platforms cache previews for days. Use Facebook’s Sharing Debugger or LinkedIn’s Post Inspector to fetch the page again."
      },
      {
        q: "Do I need Twitter tags if I have Open Graph?",
        a: "X falls back to Open Graph for the title, description and image, but it needs twitter:card to pick the large layout."
      }
    ],
    related: ["meta-tags", "serp-preview", "utm-builder"]
  },
  {
    slug: "schema",
    category: "generate",
    name: "Schema markup generator",
    short: "JSON-LD for 10 types, checked against Google’s required fields.",
    title: "Free schema markup generator (JSON-LD)",
    description:
      "Generate JSON-LD structured data for organizations, local businesses, articles, products, FAQs, breadcrumbs, events and more, checked against Google’s required fields.",
    lead: "Structured data tells search engines and AI assistants exactly what a page is about. Pick a type, fill in what’s true, and paste the block into the page.",
    generate: schemaMarkup,
    fields: [
      select("schemaType", "Type", SCHEMA_TYPES, "LocalBusiness", { wide: true }),
      select(
        "businessType",
        "Kind of business",
        opts(
          ["LocalBusiness", "Other local business"],
          ["Restaurant", "Restaurant"],
          ["Store", "Shop"],
          ["Dentist", "Dentist"],
          ["MedicalClinic", "Medical clinic"],
          ["LegalService", "Law firm"],
          ["HomeAndConstructionBusiness", "Trades and building"],
          ["AutoRepair", "Car repair"],
          ["BeautySalon", "Beauty salon"],
          ["ProfessionalService", "Professional service"]
        ),
        "Store",
        schemaShow("LocalBusiness")
      ),
      text("name", "Name or headline", "Ridgeline Running", { wide: true }),
      url(
        "url",
        "URL",
        "https://ridgeline.example/",
        schemaShow(
          "Organization",
          "LocalBusiness",
          "Article",
          "Product",
          "Event",
          "Person",
          "SoftwareApplication",
          "WebSite"
        )
      ),
      url(
        "image",
        "Image or logo URL",
        "https://ridgeline.example/logo.png",
        schemaShow("Organization", "LocalBusiness", "Article", "Product", "Event", "Person")
      ),
      area("description", "Description", "Trail and road running shoes, fitted in store.", {
        rows: 2,
        ...schemaShow("Organization", "LocalBusiness", "Article", "Product", "Event", "Person", "SoftwareApplication")
      }),
      text("alternateName", "Other name for the site", "", schemaShow("WebSite")),
      text("email", "Email", "", schemaShow("Organization")),
      text("phone", "Phone", "+1 503 555 0142", schemaShow("Organization", "LocalBusiness")),
      text("priceRange", "Price range", "$$", schemaShow("LocalBusiness")),
      text("venue", "Venue name", "", schemaShow("Event")),
      select(
        "eventMode",
        "Where",
        opts(["offline", "In person"], ["online", "Online"]),
        "offline",
        schemaShow("Event")
      ),
      text("street", "Street address", "214 SE Water Ave", schemaShow("LocalBusiness", "Event")),
      text("city", "City", "Portland", schemaShow("LocalBusiness", "Event")),
      text("region", "State or region", "OR", schemaShow("LocalBusiness", "Event")),
      text("postalCode", "Postcode", "97214", schemaShow("LocalBusiness", "Event")),
      text("country", "Country code", "US", schemaShow("LocalBusiness", "Event")),
      text("author", "Author", "", schemaShow("Article")),
      url("authorUrl", "Author page URL", "", schemaShow("Article")),
      text("publisher", "Publisher or organizer", "", schemaShow("Article", "Event")),
      { name: "datePublished", label: "Published", type: "date", value: "", ...schemaShow("Article") },
      { name: "dateModified", label: "Updated", type: "date", value: "", ...schemaShow("Article") },
      { name: "startDate", label: "Starts", type: "datetime-local", value: "", ...schemaShow("Event") },
      { name: "endDate", label: "Ends", type: "datetime-local", value: "", ...schemaShow("Event") },
      text("brand", "Brand", "", schemaShow("Product")),
      text("sku", "SKU", "", schemaShow("Product")),
      text("price", "Price", "", { placeholder: "49.00", ...schemaShow("Product", "SoftwareApplication") }),
      text("currency", "Currency", "USD", schemaShow("Product", "SoftwareApplication")),
      select(
        "availability",
        "Availability",
        opts(["InStock", "In stock"], ["OutOfStock", "Out of stock"], ["PreOrder", "Pre-order"]),
        "InStock",
        schemaShow("Product")
      ),
      text("jobTitle", "Job title", "", schemaShow("Person")),
      text("appCategory", "App category", "BusinessApplication", schemaShow("SoftwareApplication")),
      text("operatingSystem", "Runs on", "Web", schemaShow("SoftwareApplication")),
      area(
        "faq",
        "Questions and answers",
        "Do you fit shoes in store?\nYes. Every pair is fitted on a treadmill by our staff.\nCan I return worn shoes?\nYes, within 60 days, even after running in them.",
        {
          rows: 6,
          help: "A line ending in ? starts a question. The lines under it are the answer.",
          ...schemaShow("FAQPage")
        }
      ),
      area(
        "breadcrumbs",
        "Breadcrumbs",
        "Home | https://ridgeline.example/\nShoes | https://ridgeline.example/shoes\nTrail shoes",
        { help: "One level per line: Name | URL. The last level can skip the URL.", ...schemaShow("BreadcrumbList") }
      ),
      area("sameAs", "Profile links", "https://www.instagram.com/ridgeline.example", {
        rows: 3,
        help: "One per line: social profiles, Wikipedia, Google Business Profile.",
        ...schemaShow("Organization", "LocalBusiness", "Person")
      })
    ],
    howTo: [
      "Pick the type that matches what the page is mainly about.",
      "Fill in only what is true and visible on the page. Google penalises markup that doesn’t match the page.",
      "Paste the block anywhere in the page’s HTML and test it with Google’s Rich Results Test."
    ],
    faq: [
      {
        q: "Does schema markup improve rankings?",
        a: "Not directly. It makes pages eligible for rich results such as stars, prices and breadcrumbs, and helps search engines and AI assistants understand the page."
      },
      {
        q: "Where do I put the JSON-LD?",
        a: "Anywhere in the HTML of the page it describes, usually the <head>. Google reads it in the body too."
      },
      {
        q: "Can I add more than one type to a page?",
        a: "Yes. A product page can carry Product and BreadcrumbList blocks side by side. Generate each one and paste both."
      }
    ],
    related: ["meta-tags", "llms-txt", "serp-preview"]
  },
  {
    slug: "robots-txt",
    category: "generate",
    name: "Robots.txt generator",
    short: "Rules for search engines and AI crawlers, with mistakes flagged.",
    title: "Free robots.txt generator with AI crawler rules",
    description:
      "Generate a robots.txt file that controls search engines and AI crawlers separately: allow AI search, block AI training, or both. Common mistakes are flagged.",
    lead: "Decide separately whether AI assistants may read your pages to answer questions and whether AI companies may use them for training.",
    generate: robotsTxt,
    fields: [
      select(
        "access",
        "Search engines",
        opts(["allow", "Allow all"], ["block", "Block everything (staging sites only)"])
      ),
      select(
        "aiSearch",
        "AI search and assistants",
        opts(["allow", "Allow: can cite you in answers"], ["block", "Block"]),
        "allow",
        {
          help: "ChatGPT search, Claude, Perplexity fetching pages to answer questions."
        }
      ),
      select("aiTraining", "AI model training", opts(["allow", "Allow"], ["block", "Block"]), "block", {
        help: "GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Common Crawl, Meta, ByteDance."
      }),
      area("disallow", "Paths to block", "/cart\n/checkout\n/account", {
        rows: 4,
        help: "One per line, starting with /. Use * as a wildcard and $ to mark the end."
      }),
      area("allow", "Exceptions to allow", "", {
        rows: 2,
        help: "Paths inside a blocked folder that crawlers may still read."
      }),
      area("customBlocked", "Other crawlers to block", "", { rows: 2, help: "One user-agent per line." }),
      area("sitemaps", "Sitemap URLs", "https://ridgeline.example/sitemap.xml", { rows: 2 })
    ],
    howTo: [
      "Choose how search engines, AI assistants and AI training crawlers may use your site.",
      "List the private or duplicate areas to keep crawlers out of, such as cart and account pages.",
      "Upload the file as robots.txt at the root of your domain, then test a few URLs with the robots.txt tester."
    ],
    faq: [
      {
        q: "Will blocking GPTBot keep me out of ChatGPT?",
        a: "Not from ChatGPT search. GPTBot collects training data. ChatGPT search uses OAI-SearchBot and ChatGPT-User, which this tool controls separately."
      },
      {
        q: "Does robots.txt remove pages from Google?",
        a: "No. A blocked page can still be indexed from links elsewhere. Use a noindex tag, and let Google crawl the page so it sees the tag."
      }
    ],
    related: ["robots-txt-tester", "sitemap-generator", "llms-txt"]
  },
  {
    slug: "robots-txt-tester",
    category: "check",
    name: "Robots.txt tester",
    short: "Test whether Googlebot or an AI crawler may fetch a URL.",
    title: "Free robots.txt tester",
    description:
      "Test whether Googlebot, Bingbot or an AI crawler such as GPTBot is allowed to fetch a URL under your robots.txt, and see the exact rule that decides it.",
    lead: "Paste your robots.txt, pick a crawler and a URL, and see whether it’s allowed and which rule decides. It follows Google’s matching rules.",
    generate: robotsTest,
    fields: [
      area(
        "robots",
        "robots.txt",
        "User-agent: *\nDisallow: /checkout\nDisallow: /*?sort=\nAllow: /checkout/help\n\nUser-agent: GPTBot\nDisallow: /",
        { rows: 9 }
      ),
      select(
        "userAgent",
        "Crawler",
        opts(
          ["Googlebot", "Googlebot"],
          ["Bingbot", "Bingbot"],
          ["OAI-SearchBot", "OAI-SearchBot (ChatGPT search)"],
          ["GPTBot", "GPTBot (OpenAI training)"],
          ["Claude-SearchBot", "Claude-SearchBot"],
          ["ClaudeBot", "ClaudeBot (Anthropic training)"],
          ["PerplexityBot", "PerplexityBot"],
          ["Google-Extended", "Google-Extended (Gemini training)"]
        )
      ),
      text("path", "URL or path", "/checkout/help")
    ],
    howTo: [
      "Open yourdomain.com/robots.txt and paste its contents.",
      "Choose a crawler and enter the URL you want to check.",
      "Read the verdict and the rule that decided it. Change the rules and test again."
    ],
    faq: [
      {
        q: "Which rule wins when two rules match?",
        a: "The most specific one: the rule with the longest path. When an Allow and a Disallow are equally long, Allow wins. This is the standard Google follows (RFC 9309)."
      },
      {
        q: "Does a crawler follow both its own group and the * group?",
        a: "No. A crawler uses only the most specific group that names it, and falls back to * only when no group names it."
      }
    ],
    related: ["robots-txt", "sitemap-generator", "llms-txt"]
  },
  {
    slug: "llms-txt",
    category: "generate",
    name: "llms.txt generator",
    short: "A plain summary of your site for AI assistants.",
    title: "Free llms.txt generator",
    description:
      "Generate an llms.txt file in the llmstxt.org format: a short summary of your site and links to the pages that matter, written for AI assistants.",
    lead: "llms.txt is a short Markdown file at your site’s root that points AI tools at your most useful pages. It’s a proposal, not a standard, so it’s cheap to add but not a ranking lever.",
    generate: llmsTxt,
    fields: [
      text("siteName", "Site name", "Ridgeline Running"),
      text(
        "summary",
        "One-line summary",
        "Running shoe shop in Portland, OR. Trail and road shoes, fitted on a treadmill in store.",
        { wide: true }
      ),
      area(
        "details",
        "Details",
        "We ship in the US only. Returns are free for 60 days, even after running in the shoes.",
        { rows: 3 }
      ),
      area(
        "links",
        "Pages",
        "## Shop\nTrail shoes | https://ridgeline.example/trail-shoes | Waterproof and grippy models\nRoad shoes | https://ridgeline.example/road-shoes\n## Help\nReturns | https://ridgeline.example/returns | 60-day policy",
        {
          rows: 7,
          help: "Start a section with ## Name. Then one page per line: Title | URL | optional note."
        }
      )
    ],
    howTo: [
      "Write one sentence that says what the site is and who it’s for.",
      "List the pages an assistant would need to answer questions about you.",
      "Upload the file as llms.txt at the root of your domain."
    ],
    faq: [
      {
        q: "Do ChatGPT or Google use llms.txt?",
        a: "None of the major AI search engines has said it uses llms.txt. Developer tools and some assistants do read it. It’s worth the few minutes, but clear pages and structured data matter more."
      }
    ],
    related: ["robots-txt", "schema", "sitemap-generator"]
  },
  {
    slug: "hreflang",
    category: "generate",
    name: "Hreflang generator",
    short: "Language tags for international sites, as HTML, headers or sitemap.",
    title: "Free hreflang tag generator",
    description:
      "Generate hreflang tags for international sites as HTML link tags, HTTP headers or XML sitemap entries. Invalid language and region codes are caught.",
    lead: "Tell Google which version of a page to show in each language and country. Invalid codes, like en-UK, are caught before they cost you traffic.",
    generate: hreflang,
    fields: [
      area(
        "entries",
        "Language versions",
        "en-us | https://ridgeline.example/\nen-gb | https://ridgeline.example/uk/\nde | https://ridgeline.example/de/",
        {
          help: "One per line: language code | URL. Add a region after a dash, like en-GB."
        }
      ),
      url("xDefault", "Default URL (x-default)", "https://ridgeline.example/"),
      select(
        "format",
        "Output",
        opts(["html", "HTML <link> tags"], ["header", "HTTP Link header"], ["sitemap", "XML sitemap"])
      )
    ],
    howTo: [
      "List every language version of one page with its full URL.",
      "Add an x-default for visitors whose language you don’t serve.",
      "Put the same block on every version, so each page links to all the others and itself."
    ],
    faq: [
      {
        q: "What’s the right code for the United Kingdom?",
        a: "en-GB. UK is not a valid ISO 3166 region code, and Google ignores hreflang tags that use it."
      }
    ],
    related: ["sitemap-generator", "meta-tags", "redirects"]
  },
  {
    slug: "redirects",
    category: "generate",
    name: "Redirect generator",
    short: "301 rules for Apache, Nginx, Netlify, Vercel and Next.js, with loops caught.",
    title: "Free 301 redirect generator",
    description:
      "Turn a list of old and new URLs into redirect rules for Apache .htaccess, Nginx, Netlify or Cloudflare Pages, Vercel or Next.js. Chains and loops are flagged.",
    lead: "Paste old and new paths, pick your server, and copy the rules. Chains and loops are caught before they slow down crawlers or break pages.",
    generate: redirects,
    fields: [
      area(
        "rules",
        "Redirects",
        "/shoes/trail-old /trail-shoes\n/blog/2019/fit-guide /guides/shoe-fitting\n/sale /offers 302",
        {
          rows: 6,
          help: "One per line: /old-path /new-path. Add 302 at the end for a temporary redirect."
        }
      ),
      select(
        "platform",
        "Server",
        opts(
          ["apache", "Apache (.htaccess)"],
          ["nginx", "Nginx"],
          ["netlify", "Netlify or Cloudflare Pages (_redirects)"],
          ["vercel", "Vercel (vercel.json)"],
          ["nextjs", "Next.js (next.config.js)"]
        )
      ),
      select(
        "status",
        "Default type",
        opts(
          ["301", "301 permanent"],
          ["302", "302 temporary"],
          ["308", "308 permanent (keeps method)"],
          ["307", "307 temporary (keeps method)"]
        )
      )
    ],
    howTo: [
      "Export your old URLs and match each one to its closest new page.",
      "Paste them here and pick the server your site runs on.",
      "Add the rules, then test a few old URLs in a browser."
    ],
    faq: [
      {
        q: "301 or 302?",
        a: "Use 301 when the move is permanent, so search engines pass the old page’s signals to the new one. Use 302 only for short, temporary moves."
      },
      {
        q: "Should I redirect everything to the home page?",
        a: "No. Google treats redirects to an unrelated page as soft 404s. Send each old URL to the closest matching new page."
      }
    ],
    related: ["sitemap-generator", "hreflang", "robots-txt"]
  },
  {
    slug: "sitemap-generator",
    category: "generate",
    name: "XML sitemap generator",
    short: "A valid sitemap.xml from a list of URLs.",
    title: "Free XML sitemap generator",
    description:
      "Generate a valid XML sitemap from a list of URLs, with duplicates removed and mixed hosts flagged. Leaves out the tags Google ignores.",
    lead: "Paste your URLs and download a valid sitemap.xml. It leaves out <priority> and <changefreq>, which Google ignores.",
    generate: sitemapXml,
    fields: [
      area(
        "urls",
        "URLs",
        "https://ridgeline.example/\nhttps://ridgeline.example/trail-shoes\nhttps://ridgeline.example/road-shoes\nhttps://ridgeline.example/returns",
        { rows: 7, help: "One full URL per line." }
      ),
      { name: "lastmod", label: "Last modified (optional)", type: "date", value: "" }
    ],
    howTo: [
      "List only pages you want in search results: no redirects, no noindex pages, no duplicates.",
      "Upload the file to your site’s root as sitemap.xml.",
      "Add it to robots.txt and submit it in Google Search Console."
    ],
    faq: [
      {
        q: "Does a sitemap make Google index my pages?",
        a: "No. It helps Google find them. Whether a page is indexed depends on its quality and on whether it’s blocked or marked noindex."
      }
    ],
    related: ["robots-txt", "hreflang", "redirects"]
  },
  {
    slug: "utm-builder",
    category: "generate",
    name: "UTM link builder",
    short: "Campaign links that keep your analytics reports clean.",
    title: "Free UTM link builder",
    description:
      "Build campaign URLs with UTM parameters for Google Analytics, with consistent lowercase values and checks for missing fields.",
    lead: "Tag links from emails, ads and posts so analytics shows where visitors came from. Values are lowercased so reports don’t split.",
    generate: utmLink,
    fields: [
      url("url", "Page URL", "https://ridgeline.example/trail-shoes", { wide: true }),
      text("source", "Source", "newsletter", { help: "Where the link lives: google, newsletter, linkedin." }),
      text("medium", "Medium", "email", { help: "The kind of channel: email, cpc, social." }),
      text("campaign", "Campaign", "autumn trail sale"),
      text("term", "Term (optional)", "", { help: "The paid keyword, for search ads." }),
      text("content", "Content (optional)", "", { help: "Tells two links in the same email apart." }),
      select("spaces", "Replace spaces with", opts(["dash", "Dashes"], ["underscore", "Underscores"]))
    ],
    howTo: [
      "Paste the page you’re linking to.",
      "Fill in source, medium and campaign. They’re all required.",
      "Copy the link and use it in your email, ad or post."
    ],
    faq: [
      {
        q: "Should I use UTM tags on links within my own site?",
        a: "No. Tagging internal links starts a new session in analytics and hides where visitors really came from."
      }
    ],
    related: ["open-graph", "meta-tags", "keyword-density"]
  },
  {
    slug: "word-counter",
    category: "content",
    name: "Word counter",
    short: "Words, sentences, reading time and sentence length.",
    title: "Free word counter with reading time",
    description:
      "Count words, characters, sentences and paragraphs, and see reading time, speaking time and average sentence length for any text.",
    lead: "Paste any text to count it. Nothing leaves your browser.",
    generate: wordCount,
    fields: [area("text", "Text", SAMPLE_TEXT, { rows: 10 })],
    howTo: [
      "Paste your draft or the text of a page.",
      "Check the length and the average sentence length.",
      "Break up sentences over about 20 words."
    ],
    faq: [
      {
        q: "How long should a page be for SEO?",
        a: "As long as it takes to answer the search fully. There is no word count Google rewards. Compare with the pages that already rank for your search."
      }
    ],
    related: ["keyword-density", "serp-preview", "meta-tags"]
  },
  {
    slug: "keyword-density",
    category: "content",
    name: "Keyword density checker",
    short: "Which words and phrases a page repeats, and how often.",
    title: "Free keyword density checker",
    description:
      "See which words and two- and three-word phrases a text repeats most, and how often a target keyword appears, with common stop words filtered out.",
    lead: "Paste a page’s text to see the words and phrases it repeats most. Use it to spot missing topics or stuffing, not to hit a number.",
    generate: keywordDensity,
    fields: [
      area("text", "Text", SAMPLE_TEXT, { rows: 10 }),
      text("keyword", "Target keyword (optional)", "running shoes")
    ],
    howTo: [
      "Paste the visible text of the page.",
      "Add the phrase you want the page to rank for.",
      "Check that it appears naturally and that the page covers the related phrases searchers use."
    ],
    faq: [
      {
        q: "What is a good keyword density?",
        a: "There isn’t one. Google stopped counting keywords long ago. If a phrase makes up more than a few percent of the text, it usually reads as repetitive to people too."
      }
    ],
    related: ["word-counter", "serp-preview", "meta-tags"]
  },
  {
    slug: "disavow",
    category: "generate",
    name: "Disavow file generator",
    short: "A valid disavow.txt for Google Search Console.",
    title: "Free disavow file generator",
    description:
      "Turn a list of spammy links or domains into a valid disavow.txt file for Google Search Console, with duplicates removed and formats checked.",
    lead: "Paste links or domains and get a valid file for Google’s disavow tool. Read the warning first: most sites should never use one.",
    generate: disavow,
    fields: [
      area(
        "entries",
        "Links or domains",
        "spam-links.example\nhttps://paid-directory.example/listing/123\ndomain:cheap-seo.example",
        { rows: 6, help: "One per line. Plain domains become domain: lines." }
      ),
      select("mode", "Full URLs become", opts(["url", "Single URLs"], ["domain", "Whole domains"])),
      text("note", "Comment (optional)", "")
    ],
    howTo: [
      "List links you paid for, or that a Google manual action named.",
      "Choose whether to disavow single URLs or whole domains.",
      "Upload the file in Search Console’s disavow tool for the right property."
    ],
    faq: [
      {
        q: "Should I disavow spammy links I didn’t build?",
        a: "Usually not. Google says it already ignores most spammy links. Disavow is for links you or an agency built against its guidelines, or after a manual action."
      }
    ],
    related: ["redirects", "robots-txt", "sitemap-generator"]
  },
  {
    slug: "seo-checklist",
    category: "plan",
    name: "SEO and AI search checklist",
    short: "The basics in order, with progress saved in your browser.",
    title: "Free SEO and AI search checklist",
    description:
      "A practical SEO checklist for technical SEO, on-page, content and AI search, with progress saved in your browser and the items a free page check can test for you.",
    lead: "Work through the basics in order. Your progress stays in this browser. Items marked “Checked for you” are tested automatically by the free page check.",
    checklist: SEO_CHECKLIST,
    fields: [],
    howTo: [
      "Start with the technical section: if crawlers can’t reach a page, nothing else matters.",
      "Tick items as you finish them.",
      "Run the free page check to test the marked items for you."
    ],
    faq: [{ q: "Where is my progress saved?", a: "In this browser only, using local storage. Nothing is sent to us." }],
    related: ["robots-txt-tester", "meta-tags", "schema"]
  }
];

export const TOOL_PATHS = ["/tools", ...FREE_TOOLS.map((tool) => `/tools/${tool.slug}`)];

export function toolBySlug(slug) {
  return FREE_TOOLS.find((tool) => tool.slug === slug) ?? null;
}

export function defaultValues(tool) {
  return Object.fromEntries(tool.fields.map((field) => [field.name, field.value ?? ""]));
}

export function isFieldVisible(field, values) {
  if (!field.showWhen) return true;
  return field.showWhen.values.includes(values[field.showWhen.field]);
}
