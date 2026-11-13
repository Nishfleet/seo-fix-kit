export const CHATGPT_READ_BOTS = [
  { agent: "GPTBot", product: "ChatGPT (OpenAI)" },
  { agent: "ClaudeBot", product: "Claude (Anthropic)" },
  { agent: "PerplexityBot", product: "Perplexity" }
];

export const CONTENT_MIN_WORDS = 50;
export const SCHEMA_MIN_TYPES = 1;

export function botAllowance(crawlerAccess) {
  const ai = Array.isArray(crawlerAccess?.ai) ? crawlerAccess.ai : [];
  const robotsKnown = Boolean(crawlerAccess);
  return CHATGPT_READ_BOTS.map((bot) => {
    const found = ai.find((entry) => entry.agent === bot.agent);
    return {
      agent: bot.agent,
      product: bot.product,
      allowed: found ? found.allowed !== false : true,
      rule: found?.rule || "",
      known: Boolean(found),
      robotsKnown
    };
  });
}

export function contentEvidence(staticFacts = {}) {
  const wordCount = Number.isFinite(staticFacts.wordCount) ? staticFacts.wordCount : 0;
  const h1s = Array.isArray(staticFacts.h1s) ? staticFacts.h1s.filter(Boolean) : [];
  const headings = Array.isArray(staticFacts.headings) ? staticFacts.headings : [];
  const title = String(staticFacts.title || "").trim();
  const description = String(staticFacts.description || "").trim();
  const hasMainContent = wordCount >= CONTENT_MIN_WORDS;
  return {
    wordCount,
    hasMainContent,
    contentThreshold: CONTENT_MIN_WORDS,
    h1s,
    h1Count: h1s.length,
    headingCount: headings.length,
    title,
    hasTitle: Boolean(title),
    description,
    hasDescription: Boolean(description),
    bodySample: String(staticFacts.bodySample || "").slice(0, 280)
  };
}

export function schemaEvidence(staticFacts = {}) {
  const types = Array.isArray(staticFacts.schemaTypes)
    ? [...new Set(staticFacts.schemaTypes.filter((type) => type && type !== "invalid-json"))]
    : [];
  const errors = Array.isArray(staticFacts.schemaErrors) ? staticFacts.schemaErrors : [];
  const hasSchema = types.length >= SCHEMA_MIN_TYPES;
  return {
    types,
    typeCount: types.length,
    hasSchema,
    schemaThreshold: SCHEMA_MIN_TYPES,
    errors,
    errorCount: errors.length
  };
}

export function renderVerdict({ bots, content, schema }) {
  const blocked = bots.filter((bot) => !bot.allowed);
  const robotsKnown = bots.every((bot) => bot.robotsKnown);
  const access = robotsKnown
    ? "robots.txt allows all three crawlers"
    : "no robots.txt was found, so no crawler is blocked";
  if (blocked.length === bots.length) {
    return {
      status: "blocked",
      headline: "No. robots.txt blocks every AI crawler we check on this page.",
      detail: `${blocked.map((bot) => bot.agent).join(", ")} cannot fetch this URL, so no AI crawler can read its content.`
    };
  }
  if (blocked.length > 0) {
    return {
      status: "partly-blocked",
      headline: `Partly. robots.txt blocks ${blocked.map((bot) => bot.agent).join(", ")} on this page.`,
      detail: `${blocked.map((bot) => bot.agent).join(", ")} cannot fetch this URL. The allowed crawlers still can.`
    };
  }
  if (!content.hasMainContent && !schema.hasSchema) {
    return {
      status: "thin",
      headline: "Yes, but the raw HTML a crawler reads is thin.",
      detail: `${access}, but the HTML they fetch holds ${content.wordCount} words of text and no schema types.`
    };
  }
  if (!content.hasMainContent) {
    return {
      status: "thin",
      headline: "Yes, but the raw HTML a crawler reads has little text.",
      detail: `${access}, but the HTML they fetch holds ${content.wordCount} words of text.`
    };
  }
  if (!schema.hasSchema) {
    return {
      status: "no-schema",
      headline: "Yes. The crawlers are allowed and the text is there, but there is no schema.",
      detail: `${access} and the HTML holds ${content.wordCount} words of text, with no JSON-LD schema types found.`
    };
  }
  return {
    status: "readable",
    headline: "Yes. The crawlers are allowed and the page content is in the raw HTML.",
    detail: `${access}, and the HTML they fetch holds ${content.wordCount} words of text plus ${schema.typeCount} schema type${schema.typeCount === 1 ? "" : "s"}.`
  };
}

export function buildChatgptReadResult(report) {
  const page = report?.pages?.[0];
  const staticFacts = page?.static || {};
  const bots = botAllowance(report?.crawlerAccess);
  const content = contentEvidence(staticFacts);
  const schema = schemaEvidence(staticFacts);
  const verdict = renderVerdict({ bots, content, schema });
  return {
    ok: true,
    mode: "ai-read-check",
    checkedUrl: report?.url || "",
    finalUrl: page?.finalUrl || page?.static?.finalUrl || report?.url || "",
    scannedAt: report?.scannedAt || "",
    durationMs: report?.durationMs || 0,
    robotsChecked: Boolean(report?.crawlerAccess),
    verdict,
    bots,
    content,
    schema
  };
}
