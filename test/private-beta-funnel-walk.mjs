import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = process.env.SEOFIXKIT_BASE_URL || "https://seofixkit.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SEOFIXKIT_FUNNEL_WALK_TIMEOUT_MS || 120000);

export const WALK_STATUS = {
  PASS: "pass",
  FAIL: "fail"
};

export const WALK_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  {
    name: "mobile",
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    userAgent: mobileUserAgent()
  }
];

// Playwright silently ignores unknown top-level context options, so width and height must sit under `viewport`.
export function buildContextOptions({ width, height, isMobile = false, hasTouch = false, userAgent = "" } = {}) {
  const options = {
    viewport: { width, height },
    isMobile,
    hasTouch
  };
  if (userAgent) options.userAgent = userAgent;
  return options;
}

export const WALK_EXIT_CODES = { pass: 0, fail: 1, error: 2 };

export const FUNNEL_STOPS = [
  {
    path: "/",
    name: "home",
    acceptStatuses: [200],
    titlePattern: /SEO Fix Kit - The SEO audit that checks its own work/,
    copyChecks: [
      { match: "Now in private beta", reason: "home keeps the locked private-beta copy" },
      { match: "Start free", reason: "home keeps the one-use email link CTA" },
      { match: "for site owners and founders", reason: "home names the intended buyer", ignoreCase: true }
    ],
    expectedLinks: ["/demo", "/methodology", "/pricing", "/check"],
    accessForm: true
  },
  {
    path: "/demo",
    name: "demo",
    acceptStatuses: [200],
    titlePattern: /Sample Report - SEO Fix Kit/,
    canonical: "/demo",
    copyChecks: [
      { match: "false positive", reason: "demo shows the guarded-false-positive proof boundary", ignoreCase: true },
      { match: "sample", reason: "demo stays a sample, not an anonymous audit", ignoreCase: true }
    ],
    expectedLinks: ["/", "/pricing", "/check"]
  },
  {
    path: "/pricing",
    name: "pricing",
    acceptStatuses: [200],
    titlePattern: /Pricing - SEO Fix Kit/,
    canonical: "/pricing",
    copyChecks: [
      { match: "Compare plans", reason: "pricing shows the plan comparison" },
      { match: "No ranking or traffic guarantee", reason: "pricing keeps the no-ranking boundary" }
    ],
    expectedLinks: ["/", "/check", "/support"]
  }
];

export const ACCESS_FORM_EXPECTATIONS = {
  emailSelector: "#email",
  emailType: "email",
  emailRequired: true,
  companySelector: "#company",
  companyTabIndex: "-1",
  companyAutocomplete: "off",
  submitLabel: "Start free"
};

const BENIGN_REQUEST_FAILURES = [/cdn-cgi\/rum/i, /static\.cloudflareinsights\.com/i];

async function main() {
  const baseUrl = DEFAULT_BASE_URL;
  try {
    const result = await runPrivateBetaFunnelWalk({ baseUrl, timeoutMs: DEFAULT_TIMEOUT_MS });
    console.log(JSON.stringify(result, null, 2));
    console.log("\n" + funnelWalkSummary(result));
    process.exitCode = WALK_EXIT_CODES[result.status];
  } catch (error) {
    console.error(`Funnel walk could not run: ${String(error?.message || error)}`);
    process.exitCode = WALK_EXIT_CODES.error;
  }
}

