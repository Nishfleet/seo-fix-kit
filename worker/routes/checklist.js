// Public Proof-First Technical SEO Checklist. No signup. CSV download is the
// same working list as the page so people can track Pass/Fail/NA offline.
import { escapeHtml } from "../../shared/audit-engine.js";
import { publicProductPageHtml } from "./pages.js";

export const CHECKLIST_CSV_FILENAME = "proof-first-technical-seo-checklist.csv";

export const CHECKLIST_SECTIONS = [
  {
    title: "1. Indexing",
    items: [
      "Site verified in Google Search Console; sitemap submitted",
      "Key pages return 200 (not redirect chains, not soft-404)",
      "No accidental `noindex` in meta robots or X-Robots-Tag",
      "robots.txt does not block CSS/JS or key sections",
      "One canonical per page, pointing to itself or the true original"
    ]
  },
  {
    title: "2. Rendering",
    items: [
      "Title, H1 and main content present in raw HTML, not only after JavaScript",
      "Internal links are real `<a href>` elements",
      "Lazy-loaded content still appears to crawlers"
    ]
  },
  {
    title: "3. On-page",
    items: [
      "Unique title (≈50–60 chars) and meta description per page",
      "One clear H1 matching search intent",
      "Images have descriptive alt text",
      "Structured data validates (Rich Results Test)"
    ]
  },
  {
    title: "4. Speed & hosting",
    items: [
      "Field Core Web Vitals pass in PageSpeed Insights / GSC",
      "Server response time measured on key URLs",
      "CDN + caching in front of static assets; HTTPS everywhere, www/non-www 301"
    ]
  },
  {
    title: "5. Site structure",
    items: [
      "Important pages within 3 clicks of home",
      "No orphan pages; no broken internal links",
      "Hreflang correct (if multilingual)"
    ]
  },
  {
    title: "6. Re-measure",
    items: [
      "After every fix, rerun the same check and record fixed / still open / regressed"
    ]
  }
];

function csvEscape(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export const CHECKLIST_CSV = [
  "Section,Check,Status (Pass/Fail/NA),Evidence URL,Notes",
  ...CHECKLIST_SECTIONS.flatMap((section) =>
    section.items.map((item) => `${csvEscape(section.title)},${csvEscape(item)},,,`)
  ),
  ""
].join("\n");

export function checklistCsvResponse() {
  return new Response(CHECKLIST_CSV, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${CHECKLIST_CSV_FILENAME}"`,
      "cache-control": "public, max-age=3600"
    }
  });
}

function checklistBody(origin) {
  const sections = CHECKLIST_SECTIONS.map(
    (section) => `
      <section class="band">
        <h2>${escapeHtml(section.title)}</h2>
        <ul class="check-list">
          ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>`
  ).join("");

  return `
      <section class="band">
        <h2>How to use this list</h2>
        <p>Tick items against the rendered page — what a browser shows — not only the raw HTML. Download the CSV to record Pass, Fail, or NA with evidence URLs. No account and no email are required.</p>
        <p><a class="cta" href="${origin}/checklist.csv" download="${CHECKLIST_CSV_FILENAME}">Download the CSV</a></p>
        <p>Measure one public URL with the <a href="${origin}/check">free one-page check</a>. For tool choice, see <a href="${origin}/guides/best-seo-audit-tools">best SEO audit tools</a>, <a href="${origin}/guides/semrush-vs-alternatives">Semrush vs alternatives</a>, and <a href="${origin}/guides/fast-hosting-for-seo">fast hosting for SEO</a>.</p>
      </section>
      ${sections}
      <section class="band">
        <h2>After you work the list</h2>
        <p>Re-run the same check and record fixed, still open, or regressed. The free <a href="${origin}/check">one-page proof check</a> is the fastest way to re-measure a public URL. Methodology and limits stay on <a href="${origin}/methodology">${origin}/methodology</a>.</p>
      </section>`;
}

export function checklistHtml(origin) {
  return publicProductPageHtml({
    origin,
    path: "/checklist",
    title: "Proof-First Technical SEO Checklist",
    description: "A free technical SEO checklist to check against the rendered page, not just raw HTML. Download as CSV. No signup.",
    eyebrow: "Free checklist",
    heading: "Proof-First Technical SEO Checklist",
    lead: "Check each item against the rendered page (what a browser shows), not just raw HTML. No email required.",
    body: checklistBody(origin),
    faq: [
      {
        q: "Do I need an account to use this checklist?",
        a: "No. The page and the CSV download are public. Nothing is stored."
      },
      {
        q: "Is this a full site audit?",
        a: "No. It is a working list. Use the free one-page check to measure a public URL against the rendered page."
      },
      {
        q: "Does finishing the checklist guarantee rankings?",
        a: "No. Rankings, traffic, indexing, and revenue are never guaranteed."
      }
    ]
  });
}
