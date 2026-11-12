import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { auditUrl } from "../server/audit/engine.js";

const LISTENER_HOST = "127.0.0.1";
const AUDIT_OPTIONS = {
  maxPages: 1,
  pageSpeed: false,
  crawlInventoryMaxUrls: 8,
  crawlInventoryMaxSitemaps: 2,
  renderedCrawlTarget: 0
};

const FILLER_SENTENCE =
  "The Northglen tool library lends drills, sanders and stud finders to anyone who lives nearby, six days a week. ";

function paragraph(sentences) {
  return FILLER_SENTENCE.repeat(sentences).trim();
}

function faqSchemaJson() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the quickest way to join?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Bring photo ID to any open session and a volunteer signs you up in minutes, then you borrow the same day."
        }
      }
    ]
  });
}

function defaultBody() {
  return [
    "<main>",
    "<h1>Northglen Tool Library</h1>",
    `<p>${paragraph(18)}</p>`,
    "<h2>What is the quickest way to join?</h2>",
    "<p>Bring photo ID to any open session and a volunteer signs you up in minutes, then you borrow the same day.</p>",
    "<h2>Why members keep coming back</h2>",
    "<p>The stock is checked weekly, so nothing you borrow jams, stalls or drifts out of true.</p>",
    '<p><a href="/about">How the library is run</a></p>',
    "</main>"
  ].join("");
}

function pageHtml({ origin, path, withCanonical = true, title, description, h1 = "Northglen Tool Library", body }) {
  const canonicalTag = withCanonical ? `<link rel="canonical" href="${origin}${path}" />` : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    canonicalTag,
    `<meta property="og:image" content="${origin}/og-image.svg" />`,
    `<meta name="twitter:image" content="${origin}/og-image.svg" />`,
    '<link rel="apple-touch-icon" href="/apple-icon.svg" />',
    `<script type="application/ld+json">${faqSchemaJson()}</script>`,
    "</head>",
    "<body>",
    body ?? defaultBody().replace("<h1>Northglen Tool Library</h1>", `<h1>${h1}</h1>`),
    "</body>",
    "</html>"
  ].join("");
}

const BASE_TITLE = "Northglen Tool Library | Borrow tools without owning them";
const BASE_DESCRIPTION =
  "A neighbourhood tool library that lends drills, sanders and stud finders to anyone who lives nearby, six days a week.";

function jsOnlyBody() {
  const sections = [
    "<h1>The whole page arrives only after JavaScript</h1>",
    `<p>${paragraph(18)}</p>`,
    "<h2>What is the quickest way to join?</h2>",
    "<p>Bring photo ID to any open session and a volunteer signs you up in minutes, then you borrow the same day.</p>",
    "<h2>Why members keep coming back</h2>",
    "<p>The stock is checked weekly, so nothing you borrow jams, stalls or drifts out of true.</p>",
    '<p><a href="/about">How the library is run</a></p>'
  ]
    .map((line) => `'${line}'`)
    .join(",");
  return [
    '<div id="fixture-root"></div>',
    "<script>",
    'document.getElementById("fixture-root").innerHTML = [' + sections + '].join("");',
    "</script>"
  ].join("");
}

const INLINE_DATA_TOKEN = "SF-9F2A-INLINE-ONLY";
const inlineDataPadding = "x".repeat(520_000);
const inlineDataBody = [
  "<main>",
  "<h1>Northglen Tool Library</h1>",
  `<p>${paragraph(18)}</p>`,
  "<h2>What is the quickest way to join?</h2>",
  "<p>Bring photo ID to any open session and a volunteer signs you up in minutes, then you borrow the same day.</p>",
  '<p><a href="/about">How the library is run</a></p>',
  "</main>",
  "<script>",
  `window.__fixtureProductData = {"note":"${INLINE_DATA_TOKEN}","padding":"${inlineDataPadding}"};`,
  "</script>"
].join("");

const redirectLinkBody = [
  "<main>",
  "<h1>Northglen Tool Library</h1>",
  `<p>${paragraph(18)}</p>`,
  "<h2>What is the quickest way to join?</h2>",
  "<p>Bring photo ID to any open session and a volunteer signs you up in minutes, then you borrow the same day.</p>",
  '<p><a href="/about">How the library is run</a> and <a href="/old-address">the full story of the workshop</a>.</p>',
  "</main>"
].join("");

