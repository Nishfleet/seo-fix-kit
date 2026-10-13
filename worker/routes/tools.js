// The free tools: /tools (the index) and /tools/:slug (one page per tool).
// Tool definitions live in shared/free-tools/; this file only lays them out
// in the shared public page shell. Each page ships its form and output
// already rendered for the example values, then /tools.js takes over.
import { FREE_TOOLS, TOOL_CATEGORIES, defaultValues, toolBySlug } from "../../shared/free-tools/catalog.js";
import { esc, renderChecklist, renderFields, renderOutput } from "../../shared/free-tools/render.js";
import { publicProductPageHtml } from "./pages.js";

const TOOLS_STYLE = `
      .tools-start { margin-bottom: 40px; }
      .tools-lede { color: var(--ink-muted); font-size: 14px; margin: 16px 0 0; }
      .tool-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .tool-card { color: inherit; display: grid; gap: 6px; text-decoration: none; }
      .tool-card:hover { text-decoration: none; transform: translateY(-1px); }
      .tool-card h3 { color: var(--ink); font-size: 16px; margin: 0; }
      .tool-card p { color: var(--ink-soft); font-size: 14px; font-weight: 400; line-height: 1.5; margin: 0; }
      .tool-card.featured { background: linear-gradient(180deg, var(--accent-surface), transparent 60%), var(--card-bg); border-color: var(--line-accent); }
      .tool-card .tag { color: var(--accent); font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .tools-category { border-top: 1px solid var(--line); padding: 32px 0; }
      .tools-category > p { margin: -8px 0 20px; }
      .tool-workspace { align-items: start; display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); margin: 0 0 48px; }
      .tool-panel { background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); min-width: 0; padding: 24px; }
      .tool-panel-head { align-items: center; display: flex; flex-wrap: wrap; gap: 8px 12px; justify-content: space-between; margin: 0 0 18px; }
      .tool-panel-head h2 { font-size: 16px; margin: 0; }
      .tool-panel-head .actions { display: flex; gap: 8px; }
      .tool-output-panel { position: sticky; top: calc(var(--header-height) + 16px); }
      .tool-form { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tool-field { display: grid; gap: 6px; min-width: 0; }
      .tool-field[hidden] { display: none; }
      .tool-field-wide { grid-column: 1 / -1; }
      .tool-field label { color: var(--ink); font-size: 14px; font-weight: 500; }
      .tool-field .field { width: 100%; }
      .tool-textarea { font-family: var(--font-mono); font-size: 13px; line-height: 1.55; min-height: 0; padding: 12px 14px; resize: vertical; }
      .tool-help { color: var(--ink-muted); font-size: 13px; line-height: 1.45; }
      .tool-status { align-items: center; color: var(--success); display: inline-flex; font-size: 13px; font-weight: 600; gap: 6px; margin: 0 0 14px; }
      .tool-status::before { background: currentColor; border-radius: 50%; content: ""; height: 7px; width: 7px; }
      .tool-status.has-errors { color: var(--error); }
      .tool-code { border: 1px solid var(--line); border-radius: var(--radius); margin: 0 0 16px; overflow: hidden; }
      .tool-code-bar { align-items: center; background: var(--surface-sunken); border-bottom: 1px solid var(--line); display: flex; gap: 8px; justify-content: space-between; padding: 6px 6px 6px 14px; }
      .tool-code-bar > span:first-child { color: var(--ink-muted); font-family: var(--font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tool-code-actions { display: flex; flex: none; gap: 6px; }
      .tool-code .code-block { border: 0; border-radius: 0; margin: 0; max-height: 440px; overflow: auto; }
      .tool-notes { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
      .tool-notes li { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius); display: flex; font-size: 14px; gap: 10px; line-height: 1.5; padding: 10px 12px; }
      .note-tag { border-radius: 999px; flex: none; font-size: 11px; font-weight: 700; height: fit-content; letter-spacing: .04em; padding: 2px 8px; text-transform: uppercase; }
      .note-error { border-color: var(--error-line) !important; }
      .note-error .note-tag { background: var(--error-surface); color: var(--error); }
      .note-warn .note-tag { background: var(--warning-surface); color: var(--warning); }
      .note-info .note-tag { background: var(--info-surface); color: var(--info); }
      .tool-ok { color: var(--ink-soft); font-size: 14px; margin: 0; }
      .tool-ok span { color: var(--accent-strong); font-weight: 700; }
      .tool-preview { margin: 0 0 16px; }
      .serp-pair { display: grid; gap: 12px; }
      .serp { background: #fff; border: 1px solid #e3e3e3; border-radius: 12px; color: #202124; font-family: Arial, sans-serif; margin: 0; padding: 14px 16px; }
      .serp figcaption { color: #70757a; font-family: var(--font-mono); font-size: 11px; letter-spacing: .06em; margin: 0 0 10px; text-transform: uppercase; }
      .serp-site { align-items: center; display: flex; gap: 10px; margin: 0 0 4px; }
      .serp-site strong { color: #202124; display: block; font-size: 14px; font-weight: 400; }
      .serp-site small { color: #4d5156; display: block; font-size: 12px; }
      .serp-favicon { align-items: center; background: #f1f3f4; border: 1px solid #dadce0; border-radius: 50%; color: #4d5156; display: inline-flex; flex: none; font-size: 12px; height: 26px; justify-content: center; width: 26px; }
      .serp-title { color: #1a0dab; font-size: 20px; line-height: 1.3; margin: 0 0 4px; overflow-wrap: anywhere; }
      .serp-description { color: #4d5156; font-size: 14px; line-height: 1.58; margin: 0; overflow-wrap: anywhere; }
      .serp-mobile { max-width: 400px; }
      .serp-mobile .serp-title { font-size: 18px; }
      .tool-measure { display: grid; gap: 6px; margin: 0 0 16px; }
      .tool-measure div { display: flex; flex-wrap: wrap; font-size: 13px; gap: 4px 12px; }
      .tool-measure dt { color: var(--ink-muted); min-width: 100px; }
      .tool-measure dd { color: var(--ink); margin: 0; }
      .og-card { background: #fff; border: 1px solid #dadde1; border-radius: 12px; color: #1c1e21; margin: 0; overflow: hidden; }
      .og-image { align-items: center; aspect-ratio: 1200 / 630; background: repeating-linear-gradient(45deg, #f0f2f5, #f0f2f5 10px, #e9ebee 10px, #e9ebee 20px); color: #606770; display: flex; font-size: 13px; justify-content: center; }
      .og-image img { display: block; height: 100%; object-fit: cover; width: 100%; }
      .og-card figcaption { background: #f0f2f5; display: grid; font-family: Helvetica, Arial, sans-serif; gap: 2px; padding: 10px 12px; }
      .og-card small { color: #606770; font-size: 12px; }
      .og-card strong { font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
      .og-card span { color: #606770; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
      .og-card-small { display: grid; grid-template-columns: 120px 1fr; }
      .og-card-small .og-image { aspect-ratio: 1; }
      .verdict { border-radius: var(--radius-lg); padding: 16px; }
      .verdict-ok { background: var(--success-surface); border: 1px solid var(--line-accent); }
      .verdict-blocked { background: var(--error-surface); border: 1px solid var(--error-line); }
      .verdict-headline { color: var(--ink); font-size: 17px; font-weight: 600; margin: 0 0 12px; overflow-wrap: anywhere; }
      .verdict .tool-measure { margin: 0; }
      .tool-stats { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 16px; }
      .tool-stats div { background: var(--surface-sunken); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; }
      .tool-stats dt { color: var(--ink-muted); font-size: 12px; }
      .tool-stats dd { color: var(--ink); font-size: 20px; font-weight: 600; margin: 4px 0 0; overflow-wrap: anywhere; }
      .tool-summary { color: var(--ink); font-weight: 500; }
      .tool-tables { display: grid; gap: 16px; margin: 0 0 16px; }
      .tool-tables h3 { font-size: 14px; margin: 0 0 6px; }
      .tool-table { border-collapse: collapse; font-size: 14px; width: 100%; }
      .tool-table th, .tool-table td { border-bottom: 1px solid var(--line); padding: 6px 4px; text-align: right; }
      .tool-table th:first-child { overflow-wrap: anywhere; text-align: left; }
      .tool-table thead th { color: var(--ink-muted); font-size: 12px; font-weight: 500; }
      .tool-table tbody th { color: var(--ink); font-weight: 400; }
      .tool-empty { color: var(--ink-muted); font-size: 14px; margin: 0; }
      .steps { counter-reset: step; display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; margin: 0; padding: 0; }
      .steps li { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); counter-increment: step; padding: 18px; }
      .steps li::before { color: var(--accent); content: "0" counter(step); display: block; font-family: var(--font-mono); font-size: 12px; margin: 0 0 8px; }
      .back-link { display: inline-block; font-size: 14px; margin: 0 0 8px; }
      .checklist { display: grid; gap: 16px; margin: 0 0 48px; }
      .checklist-progress { align-items: center; background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-lg); display: flex; flex-wrap: wrap; gap: 12px 20px; padding: 16px 20px; position: sticky; top: calc(var(--header-height) + 8px); z-index: 2; }
      .checklist-progress p { margin: 0; }
      .checklist-bar { background: var(--surface-sunken); border-radius: 999px; flex: 1 1 160px; height: 8px; overflow: hidden; }
      .checklist-bar span { background: var(--accent-strong); display: block; height: 100%; transition: width var(--duration) var(--ease-out); width: 0; }
      .checklist-group { background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-lg); margin: 0; min-width: 0; padding: 8px 20px 12px; }
      .checklist-group legend { color: var(--ink); float: left; font-size: 17px; font-weight: 600; margin: 12px 0 8px; width: 100%; }
      .checklist-group legend span { color: var(--ink-muted); font-family: var(--font-mono); font-size: 12px; font-weight: 500; margin-left: 8px; }
      .checklist-item { align-items: start; border-top: 1px solid var(--line); clear: both; cursor: pointer; display: flex; gap: 12px; padding: 12px 0; }
      .checklist-item input { accent-color: var(--accent-strong); flex: none; height: 18px; margin: 3px 0 0; width: 18px; }
      .checklist-item span { color: var(--ink-soft); font-size: 15px; line-height: 1.55; }
      .checklist-item input:checked + span { color: var(--ink-muted); text-decoration: line-through; text-decoration-color: var(--line-strong); }
      .auto-tag { background: var(--accent-surface); border-radius: 999px; color: var(--accent-strong); font-size: 12px; font-style: normal; font-weight: 600; margin-left: 4px; padding: 1px 8px; white-space: nowrap; }
      .checklist-item a { font-size: 13px; margin-left: 4px; white-space: nowrap; }
      .sr-live { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
      @media (max-width: 960px) { .tool-workspace { grid-template-columns: 1fr; } .tool-output-panel { position: static; } .tool-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 640px) { .tool-form, .tool-grid, .steps { grid-template-columns: 1fr; } .tool-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tool-panel { padding: 18px; } .og-card-small { grid-template-columns: 88px 1fr; } }`;