export async function runPrivateBetaFunnelWalk({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  browser = null
}) {
  const start = Date.now();
  const { chromium } = await import("playwright");
  const launched = browser || (await chromium.launch({ headless: true }));

  const stops = [];
  const failures = [];
  let consoleErrors = [];
  let requestFailures = [];
  let accessRequest = null;

  try {
    for (const viewport of WALK_VIEWPORTS) {
      const context = await launched.newContext(buildContextOptions(viewport));
      const page = await context.newPage();
      const appliedViewport = page.viewportSize();
      if (!appliedViewport || appliedViewport.width !== viewport.width || appliedViewport.height !== viewport.height) {
        failures.push(
          `${viewport.name} viewport did not apply: context reports ${JSON.stringify(appliedViewport)} instead of ${viewport.width}x${viewport.height}; this walk is not measuring the viewport it claims`
        );
        await context.close();
        continue;
      }
      const scopedConsoleErrors = [];
      const scopedRequestFailures = [];
      page.on("console", (message) => {
        if (message.type() === "error") scopedConsoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => scopedConsoleErrors.push(String(error?.message || error)));
      page.on("requestfailed", (request) => {
        const url = request.url();
        if (!BENIGN_REQUEST_FAILURES.some((pattern) => pattern.test(url))) {
          scopedRequestFailures.push({ url, error: String(request.failure()?.errorText || "failed") });
        }
      });

      for (const stop of FUNNEL_STOPS) {
        const evidence = await walkStop({
          baseUrl,
          stop,
          page,
          timeoutMs,
          viewport: viewport.name,
          appliedViewport: { width: viewport.width, height: viewport.height }
        });
        stops.push(evidence);
        const stopFailures = evaluateStopEvidence(evidence);
        if (stopFailures.length > 0) {
          failures.push(...stopFailures.map((reason) => `${viewport.name} ${stop.path}: ${reason}`));
        }
        if (viewport.name === "desktop" && stop.path === "/" && stop.accessForm) {
          accessRequest = {
            mode: "observe",
            submitted: false,
            route: "/",
            form: stop.accessForm,
            note: "Access request form inspected but not submitted: observe mode only, no waitlist lead or access token created."
          };
        }
      }

      consoleErrors.push(...scopedConsoleErrors.map((text) => ({ viewport: viewport.name, message: text })));
      requestFailures.push(...scopedRequestFailures.map((failure) => ({ viewport: viewport.name, ...failure })));
      await context.close();
    }
  } finally {
    if (!browser) await launched.close().catch(() => {});
  }

  if (consoleErrors.length > 0) {
    failures.push(
      `console/page errors on ${consoleErrors.length} event(s): ${consoleErrors
        .map((entry) => entry.message)
        .slice(0, 3)
        .join(" | ")}`
    );
  }
  if (requestFailures.length > 0) {
    failures.push(
      `non-benign request failures on ${requestFailures.length} resource(s): ${requestFailures
        .map((failure) => failure.url)
        .slice(0, 3)
        .join(" | ")}`
    );
  }

  const status = failures.length === 0 ? WALK_STATUS.PASS : WALK_STATUS.FAIL;
  return {
    status,
    baseUrl,
    walkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    viewports: ["desktop", "mobile"],
    stops,
    consoleErrors,
    requestFailures,
    accessRequest,
    failures
  };
}

function mobileUserAgent() {
  return (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  );
}

async function walkStop({ baseUrl, stop, page, timeoutMs, viewport, appliedViewport = null }) {
  const path = stop.path;
  const response = await page
    .goto(`${baseUrl}${path}`, {
      waitUntil: "networkidle",
      timeout: timeoutMs
    })
    .catch((error) => ({ status: () => 0, error: String(error?.message || error) }));

  await page.waitForTimeout(500);

  const httpStatus = typeof response.status === "function" ? response.status() : 0;
  const finalUrl = page.url();

  const pageState = await page
    .evaluate(() => {
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      const bodyText = document.body ? document.body.innerText : "";
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href) => href && !href.startsWith("#") && !/^(mailto:|tel:|javascript:)/i.test(href));
      // Mobile browsers inflate window.innerWidth to the overflowing content width, so compare against the layout viewport.
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const innerWidth = window.innerWidth;
      const emailInput = document.querySelector("#email");
      const companyInput = document.querySelector("#company");
      const submitButton = Array.from(document.querySelectorAll("button[type='submit']")).find(
        (button) => (button.textContent || "").trim() === "Email access link"
      );
      return {
        title: document.title,
        canonical: canonicalLink ? canonicalLink.getAttribute("href") : "",
        bodyText,
        anchors: [...new Set(anchors)],
        scrollWidth,
        clientWidth,
        innerWidth,
        accessForm: {
          emailPresent: Boolean(emailInput),
          emailType: emailInput ? emailInput.getAttribute("type") : null,
          emailRequired: emailInput ? emailInput.hasAttribute("required") : false,
          companyPresent: Boolean(companyInput),
          companyTabIndex: companyInput ? companyInput.getAttribute("tabindex") : null,
          companyAutocomplete: companyInput ? companyInput.getAttribute("autocomplete") : null,
          submitPresent: Boolean(submitButton),
          submitLabel: submitButton ? submitButton.textContent.trim() : null
        }
      };
    })
    .catch((error) => ({
      title: "",
      canonical: "",
      bodyText: "",
      anchors: [],
      scrollWidth: 0,
      clientWidth: 0,
      innerWidth: 0,
      accessForm: null,
      walkerError: String(error?.message || error)
    }));

  const brokenLinks = await checkLinksLive({ baseUrl, anchors: pageState.anchors, timeoutMs });
  const horizontalOverflow = pageState.scrollWidth > pageState.clientWidth + 1;

  const copyChecks = stop.copyChecks.map((check) => ({
    match: check.match,
    present: hasContent(pageState.bodyText, check.match, check.ignoreCase)
  }));

  const expectedLinks = stop.expectedLinks.map((href) => ({
    href,
    present: pageState.anchors.some((anchor) => samePathname(anchor, href, baseUrl))
  }));

  const accessForm =
    stop.accessForm && pageState.accessForm
      ? {
          emailPresent: pageState.accessForm.emailPresent,
          emailType: pageState.accessForm.emailType,
          emailRequired: pageState.accessForm.emailRequired,
          companyPresent: pageState.accessForm.companyPresent,
          companyTabIndex: pageState.accessForm.companyTabIndex,
          companyAutocomplete: pageState.accessForm.companyAutocomplete,
          submitPresent: pageState.accessForm.submitPresent,
          submitLabel: pageState.accessForm.submitLabel
        }
      : null;

  return {
    path,
    name: stop.name,
    viewport,
    appliedViewport,
    httpStatus,
    finalUrl,
    title: pageState.title,
    canonical: pageState.canonical,
    copyChecks,
    expectedLinks,
    brokenLinks,
    horizontalOverflow: {
      scrollWidth: pageState.scrollWidth,
      clientWidth: pageState.clientWidth,
      innerWidth: pageState.innerWidth,
      overflow: horizontalOverflow
    },
    accessForm,
    walkerError: pageState.walkerError || (response.error ? response.error : null)
  };
}

