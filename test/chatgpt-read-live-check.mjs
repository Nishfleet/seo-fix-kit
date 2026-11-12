import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_TARGET_URL = process.env.SEOFIXKIT_CHATGPT_READ_URL || "https://example.com/";
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_CHATGPT_READ_TIMEOUT_MS || 120000);

if (isDirectRun()) {
  await main();
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  const targetUrl = DEFAULT_TARGET_URL;
  const result = await runLiveChatgptReadCheck({ baseUrl, targetUrl });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "pass" ? 0 : result.status === "needs-quota" ? 3 : 1;
  if (result.status === "needs-quota") {
    console.error(
      "Live check skipped: the anonymous AI read check quota is exhausted from this network (needs-quota). Retry tomorrow."
    );
  }
}

export async function runLiveChatgptReadCheck({
  baseUrl = DEFAULT_BASE_URL,
  targetUrl = DEFAULT_TARGET_URL,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const apiUrl = `${baseUrl}/api/chatgpt-read-check`;
  const pageUrl = `${baseUrl}/can-chatgpt-read-my-page`;
  let pageResponse;
  try {
    pageResponse = await fetcher(pageUrl, { method: "GET" });
  } catch (error) {
    return {
      status: "fail",
      apiUrl,
      pageUrl,
      targetUrl,
      reason: `Could not reach the tool page: ${String(error?.message || error)}`
    };
  }
  if (!pageResponse.ok) {
    return {
      status: "fail",
      apiUrl,
      pageUrl,
      targetUrl,
      httpStatus: pageResponse.status,
      reason: `The tool page ${pageUrl} returned HTTP ${pageResponse.status}.`
    };
  }

  let response;
  try {
    response = await fetchWithTimeout(
      apiUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      },
      timeoutMs,
      fetcher
    );
  } catch (error) {
    return {
      status: "fail",
      apiUrl,
      pageUrl,
      targetUrl,
      reason: `Could not reach the check endpoint: ${String(error?.message || error)}`
    };
  }

  const raw = await response.text().catch(() => "");
  const payload = parseJson(raw);
  if (response.status === 429) {
    return {
      status: "needs-quota",
      apiUrl,
      pageUrl,
      targetUrl,
      error: payload?.error || "Rate limited (429) by the anonymous AI read check quota.",
      resetAt: payload?.resetAt || null
    };
  }

  if (!response.ok || !payload || payload.ok !== true) {
    return {
      status: "fail",
      apiUrl,
      pageUrl,
      targetUrl,
      httpStatus: response.status,
      error: payload?.error || `The check endpoint returned HTTP ${response.status}.`,
      raw: raw.slice(0, 400)
    };
  }
  return {
    status: "pass",
    apiUrl,
    pageUrl,
    targetUrl,
    httpStatus: response.status,
    proof: {
      checkedUrl: payload.checkedUrl,
      finalUrl: payload.finalUrl,
      scannedAt: payload.scannedAt,
      durationMs: payload.durationMs,
      robotsChecked: payload.robotsChecked,
      verdict: payload.verdict,
      bots: payload.bots.map((bot) => ({
        agent: bot.agent,
        allowed: bot.allowed,
        rule: bot.rule
      })),
      content: {
        wordCount: payload.content?.wordCount ?? null,
        hasMainContent: payload.content?.hasMainContent ?? null,
        title: payload.content?.title || "",
        h1s: payload.content?.h1s || []
      },
      schema: {
        types: payload.schema?.types || [],
        hasSchema: payload.schema?.hasSchema ?? null
      }
    }
  };
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, init, timeoutMs, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}
