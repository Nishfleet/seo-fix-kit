const MADE_UP_PATH_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SITEMAP_TRY_LIMIT = 3;

export function randomMadeUpPath(random = Math.random) {
  let token = "";
  for (let index = 0; index < 12; index += 1) {
    token += MADE_UP_PATH_ALPHABET[Math.floor(random() * MADE_UP_PATH_ALPHABET.length)];
  }
  return `/madeup${token}`;
}

export async function probeMadeUpAddress({ origin, fetchText }) {
  const path = randomMadeUpPath();
  const result = await fetchText(`${origin}${path}`);
  const contentType = String(result.contentType || "").toLowerCase();
  const softNotFound =
    result.status === 200 &&
    (result.redirectChain || []).length === 0 &&
    (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) &&
    Boolean(result.body);
  return { path, url: `${origin}${path}`, status: result.status, contentType, softNotFound };
}

export function declaredSitemapUrls(robotsBody = "") {
  return [...String(robotsBody).matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);
}

export async function resolveSitemap({ origin, robots, appOrigin, fetchText, rootSitemapBody }) {
  if (origin === appOrigin) {
    return { ok: true, status: 200, url: `${origin}/sitemap.xml`, body: rootSitemapBody, tried: [] };
  }
  const rootUrl = `${origin}/sitemap.xml`;
  const root = await fetchText(rootUrl);
  const tried = [{ url: rootUrl, status: root.status }];
  if (root.ok) return { ...root, tried };
  const robotsUrl = robots?.url || `${origin}/robots.txt`;
  const declared = declaredSitemapUrls(robots?.body || "")
    .map((value) => {
      try {
        return new URL(value, robotsUrl).href;
      } catch {
        return "";
      }
    })
    .filter((url) => url && url !== rootUrl)
    .slice(0, SITEMAP_TRY_LIMIT);
  for (const url of declared) {
    const result = await fetchText(url);
    tried.push({ url, status: result.status });
    if (result.ok) return { ...result, tried };
  }
  return { ...root, url: rootUrl, tried };
}

export function missingSitemapEvidence(sitemap = {}) {
  const tried = (sitemap.tried || []).map(
    (entry) => `GET ${entry.url} returned ${entry.status || "no response"}`
  );
  return `${tried.join("; ")}.`;
}

export function redirectLinkEvidence(checks = []) {
  const shown = checks.slice(0, 5).map((check) => {
    const status = check.redirectChain?.[0]?.status;
    const finalUrl = check.finalUrl || check.url;
    return `${check.url} redirects to ${finalUrl}${status ? ` (HTTP ${status})` : ""}. Use the final URL instead.`;
  });
  const hidden = checks.length - shown.length;
  return `${shown.join(" ")}${hidden > 0 ? ` Plus ${hidden} more redirecting links.` : ""}`;
}
