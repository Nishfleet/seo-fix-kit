// Pure generators behind the free tools at /tools/*. Every function takes the
// tool's form values (strings and booleans, exactly as the form holds them)
// and returns { code, language, filename, notes, preview }:
//   code      the text the visitor copies or downloads ("" when there is none)
//   notes     problems found in the input: { level: "error" | "warn" | "info", text }
//   preview   optional structured data the page draws (SERP card, table, ...)
// No network, no DOM: the same code runs in the browser (bundled to /tools.js)
// and in the Worker, which renders each page with its default values so the
// tools read without JavaScript.

const AVERAGE_WPM_READING = 238;
const AVERAGE_WPM_SPEAKING = 150;

// Google truncates by rendered width, not characters. These are the widely
// measured desktop limits; the page says they are approximate.
export const SERP_LIMITS = {
  titlePx: 600,
  descriptionPxDesktop: 920,
  descriptionPxMobile: 680,
  titleFont: "20px Arial",
  descriptionFont: "14px Arial"
};

// Arial advance widths at 1px (from the font's hmtx table, rounded). Used when
// no canvas is available (tests, Worker render); the browser measures for real.
const ARIAL_WIDTHS = {
  " ": 0.278,
  "!": 0.278,
  '"': 0.355,
  "#": 0.556,
  $: 0.556,
  "%": 0.889,
  "&": 0.667,
  "'": 0.191,
  "(": 0.333,
  ")": 0.333,
  "*": 0.389,
  "+": 0.584,
  ",": 0.278,
  "-": 0.333,
  ".": 0.278,
  "/": 0.278,
  ":": 0.278,
  ";": 0.278,
  "<": 0.584,
  "=": 0.584,
  ">": 0.584,
  "?": 0.556,
  "@": 1.015,
  "[": 0.278,
  "\\": 0.278,
  "]": 0.278,
  "^": 0.469,
  _: 0.556,
  "`": 0.333,
  "{": 0.334,
  "|": 0.26,
  "}": 0.334,
  "~": 0.584,
  A: 0.667,
  B: 0.667,
  C: 0.722,
  D: 0.722,
  E: 0.667,
  F: 0.611,
  G: 0.778,
  H: 0.722,
  I: 0.278,
  J: 0.5,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  Q: 0.778,
  R: 0.722,
  S: 0.667,
  T: 0.611,
  U: 0.722,
  V: 0.667,
  W: 0.944,
  X: 0.667,
  Y: 0.667,
  Z: 0.611,
  a: 0.556,
  b: 0.556,
  c: 0.5,
  d: 0.556,
  e: 0.556,
  f: 0.278,
  g: 0.556,
  h: 0.556,
  i: 0.222,
  j: 0.222,
  k: 0.5,
  l: 0.222,
  m: 0.833,
  n: 0.556,
  o: 0.556,
  p: 0.556,
  q: 0.556,
  r: 0.333,
  s: 0.5,
  t: 0.278,
  u: 0.556,
  v: 0.5,
  w: 0.722,
  x: 0.5,
  y: 0.5,
  z: 0.5
};

export function estimateTextWidth(text, font = SERP_LIMITS.titleFont) {
  const size = Number.parseFloat(font) || 16;
  let width = 0;
  for (const char of String(text)) width += (/\d/.test(char) ? 0.556 : (ARIAL_WIDTHS[char] ?? 0.6)) * size;
  return Math.round(width);
}

// Cut text to fit maxPx the way Google does: at a word boundary, with an ellipsis.
export function truncateToWidth(text, maxPx, font, measure = estimateTextWidth) {
  const value = String(text).trim();
  if (measure(value, font) <= maxPx) return { text: value, truncated: false };
  const words = value.split(/\s+/);
  let fitted = "";
  for (const word of words) {
    const next = fitted ? `${fitted} ${word}` : word;
    if (measure(`${next} ...`, font) > maxPx) break;
    fitted = next;
  }
  return { text: `${fitted || value.slice(0, 8)} ...`, truncated: true };
}

// --- small helpers -----------------------------------------------------------

const clean = (value) => String(value ?? "").trim();

