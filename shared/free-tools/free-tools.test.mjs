import assert from "node:assert/strict";
import test from "node:test";
import { FREE_TOOLS, TOOL_PATHS, defaultValues, isFieldVisible, toolBySlug } from "./catalog.js";
import {
  disavow,
  hreflang,
  keywordDensity,
  llmsTxt,
  metaTags,
  normalizeHreflang,
  parseFaq,
  redirects,
  robotsTest,
  robotsTxt,
  schemaMarkup,
  serpPreview,
  sitemapXml,
  truncateToWidth,
  utmLink,
  wordCount
} from "./generators.js";
import { renderFields, renderOutput } from "./render.js";

const levels = (result, level) => result.notes.filter((note) => note.level === level).map((note) => note.text);

test("every tool has page copy, a unique slug and an example that runs without errors", () => {
  const slugs = new Set();
  for (const tool of FREE_TOOLS) {
    assert.ok(!slugs.has(tool.slug), `duplicate slug ${tool.slug}`);
    slugs.add(tool.slug);
    assert.match(tool.slug, /^[a-z0-9-]+$/);
    for (const key of ["name", "short", "title", "description", "lead"])
      assert.ok(tool[key], `${tool.slug} needs ${key}`);
    assert.ok(tool.description.length >= 70 && tool.description.length <= 200, `${tool.slug} description length`);
    assert.ok(tool.howTo.length >= 2 && tool.faq.length >= 1);
    for (const related of tool.related) assert.ok(toolBySlug(related), `${tool.slug} links to missing ${related}`);
    if (tool.generate) {
      const result = tool.generate(defaultValues(tool));
      assert.deepEqual(levels(result, "error"), [], `${tool.slug} example has errors`);
      assert.ok(result.code || result.preview, `${tool.slug} example produces nothing`);
    } else {
      assert.ok(tool.checklist?.length, `${tool.slug} needs a generator or a checklist`);
    }
  }
  assert.deepEqual(TOOL_PATHS, ["/tools", ...FREE_TOOLS.map((tool) => `/tools/${tool.slug}`)]);
});

test("meta tags escape input and flag long titles and relative URLs", () => {
  const result = metaTags({
    title: `Shoes "quoted" <b> ${"x".repeat(60)}`,
    description: "Short",
    url: "/shoes",
    image: ""
  });
  assert.match(result.code, /&quot;quoted&quot; &lt;b&gt;/);
  assert.doesNotMatch(result.code, /<b>/);
  assert.ok(levels(result, "warn").some((text) => text.includes("over 60") || text.includes("Over 60")));
  assert.ok(levels(result, "error").some((text) => text.includes("canonical URL must be a full address")));
});

test("SERP preview cuts by width at a word boundary", () => {
  const long = "The complete guide to choosing waterproof trail running shoes for wet and muddy winter hills";
  const cut = truncateToWidth(long, 600, "20px Arial");
  assert.equal(cut.truncated, true);
  assert.ok(cut.text.endsWith(" ..."));
  assert.ok(long.startsWith(cut.text.replace(/ \.\.\.$/, "")));
  const result = serpPreview({ title: long, description: "A description.", url: "https://example.com/a" });
  assert.ok(levels(result, "warn").some((text) => text.includes("title is about")));
  const measured = serpPreview({ title: "Hi", description: "", url: "" }, () => 9999);
  assert.ok(levels(measured, "warn").some((text) => text.includes("9999px")));
});