async function checkLinksLive({ baseUrl, anchors, timeoutMs }) {
  const origin = new URL(baseUrl).origin;
  const unique = [...new Set(anchors)].filter((href) => href.startsWith("/") || href.startsWith(origin));
  const broken = [];
  const checked = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.all(
      unique.map(async (href) => {
        const url = href.startsWith("/") ? `${origin}${href}` : href;
        try {
          const probe = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal
          });
          checked.push({ href, status: probe.status });
          if (probe.status !== 200) {
            broken.push({ href, status: probe.status });
          }
        } catch (error) {
          broken.push({ href, status: null, error: String(error?.message || error) });
        }
      })
    );
  } finally {
    clearTimeout(timer);
  }
  return { checked, broken };
}

export function evaluateStopEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== "object") return ["missing stop evidence"];

  const stop = FUNNEL_STOPS.find((candidate) => candidate.path === evidence.path);
  if (!stop) return [`unknown stop path ${evidence.path}`];

  if (!stop.acceptStatuses.includes(evidence.httpStatus)) {
    failures.push(`returned HTTP ${evidence.httpStatus} instead of ${stop.acceptStatuses.join(" or ")}`);
  }
  if (typeof evidence.title !== "string" || !stop.titlePattern.test(evidence.title)) {
    failures.push(`title ${JSON.stringify(evidence.title || "")} does not match ${stop.titlePattern}`);
  }
  if (stop.canonical) {
    const canonicalMatches =
      typeof evidence.canonical === "string" &&
      (evidence.canonical === stop.canonical ||
        evidence.canonical === `${DEFAULT_BASE_URL}${stop.canonical}` ||
        evidence.canonical.endsWith(stop.canonical));
    if (!canonicalMatches) {
      failures.push(`canonical ${JSON.stringify(evidence.canonical || "")} is not ${stop.canonical}`);
    }
  }
  for (const check of stop.copyChecks || []) {
    const checkResult = (evidence.copyChecks || []).find((record) => record.match === check.match);
    if (!checkResult || checkResult.present !== true) {
      failures.push(check.reason || `missing copy ${check.match}`);
    }
  }
  for (const link of stop.expectedLinks || []) {
    const linkResult = (evidence.expectedLinks || []).find((record) => record.href === link);
    if (!linkResult || linkResult.present !== true) {
      failures.push(`missing expected link ${link}`);
    }
  }
  for (const broken of evidence.brokenLinks?.broken || []) {
    failures.push(`broken internal link ${broken.href} (${broken.status ?? broken.error})`);
  }
  if (evidence.horizontalOverflow?.overflow === true) {
    failures.push(
      `horizontal scroll on ${evidence.viewport}: scrollWidth ${evidence.horizontalOverflow.scrollWidth} > clientWidth ${evidence.horizontalOverflow.clientWidth}`
    );
  }
  if (stop.accessForm) {
    if (!evidence.accessForm) {
      failures.push("access request form not found");
    } else {
      const form = evidence.accessForm;
      if (
        form.emailPresent !== true ||
        form.emailType !== ACCESS_FORM_EXPECTATIONS.emailType ||
        form.emailRequired !== true
      ) {
        failures.push("access request email input missing or not a required email field");
      }
      if (form.companyPresent !== true || form.companyTabIndex !== "-1" || form.companyAutocomplete !== "off") {
        failures.push("access request company honeypot missing or not hidden");
      }
      if (form.submitPresent !== true || form.submitLabel !== ACCESS_FORM_EXPECTATIONS.submitLabel) {
        failures.push("access request submit CTA missing or not labeled 'Email access link'");
      }
    }
  }
  if (evidence.walkerError) {
    failures.push(`page state unavailable: ${evidence.walkerError}`);
  }
  return failures;
}