const shortBody = [
  "<main>",
  "<h1>A short page on purpose</h1>",
  "<p>We lend tools. Doors open at nine.</p>",
  "<h2>What is this page for?</h2>",
  "<p>It points people to the desk.</p>",
  "<h2>Why so brief</h2>",
  "<p>The rest is at the desk.</p>",
  '<p><a href="/about">How the library is run</a></p>',
  "</main>"
].join("");

const madeUpBody = [
  "<main>",
  "<h1>Harbor Lane Provisions</h1>",
  `<p>${paragraph(18)}</p>`,
  "<h2>What is on the shelf this week?</h2>",
  "<p>Rye flour, pickled mussels and sour cherry jam, all from within thirty miles of the shop.</p>",
  '<p><a href="/store">This week&rsquo;s shelf</a></p>',
  "</main>"
].join("");

function sites() {
  const wellFormedPages = (origin) => ({
    "/js-only": pageHtml({
      origin,
      path: "/js-only",
      title: BASE_TITLE,
      description: BASE_DESCRIPTION,
      body: jsOnlyBody()
    }),
    "/trailing-slash/": pageHtml({
      origin,
      path: "/trailing-slash/",
      withCanonical: false,
      title: BASE_TITLE,
      description: BASE_DESCRIPTION
    }),
    "/trailing-slash": pageHtml({
      origin,
      path: "/trailing-slash",
      withCanonical: false,
      title: BASE_TITLE,
      description: BASE_DESCRIPTION
    }),
    "/inline-script-data": pageHtml({
      origin,
      path: "/inline-script-data",
      title: BASE_TITLE,
      description: BASE_DESCRIPTION,
      body: inlineDataBody
    }),
    "/redirect-link": pageHtml({
      origin,
      path: "/redirect-link",
      title: BASE_TITLE,
      description: BASE_DESCRIPTION,
      body: redirectLinkBody
    }),
    "/short-page": pageHtml({
      origin,
      path: "/short-page",
      title: "A short page on purpose | Northglen",
      description: "A deliberately short page: we lend tools and the doors open at nine every weekday morning.",
      body: shortBody
    }),
    "/about": pageHtml({
      origin,
      path: "/about",
      title: "How the Northglen tool library is run",
      description:
        "Volunteers run the Northglen tool library as a co-operative, with weekly stock checks and open committee minutes."
    }),
    "/final": pageHtml({
      origin,
      path: "/final",
      title: "The full story of the workshop",
      description:
        "The long story of how the Northglen tool workshop grew from three borrowed drills into a lending library."
    })
  });

  return [
    {
      name: "well-formed",
      sitemapPaths: [
        "/",
        "/about",
        "/js-only",
        "/trailing-slash/",
        "/inline-script-data",
        "/redirect-link",
        "/short-page"
      ],
      pages: wellFormedPages
    },
    {
      name: "no-robots",
      robotsBody: null,
      sitemapPaths: ["/page"],
      pages: (origin) => ({
        "/page": pageHtml({ origin, path: "/page", title: BASE_TITLE, description: BASE_DESCRIPTION }),
        "/about": pageHtml({
          origin,
          path: "/about",
          title: "How the Northglen tool library is run",
          description:
            "Volunteers run the Northglen tool library as a co-operative, with weekly stock checks and open committee minutes."
        })
      })
    },
    {
      name: "answers-blocked",
      robotsBody: (origin) =>
        [
          "User-agent: PerplexityBot",
          "Disallow: /",
          "",
          "User-agent: *",
          "Allow: /",
          "",
          `Sitemap: ${origin}/sitemap.xml`
        ].join("\n"),
      sitemapPaths: ["/page"],
      pages: (origin) => ({
        "/page": pageHtml({ origin, path: "/page", title: BASE_TITLE, description: BASE_DESCRIPTION }),
        "/about": pageHtml({
          origin,
          path: "/about",
          title: "How the Northglen tool library is run",
          description:
            "Volunteers run the Northglen tool library as a co-operative, with weekly stock checks and open committee minutes."
        })
      })
    },
    {
      name: "soft-404",
      sitemapPaths: ["/store"],
      pages: () => ({}),
      catchAllPath: "/this-page-was-never-published",
      catchAllBody: madeUpBody
    },
    {
      name: "no-sitemap",
      robotsBody: () => ["User-agent: *", "Allow: /"].join("\n"),
      sitemapPaths: null,
      pages: (origin) => ({
        "/page": pageHtml({ origin, path: "/page", title: BASE_TITLE, description: BASE_DESCRIPTION }),
        "/about": pageHtml({
          origin,
          path: "/about",
          title: "How the Northglen tool library is run",
          description:
            "Volunteers run the Northglen tool library as a co-operative, with weekly stock checks and open committee minutes."
        })
      })
    },
    {
      name: "clean-site",
      sitemapPaths: ["/clean"],
      pages: (origin) => ({
        "/clean": pageHtml({ origin, path: "/clean", title: BASE_TITLE, description: BASE_DESCRIPTION }),
        "/about": pageHtml({
          origin,
          path: "/about",
          title: "How the Northglen tool library is run",
          description:
            "Volunteers run the Northglen tool library as a co-operative, with weekly stock checks and open committee minutes."
        })
      })
    }
  ];
}