test("schema output is valid JSON-LD, drops empty fields and checks required ones", () => {
  const local = schemaMarkup({
    schemaType: "LocalBusiness",
    businessType: "Dentist",
    name: "Smile",
    street: "1 Main St",
    city: "Leeds",
    sameAs: ""
  });
  const json = JSON.parse(local.code.replace(/^<script[^>]*>\n/, "").replace(/\n<\/script>$/, ""));
  assert.equal(json["@type"], "Dentist");
  assert.equal(json.address.streetAddress, "1 Main St");
  assert.equal(json.telephone, undefined);
  assert.equal(json.sameAs, undefined);
  assert.deepEqual(levels(local, "error"), []);

  const product = schemaMarkup({ schemaType: "Product", name: "Shoe", price: "$49" });
  assert.ok(levels(product, "error").some((text) => text.includes("plain number")));
  const missing = schemaMarkup({ schemaType: "Event", name: "Run" });
  assert.ok(levels(missing, "error").some((text) => text.includes("start date")));

  const xss = schemaMarkup({ schemaType: "Organization", name: "</script><script>alert(1)</script>" });
  assert.equal(xss.code.match(/<\/script>/g).length, 1, "user input must not close the script tag");

  assert.deepEqual(parseFaq("Q1?\nA1 part\nmore\nQ2?\nA2"), [
    { q: "Q1?", a: "A1 part more" },
    { q: "Q2?", a: "A2" }
  ]);
});

test("robots.txt generator separates AI search from AI training", () => {
  const result = robotsTxt({
    access: "allow",
    aiSearch: "allow",
    aiTraining: "block",
    disallow: "/cart\nadmin",
    sitemaps: "/sitemap.xml"
  });
  assert.match(result.code, /User-agent: GPTBot/);
  assert.doesNotMatch(result.code, /OAI-SearchBot/);
  assert.ok(levels(result, "error").some((text) => text.includes('"admin" must start with /')));
  assert.ok(levels(result, "error").some((text) => text.includes("must be a full URL")));
  const blocked = robotsTxt({ access: "block", aiSearch: "block", aiTraining: "allow" });
  assert.match(blocked.code, /User-agent: \*\nDisallow: \/\n/);
  assert.match(blocked.code, /User-agent: OAI-SearchBot/);
});

test("robots.txt tester follows RFC 9309: most specific group, longest rule, allow wins ties", () => {
  const robots =
    "User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\n\nUser-agent: Googlebot\nDisallow: /nogoogle\n\nUser-agent: GPTBot\nDisallow: /";
  const check = (userAgent, path) => robotsTest({ robots, userAgent, path }).preview.ok;
  assert.equal(check("Bingbot", "/private/page"), false);
  assert.equal(check("Bingbot", "/private/ok/page"), true);
  assert.equal(check("Bingbot", "/files/a.pdf"), false);
  assert.equal(check("Bingbot", "/files/a.pdf?x=1"), true);
  // Googlebot has its own group, so the * rules don't apply to it.
  assert.equal(check("Googlebot", "/private/page"), true);
  assert.equal(check("Googlebot", "/nogoogle"), false);
  assert.equal(check("GPTBot", "/"), false);
  assert.equal(check("Bingbot", "https://example.com/private?a=1"), false);
  assert.equal(
    robotsTest({ robots: "User-agent: *\nAllow: /a\nDisallow: /a", userAgent: "x", path: "/a" }).preview.ok,
    true
  );
  assert.equal(robotsTest({ robots: "", userAgent: "x", path: "/" }).preview.ok, true);
});