export function lines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXml(value) {
  return escapeAttr(value).replace(/'/g, "&apos;");
}

export function isAbsoluteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function result({ code = "", language = "text", filename = "", notes = [], preview = null }) {
  return { code, language, filename, notes, preview };
}

const warn = (text) => ({ level: "warn", text });
const error = (text) => ({ level: "error", text });
const info = (text) => ({ level: "info", text });

function lengthNotes(label, value, { min, max }) {
  const length = clean(value).length;
  if (!length) return [error(`Add a ${label}.`)];
  if (length > max)
    return [warn(`The ${label} is ${length} characters. Over ${max} usually gets cut off in search results.`)];
  if (length < min) return [warn(`The ${label} is ${length} characters. Under ${min} wastes space you could use.`)];
  return [];
}

function urlNote(label, value) {
  const url = clean(value);
  if (url && !isAbsoluteUrl(url)) return [error(`The ${label} must be a full address starting with https://.`)];
  return [];
}

// --- Meta tags ---------------------------------------------------------------

export function metaTags(values) {
  const title = clean(values.title);
  const description = clean(values.description);
  const url = clean(values.url);
  const image = clean(values.image);
  const siteName = clean(values.siteName);
  const twitter = clean(values.twitterHandle).replace(/^@?/, "@");
  const robots = clean(values.robots) || "index, follow";
  const head = [
    `<title>${escapeAttr(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta name="robots" content="${escapeAttr(robots)}" />`,
    url && `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`
  ];
  const social = [
    `<meta property="og:type" content="${escapeAttr(clean(values.type) || "website")}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    url && `<meta property="og:url" content="${escapeAttr(url)}" />`,
    siteName && `<meta property="og:site_name" content="${escapeAttr(siteName)}" />`,
    image && `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    twitter.length > 1 && `<meta name="twitter:site" content="${escapeAttr(twitter)}" />`
  ];
  const code = [head, social].map((group) => group.filter(Boolean).join("\n")).join("\n\n");
  const notes = [
    ...lengthNotes("title", title, { min: 30, max: 60 }),
    ...lengthNotes("description", description, { min: 70, max: 160 }),
    ...urlNote("canonical URL", url),
    ...urlNote("image URL", image)
  ];
  if (!url) notes.push(warn("Add the page's canonical URL so search engines know which address to index."));
  if (!image) notes.push(info("Add a share image (1200 × 630 px) so links look good on social apps and chat."));
  if (robots.includes("noindex")) notes.push(warn("noindex keeps this page out of Google. Use it only on purpose."));
  return result({
    code,
    language: "html",
    filename: "meta-tags.html",
    notes,
    preview: { kind: "serp", title, description, url }
  });
}

// --- SERP preview ------------------------------------------------------------

export function serpPreview(values, measure = estimateTextWidth) {
  const title = clean(values.title);
  const description = clean(values.description);
  const url = clean(values.url);
  const titleWidth = measure(title, SERP_LIMITS.titleFont);
  const descriptionWidth = measure(description, SERP_LIMITS.descriptionFont);
  const notes = [];
  if (!title) notes.push(error("Add a title."));
  else if (titleWidth > SERP_LIMITS.titlePx)
    notes.push(
      warn(
        `The title is about ${titleWidth}px wide. Google shows roughly ${SERP_LIMITS.titlePx}px on desktop, so the end will be cut.`
      )
    );
  if (!description) notes.push(warn("Without a description, Google picks text from the page itself."));
  else if (descriptionWidth > SERP_LIMITS.descriptionPxDesktop)
    notes.push(
      warn(
        `The description is about ${descriptionWidth}px wide. Desktop shows roughly ${SERP_LIMITS.descriptionPxDesktop}px.`
      )
    );
  else if (descriptionWidth > SERP_LIMITS.descriptionPxMobile)
    notes.push(
      info(
        `The description fits on desktop but phones show roughly ${SERP_LIMITS.descriptionPxMobile}px, so the end may be cut there.`
      )
    );
  notes.push(...urlNote("page URL", url));
  return result({
    notes,
    preview: {
      kind: "serp",
      title,
      description,
      url,
      measurements: [
        { label: "Title", value: `${title.length} characters · ~${titleWidth}px of ${SERP_LIMITS.titlePx}px` },
        {
          label: "Description",
          value: `${description.length} characters · ~${descriptionWidth}px of ${SERP_LIMITS.descriptionPxDesktop}px`
        }
      ]
    }
  });
}

// --- Open Graph --------------------------------------------------------------

export function openGraph(values) {
  const title = clean(values.title);
  const description = clean(values.description);
  const url = clean(values.url);
  const image = clean(values.image);
  const imageAlt = clean(values.imageAlt);
  const card = clean(values.twitterCard) || "summary_large_image";
  const twitter = clean(values.twitterSite).replace(/^@?/, "@");
  const tags = [
    `<meta property="og:type" content="${escapeAttr(clean(values.type) || "website")}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    description && `<meta property="og:description" content="${escapeAttr(description)}" />`,
    url && `<meta property="og:url" content="${escapeAttr(url)}" />`,
    clean(values.siteName) && `<meta property="og:site_name" content="${escapeAttr(clean(values.siteName))}" />`,
    clean(values.locale) && `<meta property="og:locale" content="${escapeAttr(clean(values.locale))}" />`,
    image && `<meta property="og:image" content="${escapeAttr(image)}" />`,
    image && imageAlt && `<meta property="og:image:alt" content="${escapeAttr(imageAlt)}" />`,
    `<meta name="twitter:card" content="${escapeAttr(card)}" />`,
    twitter.length > 1 && `<meta name="twitter:site" content="${escapeAttr(twitter)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    description && `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    image && `<meta name="twitter:image" content="${escapeAttr(image)}" />`
  ].filter(Boolean);
  const notes = [];
  if (!title) notes.push(error("Add a title."));
  else if (title.length > 70)
    notes.push(warn(`The title is ${title.length} characters. Most apps cut it around 60 to 70.`));
  if (!image) notes.push(warn("Add an image. Links without one show as a small grey card on most apps."));
  if (image && !imageAlt) notes.push(info("Add image alt text for people using screen readers."));
  notes.push(...urlNote("page URL", url), ...urlNote("image URL", image));
  if (!url) notes.push(warn("Add og:url so shares of different addresses count as one page."));
  return result({
    code: tags.join("\n"),
    language: "html",
    filename: "open-graph.html",
    notes,
    preview: { kind: "social", title, description, url, image, large: card === "summary_large_image" }
  });
}

// --- Schema (JSON-LD) ----------------------------------------------------------

export const SCHEMA_TYPES = [
  { value: "Organization", label: "Organization" },
  { value: "LocalBusiness", label: "Local business" },
  { value: "Article", label: "Article / blog post" },
  { value: "Product", label: "Product" },
  { value: "FAQPage", label: "FAQ page" },
  { value: "BreadcrumbList", label: "Breadcrumbs" },
  { value: "Event", label: "Event" },
  { value: "Person", label: "Person" },
  { value: "SoftwareApplication", label: "Software app" },
  { value: "WebSite", label: "Website (site name)" }
];

function splitPair(line) {
  const index = line.indexOf("|");
  return index === -1 ? [line.trim(), ""] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

// FAQ text: a question line ending in "?" starts an entry; the lines after it are the answer.
export function parseFaq(text) {
  const entries = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith("?") || !entries.length) entries.push({ q: trimmed, a: "" });
    else entries.at(-1).a = `${entries.at(-1).a} ${trimmed}`.trim();
  }
  return entries;
}

