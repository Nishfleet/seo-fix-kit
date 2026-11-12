import { VERSION } from "./audit-engine.js";

export const CHATGPT_LLM_SCRAPER_ENDPOINT =
  "https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced";
export const CHATGPT_VISIBILITY_LOCATION_CODE = 2840;
export const CHATGPT_VISIBILITY_LANGUAGE_CODE = "en";
export const CHATGPT_VISIBILITY_QUESTION_COUNT = 5;

function defaultDataForSeoFetcher() {
  // eslint-disable-next-line no-restricted-properties -- only the fixed api.dataforseo.com vendor host is called directly
  return globalThis.fetch;
}

const TOPIC_MAX_LENGTH = 80;
const CITED_PAGE_LIMIT = 20;
const REPORT_PAGE_LIMIT = 25;

const SENTENCE_SPLIT = /[.!?\u2013\u2014|;]+/u;
const EDGE_NOISE = /^[.\s\-|,]+|[.\s\-|,]+$/gu;

function collapse(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capWords(value, maxLength) {
  let out = "";
  for (const word of String(value || "")
    .split(" ")
    .filter(Boolean)) {
    const candidate = out ? `${out} ${word}` : word;
    if (candidate.length > maxLength) break;
    out = candidate;
  }
  return out;
}

function dropTrailingBrand(topic, brand) {
  const name = collapse(brand).toLowerCase();
  if (name && topic.endsWith(name)) {
    return collapse(topic.slice(0, topic.length - name.length))
      .replace(/[.\s\-|,]+$/u, "")
      .trim();
  }
  return topic;
}

function dropLeadingBrand(topic, brand) {
  const name = collapse(brand).toLowerCase();
  if (!name || !topic.startsWith(name)) return topic;
  return collapse(topic.slice(name.length))
    .replace(/^(is|are)\s+/u, "")
    .replace(/^a\s+/u, "")
    .trim();
}

/** @param {{ brand?: string, title?: string, description?: string }} [site]
 * @returns {string}
 */
export function topicFromSiteContent({ brand = "", title = "", description = "" } = {}) {
  const source = collapse(description) || collapse(title);
  if (!source) return "";
  const chunk = collapse(source.split(SENTENCE_SPLIT)[0]);
  let topic = collapse(chunk.toLowerCase().replace(/[^a-z0-9+ .]+/gu, " "))
    .replace(EDGE_NOISE, "")
    .trim();
  topic = dropLeadingBrand(dropTrailingBrand(topic, brand), brand);
  return capWords(topic, TOPIC_MAX_LENGTH);
}

/** @param {{ brand?: string, title?: string, description?: string }} [site]
 * @returns {string[]}
 */
export function deriveBuyerQuestions({ brand = "", title = "", description = "" } = {}) {
  const cleanBrand = collapse(brand) || collapse(title);
  if (!cleanBrand) throw new Error("Provide the business name or the site title to derive buyer questions.");
  const topic =
    topicFromSiteContent({ brand: cleanBrand, title, description }) || `businesses like ${cleanBrand.toLowerCase()}`;
  return [
    `What are the best ${topic} options?`,
    `Which ${topic} provider would you recommend?`,
    `Who should I hire for ${topic}?`,
    `What do people recommend for ${topic}?`,
    `Is ${cleanBrand} a good choice for ${topic}?`
  ];
}

/** @param {string} keyword
 * @returns {Record<string, unknown>}
 */
export function chatgptVisibilityTask(keyword) {
  return {
    keyword: String(keyword || "").slice(0, 2000),
    location_code: CHATGPT_VISIBILITY_LOCATION_CODE,
    language_code: CHATGPT_VISIBILITY_LANGUAGE_CODE,
    force_web_search: true
  };
}

/** @param {{ keyword: string, login: string, password: string, fetchImpl?: Function }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchChatgptLlmScraper({ keyword, login, password, fetchImpl = defaultDataForSeoFetcher() }) {
  if (!login || !password) {
    throw new Error(
      "DataForSEO credentials are not configured. Add the DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD secrets first."
    );
  }
  let response;
  try {
    response = await fetchImpl(CHATGPT_LLM_SCRAPER_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${login}:${password}`)}`,
        "content-type": "application/json",
        "user-agent": `SEOFixKit/${VERSION} (+https://seofixkit.com; ChatGPT visibility check)`
      },
      body: JSON.stringify([chatgptVisibilityTask(keyword)]),
      signal: AbortSignal.timeout(150_000)
    });
  } catch (error) {
    throw new Error(`DataForSEO LLM Scraper request failed: ${error?.message || "network error"}`, { cause: error });
  }
  if (!response.ok) throw new Error(`DataForSEO LLM Scraper returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (Number(payload?.status_code) !== 20000) {
    throw new Error(
      `DataForSEO LLM Scraper error ${payload?.status_code || "unknown"}: ${payload?.status_message || "request rejected"}.`
    );
  }
  const task = (payload?.tasks || [])[0];
  if (task && Number(task.status_code) !== 20000) {
    throw new Error(`DataForSEO LLM Scraper task error ${task.status_code}: ${task.status_message}.`);
  }
  return payload;
}

function entityMatchesBrand(entityTitle, brand) {
  const title = collapse(entityTitle).toLowerCase();
  const name = collapse(brand).toLowerCase();
  if (!title || !name) return false;
  if (title === name) return true;
  return (name.length >= 4 && title.includes(name)) || (title.length >= 4 && name.includes(title));
}

function mentionsBrand(markdown, brand) {
  const name = collapse(brand);
  if (!name || !markdown) return false;
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(String(markdown));
}

function collectBrandEntities(result) {
  const seen = new Set();
  const entities = [];
  const groups = [result?.brand_entities, ...(result?.items || []).map((item) => item?.brand_entities)];
  for (const group of groups) {
    for (const entity of group || []) {
      const title = collapse(entity?.title);
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push({ title, category: collapse(entity?.category) });
    }
  }
  return entities;
}

function isOwnSiteDomain(domain, host) {
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/^www\./u, "")
      .replace(/\.$/u, "");
  const domainHost = normalize(domain);
  const siteHost = normalize(host);
  if (!domainHost || !siteHost) return false;
  return domainHost === siteHost || domainHost.endsWith(`.${siteHost}`);
}

function collectCitedPages(result, host) {
  const seen = new Set();
  const pages = [];
  const groups = [result?.sources, ...(result?.items || []).map((item) => item?.sources)];
  for (const group of groups) {
    for (const source of group || []) {
      const url = collapse(source?.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const domain = collapse(source?.domain).toLowerCase();
      pages.push({ url, domain, title: collapse(source?.title), ownSite: isOwnSiteDomain(domain, host) });
    }
  }
  return pages.slice(0, CITED_PAGE_LIMIT);
}

/** @param {{ brand: string, host?: string, question: string, payload: Record<string, unknown> }} input
 * @returns {Record<string, unknown>}
 */
export function summarizeChatgptVisibilityTask({ brand, host = "", question, payload }) {
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  const task = tasks.find((entry) => Array.isArray(entry?.result) && entry.result.length) || tasks[0] || null;
  const result = task?.result?.[0] || null;
  if (!result) {
    return {
      question,
      named: false,
      namedByText: false,
      unavailable: true,
      statusMessage: collapse(task?.status_message) || "ChatGPT returned no answer for this question.",
      namedInstead: [],
      citedPages: [],
      ownSiteCited: false,
      model: null,
      checkUrl: null,
      ranAt: null,
      cost: Number(task?.cost) || 0
    };
  }
  const entities = collectBrandEntities(result);
  const entityMatch = entities.find((entity) => entityMatchesBrand(entity.title, brand));
  const textMention = mentionsBrand(result.markdown, brand);
  const named = Boolean(entityMatch) || textMention;
  const citedPages = collectCitedPages(result, host);
  return {
    question,
    named,
    namedByText: !entityMatch && textMention,
    unavailable: false,
    statusMessage: null,
    namedInstead: entities.filter((entity) => !entityMatchesBrand(entity.title, brand)).map((entity) => entity.title),
    citedPages,
    ownSiteCited: citedPages.some((page) => page.ownSite),
    model: collapse(result.model) || null,
    checkUrl: collapse(result.check_url) || null,
    ranAt: collapse(result.datetime) || null,
    cost: Number(task?.cost) || 0
  };
}

/** @param {{ brand: string, host?: string, results: Record<string, unknown>[] }} input
 * @returns {Record<string, unknown>}
 */
export function buildChatgptVisibilityReport({ brand, host = "", results }) {
  const summaries = Array.isArray(results) ? results : [];
  const namedResults = summaries.filter((result) => result?.named);
  const whoNamedInstead = [];
  const citedPages = [];
  const seenInstead = new Set();
  const seenPages = new Set();
  for (const result of summaries) {
    for (const name of result?.namedInstead || []) {
      const key = collapse(name).toLowerCase();
      if (!key || seenInstead.has(key)) continue;
      seenInstead.add(key);
      whoNamedInstead.push(collapse(name));
    }
    for (const page of result?.citedPages || []) {
      if (!page?.url || seenPages.has(page.url)) continue;
      seenPages.add(page.url);
      citedPages.push(page);
    }
  }
  const totalCost = summaries.reduce((sum, result) => sum + (Number(result?.cost) || 0), 0);
  const ranAt =
    summaries
      .map((result) => result?.ranAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
  return {
    brand: collapse(brand),
    host: collapse(host),
    tool: "chatgpt",
    questionCount: summaries.length,
    named: namedResults.length > 0,
    namedQuestions: namedResults.length,
    whoNamedInstead,
    citedPages: citedPages.slice(0, REPORT_PAGE_LIMIT),
    ownSiteCited: citedPages.some((page) => page.ownSite),
    totalCost: Math.round(totalCost * 10000) / 10000,
    ranAt,
    unavailableQuestions: summaries.filter((result) => result?.unavailable).length,
    results: summaries
  };
}

function costText(value) {
  const text = Number(value || 0).toFixed(4);
  return text.replace(/0+$/u, "").replace(/\.$/u, "");
}

/** @param {Record<string, unknown>} report
 * @returns {string}
 */
export function chatgptVisibilityReportMarkdown(report) {
  const brand = report.brand || "your business";
  const lines = [];
  lines.push(`# Does ChatGPT name ${brand}?`);
  if (report.unavailableQuestions === report.questionCount) {
    lines.push(
      `ChatGPT returned no usable answer for any of the ${report.questionCount} questions, so this report has no result yet.`
    );
  } else if (report.named) {
    lines.push(
      `**Yes.** ChatGPT named ${brand} when answering ${report.namedQuestions} of ${report.questionCount} buyer questions.`
    );
  } else {
    lines.push(`**Not yet.** ChatGPT did not name ${brand} in any of the ${report.questionCount} buyer questions.`);
  }
  lines.push("");
  lines.push(
    `Asked on ${report.host || "the site"} through DataForSEO's ChatGPT LLM Scraper${report.ranAt ? `, sampled on ${report.ranAt}` : ""}.`
  );
  lines.push("");
  lines.push("## Who was named instead");
  lines.push(
    report.whoNamedInstead?.length ? report.whoNamedInstead.join(", ") : "No other business was named in the answers."
  );
  lines.push("");
  lines.push("## Pages ChatGPT cited");
  if (report.citedPages?.length) {
    for (const page of report.citedPages) {
      lines.push(`- ${page.url}${page.ownSite ? " (your site)" : ""}`);
    }
  } else {
    lines.push("No pages were cited in the answers.");
  }
  lines.push("");
  lines.push("## Questions asked");
  (report.results || []).forEach((result, index) => {
    const verdict = result?.unavailable
      ? "no answer returned"
      : result?.named
        ? `named${result.namedByText ? " in the answer text" : ""}`
        : "not named";
    lines.push(`${index + 1}. ${result?.question} — ${verdict}`);
  });
  lines.push("");
  lines.push(
    `Cost: $${costText(report.totalCost)} (the task cost DataForSEO reported; ${report.questionCount} questions, sampled once each).`
  );
  lines.push("");
  lines.push(
    "This report sampled ChatGPT once per question at scan time through DataForSEO. Answers vary between runs; it is not continuous monitoring and does not guarantee citations, traffic, rankings, or revenue."
  );
  return lines.join("\n");
}