test("llms.txt follows the llmstxt.org shape", () => {
  const result = llmsTxt({
    siteName: "Acme",
    summary: "Tools.",
    details: "",
    links: "## Docs\nGuide | https://a.example/guide | How to\nBad | /relative"
  });
  assert.match(result.code, /^# Acme\n\n> Tools\.\n\n## Docs\n\n- \[Guide\]\(https:\/\/a\.example\/guide\): How to/);
  assert.ok(levels(result, "error").some((text) => text.includes('"Bad" needs a full URL')));
});

test("hreflang normalises codes and catches en-UK, duplicates and missing x-default", () => {
  assert.equal(normalizeHreflang("en_gb"), "en-GB");
  assert.equal(normalizeHreflang("zh-hant-tw"), "zh-Hant-TW");
  assert.equal(normalizeHreflang("X-Default"), "x-default");
  const result = hreflang({
    entries: "en-uk | https://a.example/uk\nde | https://a.example/de\nde | https://a.example/de2",
    xDefault: "",
    format: "html"
  });
  const errors = levels(result, "error").join(" ");
  assert.match(errors, /should be en-GB/);
  assert.match(errors, /de is listed twice/);
  assert.ok(levels(result, "info").some((text) => text.includes("x-default")));
  const sitemap = hreflang({
    entries: "en | https://a.example/\nfr | https://a.example/fr/",
    xDefault: "https://a.example/",
    format: "sitemap"
  });
  assert.equal((sitemap.code.match(/<url>/g) || []).length, 2);
  assert.equal((sitemap.code.match(/xhtml:link/g) || []).length, 6);
});

test("redirects catch chains and loops and render each platform", () => {
  const chain = redirects({ rules: "/a /b\n/b /c", platform: "nginx" });
  assert.ok(levels(chain, "warn").some((text) => text.includes("/a → /b → /c")));
  assert.match(chain.code, /location = \/a \{ return 301 \/b; \}/);
  const loop = redirects({ rules: "/a /b\n/b /a" });
  assert.ok(levels(loop, "error").some((text) => text.includes("loop")));
  const vercel = redirects({ rules: "/old /new 302", platform: "vercel" });
  assert.deepEqual(JSON.parse(vercel.code), { redirects: [{ source: "/old", destination: "/new", permanent: false }] });
  const apache = redirects({ rules: "/p.html?id=2 /new", platform: "apache" });
  assert.match(apache.code, /RewriteCond %\{QUERY_STRING\} \^id=2\$\nRewriteRule \^p\\\.html\$ \/new\? \[R=301,L\]/);
});

test("sitemap removes duplicates, rejects mixed hosts and escapes XML", () => {
  const result = sitemapXml({
    urls: "https://a.example/?a=1&b=2\nhttps://a.example/?a=1&b=2\nhttps://b.example/",
    lastmod: "2026-10-13"
  });
  assert.match(result.code, /a=1&amp;b=2/);
  assert.equal((result.code.match(/<url>/g) || []).length, 2);
  assert.ok(levels(result, "error").some((text) => text.includes("2 hosts")));
  assert.doesNotMatch(result.code, /priority|changefreq/);
});

test("UTM links lowercase values and require the core three", () => {
  const result = utmLink({
    url: "https://a.example/p?x=1",
    source: "News Letter",
    medium: "Email",
    campaign: "",
    spaces: "dash"
  });
  assert.equal(result.code, "https://a.example/p?x=1&utm_source=news-letter&utm_medium=email");
  assert.ok(levels(result, "error").some((text) => text.includes("the campaign")));
  assert.ok(levels(utmLink({ url: "nope" }), "error").length);
});

test("word count and keyword density measure text", () => {
  const stats = wordCount({ text: "One two three. Four five!\n\nSix." }).preview.rows;
  const value = (label) => stats.find((row) => row.label === label).value;
  assert.equal(value("Words"), "6");
  assert.equal(value("Sentences"), "3");
  assert.equal(value("Paragraphs"), "2");
  const density = keywordDensity({ text: "Red shoes and red shoes and the blue hat.", keyword: "red shoes" });
  assert.match(density.preview.summary, /appears 2 times/);
  assert.equal(density.preview.tables[0].rows[0].phrase, "red");
  assert.ok(!density.preview.tables[0].rows.some((row) => row.phrase === "and" || row.phrase === "the"));
  assert.equal(density.preview.tables[1].rows[0].phrase, "red shoes");
});

test("disavow turns domains into domain: lines and drops duplicates", () => {
  const result = disavow({ entries: "www.Spam.example\nspam.example\nhttps://x.example/p\nnot a link", mode: "url" });
  assert.equal(result.code, "domain:spam.example\nhttps://x.example/p\n");
  assert.ok(levels(result, "error").some((text) => text.includes("not a link")));
});

test("rendered form hides dependent fields and the output escapes everything", () => {
  const tool = toolBySlug("schema");
  const values = { ...defaultValues(tool), schemaType: "Product" };
  const html = renderFields(tool, values);
  assert.match(html, /data-field="price">/);
  assert.match(html, /data-field="street" hidden>/);
  assert.equal(
    isFieldVisible(
      tool.fields.find((f) => f.name === "price"),
      values
    ),
    true
  );
  const output = renderOutput(metaTags({ title: "<img src=x onerror=alert(1)>", description: "", url: "" }));
  assert.doesNotMatch(output, /<img src=x/);
  assert.match(output, /data-copy/);
});
