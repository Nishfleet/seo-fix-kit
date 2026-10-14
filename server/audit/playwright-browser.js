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

function wrapPage(page) {
  return {
    goto: (url, options = {}) =>
      page.goto(url, {
        ...options,
        waitUntil: WAIT_UNTIL_MAP[options.waitUntil] || options.waitUntil || "load"
      }),
    route: (pattern, handler) => page.route(pattern, handler),
    evaluate: (pageFunction, ...args) => page.evaluate(pageFunction, ...args),
    // puppeteer-only; playwright sets the user agent at context creation.
    setUserAgent: async () => {},
    close: () => page.close()
  };
}
