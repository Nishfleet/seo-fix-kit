import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_WALK_URL = `${DEFAULT_BASE_URL}/fixture/rendered-page`;
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_WALK_TIMEOUT_MS || 120000);

export const WALK_STATUS = {
  PASS: "pass",
  NEEDS_QUOTA: "needs-quota",
  FAIL: "fail"
};

export const WALK_EXIT_CODES = { pass: 0, fail: 1, error: 2, "needs-quota": 3 };

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  const walkUrl = process.env.SEOFIXKIT_WALK_URL || DEFAULT_WALK_URL;
  const result = await runChatgptReadWalk({ baseUrl, walkUrl });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = WALK_EXIT_CODES[result.status];
  if (result.status === WALK_STATUS.NEEDS_QUOTA) {
    console.error(
      "Walk skipped: anonymous AI read check daily budget exhausted from this network (needs-quota). Retry tomorrow; the offline regression lock still covers the assertions."
    );
  }
}

export async function runChatgptReadWalk({
  baseUrl = DEFAULT_BASE_URL,
  walkUrl = `${baseUrl}/fixture/rendered-page`,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const start = Date.now();
  const apiUrl = `${baseUrl}/api/chatgpt-read-check`;
  let response;
  try {
    response = await fetchWithTimeout(
      apiUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: walkUrl })
      },
      timeoutMs,
      fetcher
    );
  } catch (error) {
    return {
      status: WALK_STATUS.FAIL,
      apiUrl,
      walkUrl,
      checkedAt: new Date().toISOString(),
      reason: `Could not reach the walk endpoint: ${String(error?.message || error)}`
    };
  }

  const raw = await response.text().catch(() => "");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  if (response.status === 429) {
    return {
      status: WALK_STATUS.NEEDS_QUOTA,
      apiUrl,
      walkUrl,
      checkedAt: new Date().toISOString(),
      error: payload?.error || "Rate limited (429) by the anonymous AI read check quota.",
      resetAt: payload?.resetAt || null
    };
  }

  if (!response.ok) {
    return {
      status: WALK_STATUS.FAIL,
      apiUrl,
      walkUrl,
      checkedAt: new Date().toISOString(),
      httpStatus: response.status,
      error: payload?.error || `Walk endpoint returned HTTP ${response.status}.`,
      raw: raw.slice(0, 400)
    };
  }

  const failures = validateChatgptReadWalkPayload(payload);
  const record = failures.length === 0 ? walkRecord(payload) : null;
  return {
    status: failures.length === 0 ? WALK_STATUS.PASS : WALK_STATUS.FAIL,
    apiUrl,
    walkUrl,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    ...(record ? { proof: record } : {}),
    ...(failures.length > 0 ? { failures } : {})
  };
}

export function validateChatgptReadWalkPayload(payload) {
  const failures = [];
  if (!payload || typeof payload !== "object") return ["response is not a JSON object"];
  if (payload.ok !== true) failures.push("response does not report ok:true");
  if (payload.mode !== "ai-read-check") failures.push("response mode is not ai-read-check");
  if (typeof payload.checkedUrl !== "string" || payload.checkedUrl.length === 0) {
    failures.push("missing checkedUrl");
  }
  if (!Array.isArray(payload.bots) || payload.bots.length !== 3) {
    failures.push("bots is not a three-bot list");
  } else {
    const agents = payload.bots.map((bot) => bot.agent);
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot"]) {
      if (!agents.includes(agent)) failures.push(`bots is missing ${agent}`);
    }
    for (const bot of payload.bots) {
      if (typeof bot.allowed !== "boolean") failures.push(`bot ${bot.agent} has no boolean allowed`);
      if (typeof bot.rule !== "string") failures.push(`bot ${bot.agent} has no robots.txt rule evidence`);
    }
  }
  const content = payload.content;
  if (!content || typeof content !== "object") {
    failures.push("missing content evidence");
  } else {
    if (typeof content.wordCount !== "number") failures.push("content.wordCount is not a number");
    if (typeof content.hasMainContent !== "boolean") failures.push("content.hasMainContent is not a boolean");
  }
  const schema = payload.schema;
  if (!schema || typeof schema !== "object") {
    failures.push("missing schema evidence");
  } else {
    if (!Array.isArray(schema.types)) failures.push("schema.types is not an array");
    if (typeof schema.hasSchema !== "boolean") failures.push("schema.hasSchema is not a boolean");
  }
  const verdict = payload.verdict;
  if (!verdict || typeof verdict !== "object") {
    failures.push("missing verdict");
  } else {
    for (const key of ["status", "headline", "detail"]) {
      if (typeof verdict[key] !== "string" || verdict[key].length === 0) {
        failures.push(`verdict.${key} is missing`);
      }
    }
  }
  const unsupported = findUnsupportedClaims(payload);
  if (unsupported.length > 0) {
    failures.push(`unsupported result claims present: ${unsupported.join("; ")}`);
  }
  return failures;
}

const UNSUPPORTED_CLAIM =
  /\b(guarantees?|promises?|will\s+ensure)\s+(rankings?|traffic|indexing|revenue|AI citations?|answer[- ]engine visibility)/i;
const NEGATIONS = [
  /does not guarantee/gi,
  /do not guarantee/gi,
  /never guarantees?/gi,
  /no ranking promise/gi,
  /no ranking or traffic guarantee/gi,
  /not guarantee/gi,
  /does not promise/gi,
  /do not promise/gi,
  /never promises?/gi,
  /no ranking promises?/gi,
  /does not sample/gi,
  /do not sample/gi,
  /without ranking promises/gi,
  /no ranking or traffic promises?/gi
];

export function findUnsupportedClaims(payload) {
  const text = JSON.stringify(payload);
  const found = [];
  for (const match of text.matchAll(new RegExp(UNSUPPORTED_CLAIM.source, "gi"))) {
    const window = text.slice(Math.max(0, match.index - 120), match.index + match[0].length + 40);
    if (NEGATIONS.some((pattern) => pattern.test(window))) continue;
    found.push(match[0]);
  }
  return found;
}

export function walkRecord(payload) {
  return {
    checkedUrl: payload.checkedUrl,
    verdictStatus: payload.verdict?.status || null,
    verdictHeadline: payload.verdict?.headline || null,
    bots: payload.bots.map((bot) => ({
      agent: bot.agent,
      allowed: bot.allowed,
      rule: bot.rule
    })),
    staticWordCount: payload.content?.wordCount ?? null,
    schemaTypes: payload.schema?.types ?? [],
    robotsChecked: payload.robotsChecked === true
  };
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

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