function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === "" || value === undefined || value === null) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const inner = compact(value);
      if (Object.keys(inner).filter((k) => k !== "@type").length) out[key] = inner;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function postalAddress(values) {
  return {
    "@type": "PostalAddress",
    streetAddress: clean(values.street),
    addressLocality: clean(values.city),
    addressRegion: clean(values.region),
    postalCode: clean(values.postalCode),
    addressCountry: clean(values.country)
  };
}

export function schemaMarkup(values) {
  const type = clean(values.schemaType) || "Organization";
  const name = clean(values.name);
  const url = clean(values.url);
  const image = clean(values.image);
  const description = clean(values.description);
  const sameAs = lines(values.sameAs);
  const notes = [];
  let data;
  const need = (label, value) => {
    if (!clean(value)) notes.push(error(`${type} needs ${label} for Google to use it.`));
  };
  switch (type) {
    case "LocalBusiness":
      data = {
        "@type": clean(values.businessType) || "LocalBusiness",
        name,
        url,
        image,
        description,
        telephone: clean(values.phone),
        priceRange: clean(values.priceRange),
        address: postalAddress(values),
        sameAs
      };
      need("a name", name);
      need("a street address", values.street);
      break;
    case "Article":
      data = {
        "@type": "Article",
        headline: name,
        description,
        image: image ? [image] : [],
        datePublished: clean(values.datePublished),
        dateModified: clean(values.dateModified),
        author: clean(values.author)
          ? { "@type": "Person", name: clean(values.author), url: clean(values.authorUrl) }
          : null,
        publisher: clean(values.publisher) ? { "@type": "Organization", name: clean(values.publisher) } : null,
        mainEntityOfPage: url
      };
      need("a headline", name);
      if (name.length > 110) notes.push(warn("Keep the headline under 110 characters."));
      if (!image) notes.push(warn("Google recommends an image for articles."));
      if (!clean(values.datePublished)) notes.push(warn("Add the publish date."));
      break;
    case "Product": {
      const price = clean(values.price);
      data = {
        "@type": "Product",
        name,
        description,
        image: image ? [image] : [],
        sku: clean(values.sku),
        brand: clean(values.brand) ? { "@type": "Brand", name: clean(values.brand) } : null,
        offers: price
          ? {
              "@type": "Offer",
              url,
              price,
              priceCurrency: clean(values.currency).toUpperCase() || "USD",
              availability: `https://schema.org/${clean(values.availability) || "InStock"}`
            }
          : null
      };
      need("a name", name);
      if (!price) notes.push(error("Product rich results need a price (or reviews or a rating)."));
      if (price && !/^\d+(\.\d+)?$/.test(price)) notes.push(error("Write the price as a plain number, like 49.00."));
      if (!image) notes.push(warn("Google recommends a product image."));
      break;
    }
    case "FAQPage": {
      const faq = parseFaq(values.faq);
      data = {
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a }
        }))
      };
      if (!faq.length) notes.push(error("Add at least one question and answer."));
      for (const { q, a } of faq) if (!a) notes.push(error(`"${q}" has no answer.`));
      notes.push(
        info(
          "Since 2023 Google shows FAQ rich results only for well-known government and health sites. The markup still helps other engines read your answers."
        )
      );
      break;
    }
    case "BreadcrumbList": {
      const crumbs = lines(values.breadcrumbs).map(splitPair);
      data = {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map(([crumbName, item], index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumbName,
          item: item || undefined
        }))
      };
      if (crumbs.length < 2) notes.push(warn("Breadcrumbs usually have at least two levels."));
      crumbs.forEach(([crumbName, item], index) => {
        if (index < crumbs.length - 1 && !item)
          notes.push(error(`"${crumbName}" needs a URL (only the last level may skip it).`));
        if (item && !isAbsoluteUrl(item)) notes.push(error(`"${item}" must be a full URL.`));
      });
      break;
    }
    case "Event": {
      const online = values.eventMode === "online";
      data = {
        "@type": "Event",
        name,
        description,
        image: image ? [image] : [],
        startDate: clean(values.startDate),
        endDate: clean(values.endDate),
        eventAttendanceMode: `https://schema.org/${online ? "OnlineEventAttendanceMode" : "OfflineEventAttendanceMode"}`,
        eventStatus: "https://schema.org/EventScheduled",
        location: online
          ? { "@type": "VirtualLocation", url }
          : { "@type": "Place", name: clean(values.venue), address: postalAddress(values) },
        organizer: clean(values.publisher) ? { "@type": "Organization", name: clean(values.publisher) } : null
      };
      need("a name", name);
      need("a start date", values.startDate);
      if (!online) need("a venue name", values.venue);
      break;
    }
    case "Person":
      data = { "@type": "Person", name, url, image, jobTitle: clean(values.jobTitle), description, sameAs };
      need("a name", name);
      break;
    case "SoftwareApplication": {
      const price = clean(values.price);
      data = {
        "@type": "SoftwareApplication",
        name,
        description,
        url,
        applicationCategory: clean(values.appCategory) || "BusinessApplication",
        operatingSystem: clean(values.operatingSystem) || "Web",
        offers: { "@type": "Offer", price: price || "0", priceCurrency: clean(values.currency).toUpperCase() || "USD" }
      };
      need("a name", name);
      notes.push(
        info("Google shows software rich results only with a rating or reviews. Add them only if they are real.")
      );
      break;
    }
    case "WebSite":
      data = { "@type": "WebSite", name, alternateName: clean(values.alternateName), url };
      need("a name", name);
      need("the home page URL", url);
      break;
    default:
      data = {
        "@type": "Organization",
        name,
        url,
        logo: image,
        description,
        email: clean(values.email),
        telephone: clean(values.phone),
        sameAs
      };
      need("a name", name);
      if (!url) notes.push(warn("Add the home page URL."));
  }
  for (const [label, value] of [
    ["URL", url],
    ["image URL", image]
  ])
    notes.push(...urlNote(label, value));
  for (const link of sameAs) if (!isAbsoluteUrl(link)) notes.push(error(`Profile link "${link}" must be a full URL.`));
  for (const key of ["datePublished", "dateModified", "startDate", "endDate"]) {
    const value = clean(values[key]);
    if (value && Number.isNaN(Date.parse(value)))
      notes.push(error(`"${value}" is not a date. Use the format 2026-10-13.`));
  }
  const json = JSON.stringify({ "@context": "https://schema.org", ...compact(data) }, null, 2).replace(/</g, "\\u003c");
  return result({
    code: `<script type="application/ld+json">\n${json}\n</script>`,
    language: "html",
    filename: `${type.toLowerCase()}-schema.html`,
    notes
  });
}