export function funnelWalkSummary(result) {
  if (!result || !Array.isArray(result.stops)) return "Funnel walk produced no stops.";
  const perStop = {};
  for (const evidence of result.stops) {
    const failures = evaluateStopEvidence(evidence);
    perStop[`${evidence.viewport} ${evidence.path}`] = failures.length === 0 ? "ok" : `FAIL: ${failures.join("; ")}`;
  }
  const lines = [
    `Private-beta funnel walk ${result.status} (${result.baseUrl}, walkedAt ${result.walkedAt || ""})`,
    ...Object.entries(perStop).map(([stop, state]) => `  ${stop}: ${state}`)
  ];
  if (result.accessRequest) {
    lines.push(
      `  access request: ${result.accessRequest.mode} mode, form ${result.accessRequest.form ? "inspected" : "missing"} (${result.accessRequest.note})`
    );
  }
  if (result.consoleErrors?.length) {
    lines.push(`  console/page errors: ${result.consoleErrors.length}`);
    for (const entry of result.consoleErrors.slice(0, 5)) lines.push(`    ${entry.viewport}: ${entry.message}`);
  } else {
    lines.push("  console/page errors: none");
  }
  if (result.requestFailures?.length) {
    lines.push(`  non-benign request failures: ${result.requestFailures.length}`);
  } else {
    lines.push("  non-benign request failures: none");
  }
  lines.push(
    `  stops: ${result.stops.length} (${[...new Set(result.stops.map((stop) => stop.name))].join(" → ")}) across viewports ${(result.viewports || []).join(", ")}`
  );
  return lines.join("\n");
}

function hasContent(text, match, ignoreCase = false) {
  if (typeof text !== "string") return false;
  return ignoreCase ? text.toLowerCase().includes(match.toLowerCase()) : text.includes(match);
}

export function samePathname(anchor, expectedPath, baseUrl) {
  if (typeof anchor !== "string" || typeof expectedPath !== "string") return false;
  try {
    const resolved = new URL(anchor, baseUrl);
    const expected = new URL(expectedPath, baseUrl);
    if (resolved.host !== expected.host) return false;
    return resolved.pathname === expected.pathname;
  } catch {
    return false;
  }
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || "").href;
}

if (isDirectRun()) {
  await main();
}