const llmsBody =
  "# Northglen fixture site\n\nA fixed benchmark page for the free check, served from the test server.\n";
const startedServers = [];

async function startFixtureSite(site) {
  const server = http.createServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    const path = new URL(req.url, origin).pathname;
    const htmlHeaders = {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-frame-options": "deny",
      "referrer-policy": "strict-origin-when-cross-origin"
    };
    const send = (status, headers, body) => {
      res.writeHead(status, headers);
      res.end(body);
    };
    if (path === "/robots.txt") {
      const body = typeof site.robotsBody === "function" ? site.robotsBody(origin) : site.robotsBody;
      if (body === null) {
        send(404, { "content-type": "text/plain" }, "not found");
        return;
      }
      send(
        200,
        { "content-type": "text/plain" },
        body || ["User-agent: *", "Allow: /", "", `Sitemap: ${origin}/sitemap.xml`].join("\n")
      );
      return;
    }
    if (path === "/sitemap.xml") {
      if (!site.sitemapPaths) {
        send(404, { "content-type": "text/plain" }, "not found");
        return;
      }
      const locs = site.sitemapPaths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join("");
      send(
        200,
        { "content-type": "application/xml" },
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs}</urlset>`
      );
      return;
    }
    if (path === "/llms.txt") {
      send(200, { "content-type": "text/plain" }, llmsBody);
      return;
    }
    if (path === "/og-image.svg") {
      send(
        200,
        { "content-type": "image/svg+xml" },
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#334"/></svg>'
      );
      return;
    }
    if (path === "/apple-icon.svg") {
      send(
        200,
        { "content-type": "image/svg+xml" },
        '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#334"/></svg>'
      );
      return;
    }
    if (path === "/old-address") {
      res.writeHead(301, { location: "/final" });
      res.end();
      return;
    }
    const pages = typeof site.pages === "function" ? site.pages(origin) : site.pages || {};
    if (pages[path]) {
      send(200, htmlHeaders, pages[path]);
      return;
    }
    if (site.catchAllPath && site.catchAllBody) {
      send(
        200,
        htmlHeaders,
        pageHtml({
          origin,
          path: site.catchAllPath,
          title: "Harbor Lane Provisions",
          description:
            "A corner shop that stocks rye flour, pickled mussels and sour cherry jam from within thirty miles.",
          body: site.catchAllBody
        })
      );
      return;
    }
    send(404, { "content-type": "text/plain" }, "not found");
  });
  await new Promise((resolve) => server.listen(0, LISTENER_HOST, resolve));
  startedServers.push(server);
  return { origin: `http://${LISTENER_HOST}:${server.address().port}` };
}

const running = {};

before(async () => {
  for (const site of sites()) {
    running[site.name] = await startFixtureSite(site);
  }
});

after(async () => {
  for (const server of startedServers) {
    server.close();
  }
});

function reportIssues(report) {
  return (report.findings || []).filter((finding) => finding.severity !== "good");
}

function suggestionTexts(report) {
  const texts = [];
  for (const finding of report.findings || []) {
    if (finding.fix) texts.push(finding.fix);
    if (finding.snippet) texts.push(finding.snippet);
  }
  for (const item of report.repairPlan || []) {
    if (item.fix) texts.push(item.fix);
  }
  return texts;
}

function assertSuggestionHygiene(report, fixture) {
  for (const text of suggestionTexts(report)) {
    for (const sentinel of fixture.scriptTokens || []) {
      assert.ok(!text.includes(sentinel), `a suggested fix quotes raw script text ("${sentinel}"): ${text}`);
    }
    const addresses = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const address of addresses) {
      assert.ok(
        (fixture.allowedAddresses || []).includes(address),
        `a suggested fix names a wrong address (${address}): ${text}`
      );
    }
  }
}