// --- robots.txt --------------------------------------------------------------

// Crawlers that fetch pages to answer a person's question or to build an AI
// search index. Blocking them can keep your pages out of AI answers.
export const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User"
];
// Crawlers (or opt-out tokens) that collect pages to train AI models.
export const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "Bytespider"
];

export function robotsTxt(values) {
  const disallow = lines(values.disallow);
  const allow = lines(values.allow);
  const sitemaps = lines(values.sitemaps);
  const blockAll = values.access === "block";
  const groups = [];
  const main = ["User-agent: *"];
  if (blockAll) main.push("Disallow: /");
  else {
    for (const path of allow) main.push(`Allow: ${path}`);
    for (const path of disallow) main.push(`Disallow: ${path}`);
    if (!allow.length && !disallow.length) main.push("Disallow:");
  }
  groups.push(main.join("\n"));
  const blocked = [
    ...(values.aiSearch === "block" ? AI_SEARCH_BOTS : []),
    ...(values.aiTraining === "block" ? AI_TRAINING_BOTS : []),
    ...lines(values.customBlocked)
  ];
  if (blocked.length)
    groups.push(`${[...new Set(blocked)].map((bot) => `User-agent: ${bot}`).join("\n")}\nDisallow: /`);
  const notes = [];
  if (blockAll) notes.push(error("This blocks every search engine from the whole site. Use it only on staging sites."));
  for (const path of [...allow, ...disallow]) {
    if (!path.startsWith("/") && !path.startsWith("*"))
      notes.push(error(`"${path}" must start with / (paths are relative to the site root).`));
  }
  for (const sitemap of sitemaps)
    if (!isAbsoluteUrl(sitemap)) notes.push(error(`Sitemap "${sitemap}" must be a full URL.`));
  if (!sitemaps.length) notes.push(info("Add your sitemap URL so crawlers find every page."));
  if (values.aiSearch === "block")
    notes.push(warn("Blocking AI search crawlers can keep your pages out of ChatGPT, Claude and Perplexity answers."));
  if (disallow.some((path) => /\.(css|js)$|\/(assets|static|_next)\//.test(path)))
    notes.push(warn("Blocking CSS or JavaScript stops Google from rendering your pages properly."));
  notes.push(
    info("robots.txt is public and only a request. It does not hide pages. Use noindex or a password for that.")
  );
  const footer = sitemaps.map((sitemap) => `Sitemap: ${sitemap}`).join("\n");
  return result({
    code: `${groups.join("\n\n")}${footer ? `\n\n${footer}` : ""}\n`,
    language: "text",
    filename: "robots.txt",
    notes
  });
}

// --- robots.txt tester (Google's rules: RFC 9309) -----------------------------

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ type: field, path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath, path) {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

export function robotsTest(values) {
  const groups = parseRobots(values.robots);
  const agent = clean(values.userAgent) || "Googlebot";
  let path = clean(values.path) || "/";
  try {
    if (isAbsoluteUrl(path)) {
      const url = new URL(path);
      path = `${url.pathname}${url.search}`;
    }
  } catch {
    // keep the raw path
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const token = agent.toLowerCase();
  // The group whose user-agent is the longest one contained in the crawler's
  // token wins; groups naming the same agent are merged; "*" is the fallback.
  let best = 0;
  let rules = [];
  let matchedAgent = "";
  for (const group of groups) {
    for (const name of group.agents) {
      if (name !== "*" && token.includes(name) && name.length >= best) {
        if (name.length > best) rules = [];
        best = name.length;
        rules.push(...group.rules);
        matchedAgent = name;
      }
    }
  }
  if (!best) {
    for (const group of groups) if (group.agents.includes("*")) rules.push(...group.rules);
    matchedAgent = rules.length || groups.some((g) => g.agents.includes("*")) ? "*" : "";
  }
  let winner = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!winner || length > winner.path.length || (length === winner.path.length && rule.type === "allow"))
      winner = rule;
  }
  const allowed = !winner || winner.type === "allow";
  const notes = [];
  if (!groups.length)
    notes.push(info("No rules found, so everything is allowed. Paste the contents of your robots.txt."));
  if (!matchedAgent && groups.length) notes.push(info(`No group applies to ${agent}, so it may crawl everything.`));
  return result({
    notes,
    preview: {
      kind: "verdict",
      ok: allowed,
      headline: allowed ? `Allowed: ${agent} may crawl ${path}` : `Blocked: ${agent} may not crawl ${path}`,
      details: [
        { label: "Group used", value: matchedAgent ? `User-agent: ${matchedAgent}` : "None (no group applies)" },
        {
          label: "Deciding rule",
          value: winner ? `${winner.type === "allow" ? "Allow" : "Disallow"}: ${winner.path}` : "None matched"
        }
      ]
    }
  });
}

// --- llms.txt ----------------------------------------------------------------

export function llmsTxt(values) {
  const name = clean(values.siteName);
  const summary = clean(values.summary).replace(/\s+/g, " ");
  const details = clean(values.details);
  const out = [`# ${name || "Your site"}`, ""];
  if (summary) out.push(`> ${summary}`, "");
  if (details) out.push(details, "");
  const notes = [];
  let section = null;
  let linkCount = 0;
  for (const line of String(values.links ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)) {
    if (line.startsWith("##")) {
      section = line.replace(/^#+\s*/, "");
      out.push(`## ${section}`, "");
      continue;
    }
    if (!section) {
      section = "Docs";
      out.push("## Docs", "");
    }
    const [title, rest] = splitPair(line);
    const [url, note] = splitPair(rest);
    if (!isAbsoluteUrl(url))
      notes.push(error(`"${title}" needs a full URL, like "${title} | https://example.com/page".`));
    out.push(`- [${title}](${url})${note ? `: ${note}` : ""}`);
    linkCount += 1;
  }
  if (!name) notes.push(error("Add the site name. It becomes the file's only H1."));
  if (!summary) notes.push(warn("Add a one-line summary. Tools read it first."));
  if (!linkCount) notes.push(warn("Add the pages that matter most, one per line."));
  notes.push(
    info(
      "llms.txt is a proposed standard (llmstxt.org). No major AI search engine has said it reads it yet, so treat it as cheap insurance, not a ranking lever."
    )
  );
  return result({ code: `${out.join("\n").trim()}\n`, language: "markdown", filename: "llms.txt", notes });
}

// --- hreflang ----------------------------------------------------------------

const HREFLANG_PATTERN = /^(x-default|[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?)$/;

export function normalizeHreflang(code) {
  const parts = clean(code).split(/[-_]/);
  if (parts[0].toLowerCase() === "x" && parts[1]?.toLowerCase() === "default") return "x-default";
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part.toUpperCase();
    })
    .join("-");
}

export function hreflang(values) {
  const entries = lines(values.entries).map((line) => {
    const [code, url] = splitPair(line);
    return { code: normalizeHreflang(code), url };
  });
  const xDefault = clean(values.xDefault);
  if (xDefault) entries.push({ code: "x-default", url: xDefault });
  const notes = [];
  const seen = new Set();
  for (const { code, url } of entries) {
    if (!HREFLANG_PATTERN.test(code))
      notes.push(
        error(`"${code}" is not a valid language code. Use a language, optionally with a region, like en or en-GB.`)
      );
    if (/^[a-z]{2}-(UK)$/.test(code))
      notes.push(
        error(`"${code}" should be ${code.replace("UK", "GB")}. The region code for the United Kingdom is GB.`)
      );
    if (!isAbsoluteUrl(url)) notes.push(error(`The URL for ${code} must be a full address.`));
    if (seen.has(code)) notes.push(error(`${code} is listed twice. Each language needs exactly one URL.`));
    seen.add(code);
  }
  if (entries.length && !seen.has("x-default"))
    notes.push(info("Add an x-default URL for visitors whose language you don't serve."));
  if (entries.length < 2) notes.push(warn("hreflang needs at least two language versions."));
  notes.push(info("Every version must list all the others and itself. Paste the same block on each page."));
  const format = values.format || "html";
  let code;
  if (format === "header") {
    code = `Link: ${entries.map(({ code: lang, url }) => `<${url}>; rel="alternate"; hreflang="${lang}"`).join(",\n      ")}`;
  } else if (format === "sitemap") {
    const links = entries.map(
      ({ code: lang, url }) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(url)}" />`
    );
    const urls = entries
      .filter(({ code: lang }) => lang !== "x-default")
      .map(({ url }) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n${links.join("\n")}\n  </url>`);
    code = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>`;
  } else {
    code = entries
      .map(({ code: lang, url }) => `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(url)}" />`)
      .join("\n");
  }
  const filename =
    format === "sitemap" ? "sitemap-hreflang.xml" : format === "header" ? "hreflang-header.txt" : "hreflang.html";
  return result({
    code,
    language: format === "header" ? "text" : format === "sitemap" ? "xml" : "html",
    filename,
    notes
  });
}

// --- Redirects ---------------------------------------------------------------

function redirectPath(value) {
  if (isAbsoluteUrl(value)) {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  }
  return value;
}

export function parseRedirects(text, defaultStatus = "301") {
  return lines(text).map((line) => {
    const parts = line.split(/\s+|,|\t/).filter(Boolean);
    const status = parts[2] && /^30[1278]$/.test(parts[2]) ? parts[2] : defaultStatus;
    return { from: redirectPath(parts[0] || ""), to: parts[1] || "", status };
  });
}

export function redirects(values) {
  const rules = parseRedirects(values.rules, values.status || "301");
  const platform = values.platform || "apache";
  const notes = [];
  const sources = new Map(rules.map((rule) => [rule.from, rule.to]));
  const seen = new Set();
  for (const rule of rules) {
    if (!rule.to) notes.push(error(`"${rule.from}" has no destination. Write: /old-page /new-page`));
    if (!rule.from.startsWith("/")) notes.push(error(`"${rule.from}" must be a path like /old-page.`));
    if (seen.has(rule.from)) notes.push(error(`${rule.from} is redirected twice. Only the first rule will run.`));
    seen.add(rule.from);
    const target = redirectPath(rule.to);
    if (target === rule.from) notes.push(error(`${rule.from} redirects to itself.`));
    else if (sources.has(target)) {
      // follow the chain to see whether it loops
      const hops = [rule.from];
      let next = target;
      while (sources.has(next) && !hops.includes(next) && hops.length < 20) {
        hops.push(next);
        next = redirectPath(sources.get(next));
      }
      if (hops.includes(next)) notes.push(error(`Redirect loop: ${[...hops, next].join(" → ")}.`));
      else notes.push(warn(`Chain: ${[...hops, next].join(" → ")}. Point ${rule.from} straight at ${next}.`));
    }
  }
  if (!rules.length) notes.push(info("Add one redirect per line: /old-page /new-page"));
  const valid = rules.filter((rule) => rule.from && rule.to);
  let code;
  let filename;
  let language = "text";
  const regexEscape = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  switch (platform) {
    case "nginx":
      code = valid.map((r) => `location = ${r.from} { return ${r.status} ${r.to}; }`).join("\n");
      filename = "redirects.nginx.conf";
      break;
    case "netlify":
      code = valid.map((r) => `${r.from}  ${r.to}  ${r.status}`).join("\n");
      filename = "_redirects";
      break;
    case "vercel":
      code = JSON.stringify(
        {
          redirects: valid.map((r) => ({
            source: r.from,
            destination: r.to,
            permanent: r.status === "301" || r.status === "308"
          }))
        },
        null,
        2
      );
      filename = "vercel.json";
      language = "json";
      break;
    case "nextjs":
      code = `// next.config.js\nmodule.exports = {\n  async redirects() {\n    return ${JSON.stringify(
        valid.map((r) => ({ source: r.from, destination: r.to, permanent: r.status === "301" || r.status === "308" })),
        null,
        2
      ).replace(/\n/g, "\n    ")};\n  }\n};`;
      filename = "next.config.js";
      language = "javascript";
      break;
    default:
      code = `RewriteEngine On\n${valid
        .map((r) => {
          const [path, query] = r.from.split("?");
          return `${query ? `RewriteCond %{QUERY_STRING} ^${regexEscape(query)}$\n` : ""}RewriteRule ^${regexEscape(path.replace(/^\//, ""))}$ ${r.to}${query ? "?" : ""} [R=${r.status},L]`;
        })
        .join("\n")}`;
      filename = ".htaccess";
  }
  return result({ code, language, filename, notes });
}

// --- XML sitemap -------------------------------------------------------------

export function sitemapXml(values) {
  const urls = lines(values.urls);
  const lastmod = clean(values.lastmod);
  const notes = [];
  const unique = [...new Set(urls)];
  if (unique.length < urls.length) notes.push(warn(`Removed ${urls.length - unique.length} duplicate URL(s).`));
  const hosts = new Set();
  for (const url of unique) {
    if (!isAbsoluteUrl(url)) notes.push(error(`"${url}" must be a full URL.`));
    else hosts.add(new URL(url).host);
  }
  if (hosts.size > 1)
    notes.push(
      error(
        `URLs come from ${hosts.size} hosts (${[...hosts].join(", ")}). A sitemap may only list URLs from its own host.`
      )
    );
  if (unique.length > 50000)
    notes.push(error("A sitemap holds at most 50,000 URLs. Split it and add a sitemap index."));
  if (lastmod && Number.isNaN(Date.parse(lastmod)))
    notes.push(error("The last-modified date must look like 2026-10-13."));
  if (!unique.length) notes.push(info("Paste your page URLs, one per line."));
  notes.push(
    info(
      "Google ignores <priority> and <changefreq>, so this file leaves them out. An accurate <lastmod> is what it uses."
    )
  );
  const entries = unique.map(
    (url) =>
      `  <url>\n    <loc>${escapeXml(url)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}\n  </url>`
  );
  return result({
    code: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
    language: "xml",
    filename: "sitemap.xml",
    notes
  });
}

// --- UTM builder -------------------------------------------------------------

export function utmLink(values) {
  const base = clean(values.url);
  const notes = [];
  const params = [
    ["utm_source", values.source],
    ["utm_medium", values.medium],
    ["utm_campaign", values.campaign],
    ["utm_term", values.term],
    ["utm_content", values.content]
  ].map(([key, value]) => [key, values.lowercase === false ? clean(value) : clean(value).toLowerCase()]);
  if (!isAbsoluteUrl(base)) {
    notes.push(error("Add the full page address, starting with https://."));
    return result({ notes });
  }
  const url = new URL(base);
  for (const [key, value] of params) {
    if (url.searchParams.has(key)) notes.push(warn(`The address already had ${key}. It was replaced.`));
    if (value) url.searchParams.set(key, value.replace(/\s+/g, values.spaces === "underscore" ? "_" : "-"));
    else url.searchParams.delete(key);
  }
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    if (!params.find(([name]) => name === key)[1])
      notes.push(error(`Add ${key.replace("utm_", "the ")}. Analytics needs source, medium and campaign.`));
  }
  if (params.some(([, value]) => /[A-Z]/.test(value)))
    notes.push(info("Analytics treats Email and email as different sources. Lowercase keeps reports clean."));
  notes.push(
    info(
      "Use UTM links only on links from other sites, ads and emails. Tagging your own internal links splits your traffic data."
    )
  );
  return result({ code: url.toString(), language: "text", filename: "", notes });
}

// --- Text statistics -----------------------------------------------------------

const STOP_WORDS = new Set(
  "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also get got may might must shall us via per s t don't it's i'm you're we're they're isn't aren't wasn't can't won't".split(
    " "
  )
);

export function words(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .replace(/[’]/g, "'")
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
  );
}

function minutes(count, wpm) {
  const total = count / wpm;
  if (total < 1) return count ? "under 1 min" : "0 min";
  return `${Math.round(total)} min`;
}

export function wordCount(values) {
  const text = String(values.text ?? "");
  const list = words(text);
  const sentences = (text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/gm) ?? []).filter((s) => s.trim()).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const longest = list.reduce((max, word) => (word.length > max.length ? word : max), "");
  const average = sentences ? (list.length / sentences).toFixed(1) : "0";
  const notes = [];
  if (list.length && sentences && list.length / sentences > 25)
    notes.push(warn(`Sentences average ${average} words. Under 20 reads more easily.`));
  if (list.length && list.length < 300)
    notes.push(
      info("Pages under about 300 words often struggle to answer a search fully. Length alone does not rank, though.")
    );
  return result({
    notes,
    preview: {
      kind: "stats",
      rows: [
        { label: "Words", value: list.length.toLocaleString("en-US") },
        { label: "Characters", value: text.length.toLocaleString("en-US") },
        { label: "Characters without spaces", value: text.replace(/\s/g, "").length.toLocaleString("en-US") },
        { label: "Sentences", value: String(sentences) },
        { label: "Paragraphs", value: String(paragraphs) },
        { label: "Words per sentence", value: average },
        { label: "Reading time", value: minutes(list.length, AVERAGE_WPM_READING) },
        { label: "Speaking time", value: minutes(list.length, AVERAGE_WPM_SPEAKING) },
        { label: "Longest word", value: longest || "–" }
      ]
    }
  });
}

export function keywordDensity(values) {
  const list = words(values.text);
  const total = list.length;
  const notes = [];
  const count = (size) => {
    const counts = new Map();
    for (let i = 0; i + size <= list.length; i += 1) {
      const gram = list.slice(i, i + size);
      if (STOP_WORDS.has(gram[0]) || STOP_WORDS.has(gram.at(-1)) || gram.every((w) => /^\d+$/.test(w))) continue;
      const key = gram.join(" ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => size === 1 || n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([phrase, n]) => ({
        phrase,
        count: n,
        density: total ? `${((n * size * 100) / total).toFixed(1)}%` : "0%"
      }));
  };
  const target = clean(values.keyword).toLowerCase();
  const tables = [
    { title: "Single words", rows: count(1) },
    { title: "Two-word phrases", rows: count(2) },
    { title: "Three-word phrases", rows: count(3) }
  ];
  let summary = null;
  if (target) {
    const targetWords = words(target);
    let hits = 0;
    for (let i = 0; i + targetWords.length <= list.length; i += 1) {
      if (targetWords.every((w, j) => list[i + j] === w)) hits += 1;
    }
    const density = total ? (hits * targetWords.length * 100) / total : 0;
    summary = `"${target}" appears ${hits} time${hits === 1 ? "" : "s"} (${density.toFixed(1)}% of ${total} words).`;
    if (!hits)
      notes.push(
        warn(`"${target}" never appears. Use it, or the words people really search, where it reads naturally.`)
      );
    else if (density > 3)
      notes.push(
        warn(`"${target}" makes up ${density.toFixed(1)}% of the text. Above about 3% often reads as stuffed.`)
      );
  }
  if (!total) notes.push(info("Paste the text of a page to see which words and phrases it repeats."));
  notes.push(
    info(
      "There is no ideal density. Google ranks pages that answer the search well, not pages that repeat a word a set number of times."
    )
  );
  return result({ notes, preview: { kind: "tables", summary, tables, total } });
}

// --- Disavow -----------------------------------------------------------------

export function disavow(values) {
  const notes = [];
  const out = [];
  const seen = new Set();
  for (const line of lines(values.entries)) {
    let entry = line;
    if (/^domain:/i.test(entry))
      entry = `domain:${entry
        .slice(7)
        .trim()
        .toLowerCase()
        .replace(/^www\./, "")}`;
    else if (values.mode === "domain" && !isAbsoluteUrl(entry) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(entry))
      entry = `domain:${entry.toLowerCase().replace(/^www\./, "")}`;
    else if (values.mode === "domain" && isAbsoluteUrl(entry))
      entry = `domain:${new URL(entry).hostname.replace(/^www\./, "")}`;
    else if (!isAbsoluteUrl(entry)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(entry)) entry = `domain:${entry.toLowerCase().replace(/^www\./, "")}`;
      else {
        notes.push(error(`"${line}" is neither a full URL nor a domain.`));
        continue;
      }
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  const comment = clean(values.note);
  notes.push(
    warn(
      "Google says most sites never need a disavow file and it can hurt if used wrongly. Use it only for links you were paid for or warned about."
    )
  );
  return result({
    code: `${comment ? `# ${comment.replace(/\n/g, " ")}\n` : ""}${out.join("\n")}\n`,
    language: "text",
    filename: "disavow.txt",
    notes
  });
}
