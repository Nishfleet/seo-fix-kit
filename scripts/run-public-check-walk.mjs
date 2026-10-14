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
  const result = await runPublicCheckWalk({ baseUrl, walkUrl });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = WALK_EXIT_CODES[result.status];
  if (result.status === WALK_STATUS.NEEDS_QUOTA) {
    console.error(
      "Walk skipped: anonymous-check daily budget exhausted from this network (needs-quota). Retry tomorrow; the offline regression lock still covers the assertions."
    );
  }
}

export async function runPublicCheckWalk({
  baseUrl = DEFAULT_BASE_URL,
  walkUrl = `${baseUrl}/fixture/rendered-page`,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const start = Date.now();
  const apiUrl = `${baseUrl}/api/public-check`;
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
      error: payload?.error || "Rate limited (429) by the anonymous-check quota.",
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

  const failures = validateWalkPayload(payload);
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

export function validateWalkPayload(payload) {
  const failures = [];
  if (!payload || typeof payload !== "object") return ["response is not a JSON object"];
  if (payload.ok !== true) failures.push("response does not report ok:true");
  if (payload.mode !== "one-page-check") failures.push("response mode is not one-page-check");
  if (typeof payload.checkedUrl !== "string" || payload.checkedUrl.length === 0) {
    failures.push("missing checkedUrl");
  }
  if (typeof payload.engineVersion !== "string" || payload.engineVersion.length === 0) {
    failures.push("missing engineVersion");
  }
  const measured = payload.measured;
  if (!measured || typeof measured !== "object") {
    failures.push("missing measured proof fields");
  } else {
    for (const key of [
      "staticWordCount",
      "renderedWordCount",
      "renderedH1",
      "renderedTitle",
      "renderedInternalLinkCount"
    ]) {
      if (!(key in measured)) failures.push(`missing measured.${key}`);
    }
    if (typeof measured.staticWordCount !== "number" || typeof measured.renderedWordCount !== "number") {
      failures.push("measured word counts are not numbers");
    }
  }
  const issues = payload.issues;
  if (!issues || typeof issues !== "object") {
    failures.push("missing issues counts");
  } else {
    for (const key of ["critical", "warnings", "notices", "guardedFalsePositives"]) {
      if (typeof issues[key] !== "number") failures.push(`issues.${key} is not a number`);
    }
  }
  if (!Array.isArray(payload.guards)) failures.push("guards is not an array");
  if (!Array.isArray(payload.findings)) failures.push("findings is not an array");
  if (typeof payload.nextStep !== "string" || !payload.nextStep.includes("create a free account")) {
    failures.push("nextStep does not hand off into a free account");
  }
  if (typeof payload.boundary !== "string" || !payload.boundary.includes("does not guarantee rankings")) {
    failures.push("boundary does not keep the no-ranking promise");
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
  /not promise/gi,
  /no ranking, traffic, indexing, revenue, AI citations/gi
];

export function findUnsupportedClaims(payload) {
  const text = JSON.stringify(payload);
  let remaining = text;
  for (const negation of NEGATIONS) remaining = remaining.replace(negation, " ");
  const matches = remaining.match(new RegExp(UNSUPPORTED_CLAIM.source, "gi")) || [];
  return [...new Set(matches.map((match) => match.trim()))];
}

export function walkRecord(payload) {
  return {
    checkedUrl: payload.checkedUrl,
    finalUrl: payload.finalUrl || payload.checkedUrl,
    scannedAt: payload.scannedAt || "",
    engineVersion: payload.engineVersion,
    measured: payload.measured,
    issues: payload.issues,
    guards: (payload.guards || []).map((guard) => ({ severity: guard.severity, title: guard.title })),
    findings: (payload.findings || []).map((finding) => ({ severity: finding.severity, title: finding.title })),
    nextStep: payload.nextStep,
    boundary: payload.boundary
  };
}

async function fetchWithTimeout(url, options, timeoutMs, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

if (isDirectRun()) {
  await main();
}