function assertFaultReported(report, fault) {
  const issues = reportIssues(report);
  const hit = issues.find(
    (finding) => fault.title.test(finding.title) && (!fault.evidence || fault.evidence.test(finding.evidence || ""))
  );
  assert.ok(
    hit,
    `fixture fault not reported (${fault.describe}); the check reported: ${issues.map((f) => f.title).join(" | ") || "nothing"}`
  );
  return hit;
}

function assertRepairPlanReported(report, titlePattern, describe) {
  const titles = (report.repairPlan || []).map((item) => item.title || "");
  assert.ok(
    titles.some((title) => titlePattern.test(title)),
    `fixture fault missing from the repair plan (${describe}); the plan had: ${titles.join(" | ") || "nothing"}`
  );
}

function assertNonFaultsQuiet(report, fixture) {
  const issues = reportIssues(report);
  for (const pattern of fixture.nonFaults || []) {
    const hit = issues.find((finding) => pattern.test(finding.title));
    assert.ok(!hit, `fixture non-fault was reported: ${hit ? `${hit.title} on ${fixture.name}` : pattern}`);
  }
}

async function auditFixture(fixture) {
  const site = running[fixture.site];
  return auditUrl(`${site.origin}${fixture.path}`, AUDIT_OPTIONS);
}

