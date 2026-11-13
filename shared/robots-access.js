import robotsParser from "robots-parser";

/** @typedef {{ agent: string, product: string, purpose?: string }} CrawlerSpec */

/** @type {CrawlerSpec[]} */
export const SEARCH_CRAWLERS = [
  { agent: "Googlebot", product: "Google Search" },
  { agent: "Bingbot", product: "Bing" }
];

/** @type {CrawlerSpec[]} */
export const AI_CRAWLERS = [
  { agent: "OAI-SearchBot", product: "ChatGPT search", purpose: "answers" },
  { agent: "ChatGPT-User", product: "ChatGPT", purpose: "answers" },
  { agent: "PerplexityBot", product: "Perplexity", purpose: "answers" },
  { agent: "Claude-SearchBot", product: "Claude search", purpose: "answers" },
  { agent: "Claude-User", product: "Claude", purpose: "answers" },
  { agent: "GPTBot", product: "OpenAI model training", purpose: "training" },
  { agent: "ClaudeBot", product: "Anthropic model training", purpose: "training" },
  { agent: "Google-Extended", product: "Gemini training", purpose: "training" },
  { agent: "Applebot-Extended", product: "Apple Intelligence training", purpose: "training" },
  { agent: "CCBot", product: "Common Crawl", purpose: "training" }
];

/** @typedef {{ ok?: boolean, url?: string, body?: unknown }} RobotsFetchResult */

/** @typedef {{ agent: string, product: string, purpose?: string, allowed: boolean, rule: string }} CrawlerAccess */

/** @param {RobotsFetchResult | null | undefined} robots
 * @param {string} pageUrl
 * @returns {{ path: string, sitemaps: string[], search: CrawlerAccess[], ai: CrawlerAccess[], blockedSearch: CrawlerAccess[], blockedAnswerBots: CrawlerAccess[], blockedTrainingBots: CrawlerAccess[] } | null}
 */
export function robotsAccess(robots, pageUrl) {
  if (!robots?.ok || typeof robots.body !== "string") return null;
  const body = robots.body;
  const robotsUrl = robots.url || new URL("/robots.txt", pageUrl).href;
  const parser = robotsParser(robotsUrl, body);
  const target = new URL(pageUrl);
  const probe = `${new URL(robotsUrl).origin}${target.pathname}${target.search}`;
  /** @param {CrawlerSpec} spec
   * @returns {CrawlerAccess}
   */
  const check = ({ agent, ...rest }) => {
    const line = parser.getMatchingLineNumber(probe, agent);
    return {
      agent,
      ...rest,
      allowed: parser.isAllowed(probe, agent) !== false,
      rule: line > 0 ? body.split(/\r?\n/)[line - 1].trim() : ""
    };
  };
  const search = SEARCH_CRAWLERS.map(check);
  const ai = AI_CRAWLERS.map(check);
  return {
    path: `${target.pathname}${target.search}`,
    sitemaps: parser.getSitemaps(),
    search,
    ai,
    blockedSearch: search.filter((bot) => !bot.allowed),
    blockedAnswerBots: ai.filter((bot) => bot.purpose === "answers" && !bot.allowed),
    blockedTrainingBots: ai.filter((bot) => bot.purpose === "training" && !bot.allowed)
  };
}

/** @param {CrawlerAccess[]} [bots]
 * @returns {string}
 */
export function describeBlocked(bots = []) {
  return bots.map((bot) => `${bot.agent} (${bot.product})${bot.rule ? ` by "${bot.rule}"` : ""}`).join("; ");
}
