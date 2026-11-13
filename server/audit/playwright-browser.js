import { chromium } from "playwright";

const WAIT_UNTIL_MAP = {
  networkidle0: "networkidle",
  networkidle2: "networkidle",
  domcontentloaded: "domcontentloaded",
  load: "load"
};

export async function launchAuditBrowser() {
  const browser = await chromium.launch({ headless: true });
  return {
    async newPage() {
      const page = await browser.newPage();
      return wrapPage(page);
    },
    close: () => browser.close()
  };
}

/** @typedef {"load" | "domcontentloaded" | "networkidle" | "commit"} WaitUntilState */

/** @param {import("playwright").Page} page
 * @returns {{ goto: (url: string, options?: { waitUntil?: string }) => Promise<unknown>, route: (pattern: string, handler: (route: import("playwright").Route, request: import("playwright").Request) => unknown) => Promise<unknown>, evaluate: (pageFunction: (arg: unknown) => unknown, ...args: unknown[]) => Promise<unknown>, close: () => Promise<void> }}
 */
function wrapPage(page) {
  return {
    goto: (url, options = {}) =>
      page.goto(url, {
        ...options,
        waitUntil: /** @type {WaitUntilState} */ (
          WAIT_UNTIL_MAP[/** @type {keyof typeof WAIT_UNTIL_MAP} */ (options.waitUntil || "load")] ||
            options.waitUntil ||
            "load"
        )
      }),
    route: (pattern, handler) => page.route(pattern, handler),
    evaluate: (pageFunction, ...args) => page.evaluate(pageFunction, ...args),
    close: () => page.close()
  };
}