const FIXTURES = [
  {
    name: "js-only-content",
    site: "well-formed",
    path: "/js-only",
    faults: [
      {
        describe: "the whole page's content exists only in JavaScript; the raw HTML body carries none of it",
        title: /javascript|js-only|client-side|script-rendered/i
      }
    ],
    nonFaults: [
      /^Thin rendered content on/,
      /^Missing meta description on/,
      /^Missing canonical URL on/,
      /^Missing or weak title on/,
      /^Missing H1 on/,
      /^No rendered internal links on/,
      /^Robots.txt not found$/,
      /^Sitemap not found$/
    ],
    allowedAddresses: (origin) => [`${origin}/js-only`, `${origin}/sitemap.xml`],
    knownBug:
      "expected failure today, known check bug (#407-#409, the 2026-11-12 free-check comparison): the check returns only good guards (title/H1/links/thin all 'exist after render', nothing to fix) and never reports that the page's core content is missing from the raw HTML"
  },
  {
    name: "trailing-slash-address",
    site: "well-formed",
    path: "/trailing-slash/",
    faults: [
      {
        describe:
          "the same page answers 200 at both /trailing-slash/ and /trailing-slash with no redirect and no canonical tag naming the preferred address",
        title: /^Missing canonical URL on/
      }
    ],
    nonFaults: [
      /^Thin rendered content on/,
      /^Broken internal links on/,
      /^Redirecting internal links on/,
      /^Robots.txt not found$/,
      /^Sitemap not found$/,
      /^Robots.txt does not list your sitemap$/
    ],
    allowedAddresses: (origin) => [`${origin}/trailing-slash/`, `${origin}/sitemap.xml`],
    knownBug:
      "expected failure today, known check bug (#407-#409, the 2026-11-12 free-check comparison): the crawl queue rewrites /trailing-slash/ to the non-slash twin before auditing, so the suggested canonical tag names a wrong address that was never the one checked"
  },
  {
    name: "inline-script-data",
    site: "well-formed",
    path: "/inline-script-data",
    faults: [
      {
        describe: "over half a megabyte of inline script data ships inside the body HTML",
        title: /^Large HTML response on/
      }
    ],
    nonFaults: [
      /^Thin rendered content on/,
      /^Large image files on/,
      /^Broken internal links on/,
      /^Slow rendered load on/,
      /^False positive guarded on .*rendered content is not thin/
    ],
    scriptTokens: [INLINE_DATA_TOKEN],
    allowedAddresses: (origin) => [`${origin}/inline-script-data`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "no-robots-txt",
    site: "no-robots",
    path: "/page",
    faults: [
      {
        describe: "the site serves no robots.txt at all (GET /robots.txt returns 404)",
        title: /^Robots.txt not found$/
      }
    ],
    nonFaults: [/^Sitemap not found$/, /^Thin rendered content on/, /^Missing canonical URL on/],
    allowedAddresses: (origin) => [`${origin}/page`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "robots-blocks-answer-bots",
    site: "answers-blocked",
    path: "/page",
    faults: [
      {
        describe: "robots.txt disallows the PerplexityBot answer crawler site-wide",
        title: /AI search crawlers blocked in robots\.txt$/
      }
    ],
    nonFaults: [
      /^Robots.txt blocks search engines from your site$/,
      /^Robots.txt does not list your sitemap$/,
      /^Robots.txt not found$/
    ],
    allowedAddresses: (origin) => [`${origin}/page`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "made-up-address-answers-200",
    site: "soft-404",
    path: "/this-page-was-never-published",
    faults: [
      {
        describe: "any made-up address answers 200 with a full page, so a phantom URL cannot be told from a real one",
        title: /soft.?404|made.?up|does not exist|doesn't exist|never (been )?published|not (a )?real page|phantom/i
      }
    ],
    nonFaults: [
      /^Thin rendered content on/,
      /^Robots.txt not found$/,
      /^Sitemap not found$/,
      /^Broken internal links on/,
      /^Missing canonical URL on/,
      /^Missing meta description on/
    ],
    allowedAddresses: (origin) => [
      `${origin}/this-page-was-never-published`,
      `${origin}/store`,
      `${origin}/sitemap.xml`
    ],
    knownBug:
      "expected failure today, known check bug (#407-#409, the 2026-11-12 free-check comparison): on the benchmark's second site any made-up address answered 200 and the check reported nothing, so a soft-404 address is indistinguishable from a real page"
  },
  {
    name: "redirecting-internal-link",
    site: "well-formed",
    path: "/redirect-link",
    faults: [
      {
        describe: "an internal link points at /old-address, which 301s to /final",
        title: /^Redirecting internal links on/,
        evidence: /\/final/
      }
    ],
    nonFaults: [
      /^Broken internal links on/,
      /^URL redirects before rendering on/,
      /^Long redirect chain before rendering on/
    ],
    allowedAddresses: (origin) => [`${origin}/redirect-link`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "missing-sitemap",
    site: "no-sitemap",
    path: "/page",
    faults: [
      {
        describe: "the site publishes no sitemap.xml (GET /sitemap.xml returns 404)",
        title: /^Sitemap not found$/
      }
    ],
    nonFaults: [
      /^Robots.txt not found$/,
      /^Robots.txt does not list your sitemap$/,
      /^Thin rendered content on/,
      /^Missing canonical URL on/
    ],
    allowedAddresses: (origin) => [`${origin}/page`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "short-on-purpose",
    site: "well-formed",
    path: "/short-page",
    faults: [
      {
        describe: "the page carries roughly forty rendered words",
        title: /^Thin rendered content on/
      },
      {
        describe: "AI answer readiness flags the same short content",
        title: /rendered pages lack extractable detail$/
      }
    ],
    nonFaults: [
      /^False positive guarded on .*rendered content is not thin/,
      /^No rendered internal links on/,
      /^Missing H1 on/,
      /^Missing canonical URL on/
    ],
    repairPlanFaults: [
      { describe: "GEO readiness flags the short content", title: /^Make core answer content crawlable$/ }
    ],
    allowedAddresses: (origin) => [`${origin}/short-page`, `${origin}/sitemap.xml`],
    knownBug: null
  },
  {
    name: "clean-page",
    site: "clean-site",
    path: "/clean",
    faults: [],
    nonFaults: [/.*/],
    allowedAddresses: (origin) => [`${origin}/clean`, `${origin}/sitemap.xml`],
    knownBug: null
  }
];

for (const fixture of FIXTURES) {
  const options = { todo: fixture.knownBug || undefined };

  test(`benchmark fixture: ${fixture.name}`, options, async () => {
    fixture.allowedAddresses = fixture.allowedAddresses(running[fixture.site].origin);
    const report = await auditFixture(fixture);
    assert.ok(report && Array.isArray(report.findings), "the check returned a report with findings");

    for (const fault of fixture.faults) {
      assertFaultReported(report, fault);
    }
    for (const fault of fixture.repairPlanFaults || []) {
      assertRepairPlanReported(report, fault.title, fault.describe);
    }
    assertNonFaultsQuiet(report, fixture);
    assertSuggestionHygiene(report, fixture);

    if (fixture.name === "redirecting-internal-link") {
      const redirectFinding = reportIssues(report).find((finding) =>
        /^Redirecting internal links on/.test(finding.title)
      );
      assert.ok(
        redirectFinding && /-> .*\/final/.test(redirectFinding.evidence || ""),
        "the redirect evidence must name the final address the link resolves to"
      );
    }

    if (fixture.name === "clean-page") {
      const issues = reportIssues(report);
      assert.deepEqual(
        issues.map((finding) => finding.title),
        [],
        `a clean page must get no findings; the check reported: ${issues.map((f) => f.title).join(" | ")}`
      );
      assert.deepEqual(
        (report.repairPlan || []).map((item) => item.title || ""),
        [],
        "a clean page must get no repair suggestions"
      );
    }
  });
}
