// The free tools at /tools/*: they work as you type, copy and download their
// output, show only the fields that apply, and keep checklist ticks.
import { FREE_TOOLS } from "../shared/free-tools/catalog.js";
import { expect, test } from "./fixtures.mjs";

test("the tools index links to every tool and the header links to the index", async ({ page, isMobile }) => {
  await page.goto("/pricing");
  const header = page.getByRole("banner");
  if (isMobile) await header.getByRole("button", { name: "Menu" }).click();
  await header.getByRole("link", { name: "Free tools" }).click();
  await expect(page).toHaveURL(/\/tools$/);
  const main = page.getByRole("main");
  for (const tool of FREE_TOOLS) {
    await expect(main.locator(`a[href$="/tools/${tool.slug}"]`).first()).toBeVisible();
  }
});

test("the meta tag generator updates as you type and copies the result", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "clipboard permissions are desktop-only in Playwright");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tools/meta-tags");
  const output = page.locator("[data-tool-output]");
  await expect(output.getByText("Ready to use")).toBeVisible();

  await page.getByLabel("Page title").fill("A very long page title that keeps going well past what Google will show");
  await expect(output.getByText(/Over 60 usually gets cut off/)).toBeVisible();
  await expect(output.locator("[data-code]")).toContainText("A very long page title");

  await page.getByLabel("Canonical URL").fill("/relative");
  await expect(output.getByText(/1 thing to fix/)).toBeVisible();

  await output.getByRole("button", { name: "Copy" }).click();
  await expect(output.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("<title>A very long page title");
});

test("Clear empties the form and Example brings the sample back", async ({ page }) => {
  await page.goto("/tools/utm-builder");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Page URL")).toHaveValue("");
  await expect(page.locator("[data-tool-output]").getByText(/Add the full page address/)).toBeVisible();
  await page.getByRole("button", { name: "Example" }).click();
  await expect(page.locator("[data-tool-output] [data-code]")).toContainText("utm_campaign=autumn-trail-sale");
});

test("the schema generator shows only the fields for the chosen type", async ({ page }) => {
  await page.goto("/tools/schema");
  await expect(page.getByLabel("Street address")).toBeVisible();
  await expect(page.getByLabel("Price", { exact: true })).toBeHidden();
  await page.getByLabel("Type", { exact: true }).selectOption("Product");
  await expect(page.getByLabel("Price", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Street address")).toBeHidden();
  await page.getByLabel("Price", { exact: true }).fill("49.00");
  await expect(page.locator("[data-tool-output] [data-code]")).toContainText('"price": "49.00"');
});

test("the robots.txt tester gives a verdict and the rule behind it", async ({ page }) => {
  await page.goto("/tools/robots-txt-tester");
  const verdict = page.locator(".verdict");
  await expect(verdict).toContainText("Allowed");
  await page.getByLabel("URL or path").fill("/checkout/pay");
  await expect(verdict).toContainText("Blocked: Googlebot may not crawl /checkout/pay");
  await expect(verdict).toContainText("Disallow: /checkout");
  await page.getByLabel("Crawler").selectOption("GPTBot");
  await page.getByLabel("URL or path").fill("/");
  await expect(verdict).toContainText("User-agent: gptbot");
});

test("generated files download with their real name", async ({ page, isMobile }) => {
  test.skip(isMobile, "downloads are checked once, on desktop");
  await page.goto("/tools/robots-txt");
  const download = page.waitForEvent("download");
  await page.locator("[data-tool-output]").getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("robots.txt");
});

test("checklist ticks survive a reload and can be cleared", async ({ page }) => {
  await page.goto("/tools/seo-checklist");
  const first = page.getByRole("checkbox").first();
  await first.check();
  await expect(page.locator("[data-done]")).toHaveText("1");
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Clear ticks" }).click();
  await expect(page.locator("[data-done]")).toHaveText("0");
});

test("tools read without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/tools/serp-preview");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Free Google SERP preview tool");
  await expect(page.locator(".serp-title").first()).toContainText("Trail Running Shoes");
  await context.close();
});