function toolCard(origin, tool) {
  return `<a class="card tool-card" href="${origin}/tools/${tool.slug}">
            <h3>${esc(tool.name)}</h3>
            <p>${esc(tool.short)}</p>
          </a>`;
}

const toolCount = FREE_TOOLS.length;

function toolsIndexHtml(origin) {
  const categories = TOOL_CATEGORIES.map((category) => {
    const tools = FREE_TOOLS.filter((tool) => tool.category === category.id);
    return `
      <section class="tools-category" aria-labelledby="cat-${category.id}">
        <h2 id="cat-${category.id}">${esc(category.title)}</h2>
        <p>${esc(category.text)}</p>
        <div class="tool-grid">
          ${tools.map((tool) => toolCard(origin, tool)).join("\n          ")}
        </div>
      </section>`;
  }).join("");
  return publicProductPageHtml({
    origin,
    path: "/tools",
    title: "Free SEO tools",
    description: `${toolCount} free SEO tools that run in your browser: meta tags, schema, robots.txt with AI crawler rules, SERP preview, hreflang, redirects, sitemaps and more. No account.`,
    eyebrow: "Free tools",
    heading: "Free SEO tools that check your work as you type.",
    lead: `${toolCount} tools for the everyday SEO jobs. Each one flags mistakes before you publish. They run in your browser, need no account, and send nothing to us.`,
    body: `
      <section class="tool-grid tools-start" aria-label="Start here">
        <a class="card tool-card featured" href="${origin}/check">
          <span class="tag">Most used</span>
          <h3>Free page check</h3>
          <p>Load any public page in a real browser and get its real problems with fixes.</p>
        </a>
        ${toolCard(origin, toolBySlug("meta-tags"))}
        ${toolCard(origin, toolBySlug("robots-txt"))}
      </section>${categories}`,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Free SEO tools",
        itemListElement: FREE_TOOLS.map((tool, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${origin}/tools/${tool.slug}`,
          name: tool.name
        }))
      }
    ],
    faq: [
      {
        q: "Are these tools really free?",
        a: "Yes. There’s no account, no limit and no trial. They run in your browser, so they cost us nothing to offer."
      },
      {
        q: "Do you store what I paste?",
        a: "No. The tools run entirely in your browser. Nothing you type is sent to SEO Fix Kit."
      },
      {
        q: "How are these different from the page check?",
        a: "The tools help you write tags and files. The free page check loads a live page in a real browser and tells you what is actually wrong with it."
      }
    ],
    extraStyle: TOOLS_STYLE
  });
}

function toolPageHtml(origin, tool) {
  const values = defaultValues(tool);
  const related = tool.related.map(toolBySlug).filter(Boolean);
  const workspace = tool.checklist
    ? renderChecklist(tool.checklist)
    : `<div class="tool-workspace" data-tool="${esc(tool.slug)}">
        <section class="tool-panel" aria-labelledby="tool-input-title">
          <div class="tool-panel-head">
            <h2 id="tool-input-title">Your details</h2>
            <div class="actions">
              <button class="btn btn-ghost btn-sm" type="button" data-tool-example>Example</button>
              <button class="btn btn-ghost btn-sm" type="button" data-tool-clear>Clear</button>
            </div>
          </div>
          <form class="tool-form" data-tool-form novalidate>
        ${renderFields(tool, values)}
          </form>
        </section>
        <section class="tool-panel tool-output-panel" aria-labelledby="tool-output-title">
          <div class="tool-panel-head"><h2 id="tool-output-title">Result</h2></div>
          <div data-tool-output>
        ${renderOutput(tool.generate(values))}
          </div>
          <p class="sr-live" aria-live="polite" data-tool-live></p>
        </section>
      </div>`;
  return publicProductPageHtml({
    origin,
    path: `/tools/${tool.slug}`,
    title: tool.title,
    description: tool.description,
    eyebrow: "Free tool",
    heading: tool.title,
    lead: tool.lead,
    body: `
      ${workspace}
      <section class="band" aria-labelledby="how-title">
        <h2 id="how-title">How to use it</h2>
        <ol class="steps">${tool.howTo.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
      </section>
      <section class="band" aria-labelledby="related-title">
        <h2 id="related-title">Related tools</h2>
        <div class="tool-grid">
          ${related.map((item) => toolCard(origin, item)).join("\n          ")}
        </div>
        <p class="tools-lede"><a href="${origin}/tools">See all ${toolCount} free tools</a></p>
      </section>`,
    faq: tool.faq,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: tool.name,
        url: `${origin}/tools/${tool.slug}`,
        description: tool.description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        provider: { "@type": "Organization", name: "SEO Fix Kit", url: origin }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Free tools", item: `${origin}/tools` },
          { "@type": "ListItem", position: 2, name: tool.name, item: `${origin}/tools/${tool.slug}` }
        ]
      }
    ],
    scripts: `\n    <script type="module" src="/tools.js"></script>`,
    extraStyle: TOOLS_STYLE
  });
}

export { toolPageHtml, toolsIndexHtml };
