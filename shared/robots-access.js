import robotsParser from "robots-parser";

export const SEARCH_CRAWLERS = [
  { agent: "Googlebot", product: "Google Search" },
  { agent: "Bingbot", product: "Bing" }
];

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

export function robotsAccess(robots, pageUrl) {
  if (!robots?.ok || typeof robots.body !== "string") return null;
  const robotsUrl = robots.url || new URL("/robots.txt", pageUrl).href;
  const parser = robotsParser(robotsUrl, robots.body);
  const target = new URL(pageUrl);
  const probe = `${new URL(robotsUrl).origin}${target.pathname}${target.search}`;
  const check = ({ agent, ...rest }) => {
    const line = parser.getMatchingLineNumber(probe, agent);
    return {
      agent,
      ...rest,
      allowed: parser.isAllowed(probe, agent) !== false,
      rule: line > 0 ? robots.body.split(/\r?\n/)[line - 1].trim() : ""
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

export function describeBlocked(bots = []) {
  return bots.map((bot) => `${bot.agent} (${bot.product})${bot.rule ? ` by "${bot.rule}"` : ""}`).join("; ");
}
