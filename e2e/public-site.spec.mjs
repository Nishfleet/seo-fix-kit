// The public site, end to end: every page in the sitemap, the shared header
// and footer, the homepage without JavaScript, pricing, the free check and
// the 404 page, on desktop and phone.
import { ROOT_PUBLIC_PATHS } from "../shared/audit-engine.js";
import { expect, test } from "./fixtures.mjs";

for (const path of ROOT_PUBLIC_PATHS) {
  test(`${path} renders one headline, shared chrome and no horizontal scroll`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page).toHaveTitle(/SEO Fix Kit/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^.{50,}$/);
    await expect(page.getByRole("banner").getByRole("link", { name: "Check a page free" })).toHaveAttribute(
      "href",
      /\/check$/
    );
    await expect(page.getByRole("contentinfo")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
  });
}

test.describe("homepage", () => {
  test("ships its content in the HTML, so it reads without JavaScript", async ({ request, browser }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("SEO fixes you can prove.");
    expect(html).toContain("What does the paid Fix Pack include?");

    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "SEO fixes you can prove." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Check a page free" }).first()).toBeVisible();
    await context.close();
  });

  test("keyboard users can skip the header", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hardware keyboard on the phone profile");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("the public site is light and the signed-in app stays dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.goto("/pricing");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.goto("/beta");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  });

  test("the product tour switches between real screens", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tablist", { name: "Product screens" });
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("img", { name: /report/ })).toBeVisible();
    await tabs.getByRole("tab", { name: /Every page/ }).click();
    await expect(tabs.getByRole("tab", { name: /Every page/ })).toHaveAttribute("aria-selected", "true");
    const screen = panel.getByRole("img", { name: /pages table/ });
    await screen.scrollIntoViewIfNeeded();
    await expect(screen).toBeVisible();
    expect(await screen.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("motion turns off for people who ask for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const animation = await page
      .getByRole("heading", { level: 1 })
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animation).toBe("none");
  });
});

test("share previews and icons resolve to real images", async ({ page, request }) => {
  await page.goto("/pricing");
  const shareImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  for (const path of [new URL(shareImage).pathname, "/apple-touch-icon.png", "/favicon.svg", "/favicon.ico"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toMatch(/^image\//);
  }
});

test.describe("site header", () => {
  for (const path of ["/", "/pricing"]) {
    test(`navigation works at every size on ${path}`, async ({ page, isMobile }) => {
      await page.goto(path);
      const header = page.getByRole("banner");
      const nav = header.getByRole("navigation", { name: "Main" });
      const menu = header.getByRole("button", { name: "Menu" });

      if (!isMobile) {
        await expect(menu).toBeHidden();
        await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
        return;
      }

      await expect(nav).toBeHidden();
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(nav).toBeHidden();

      await menu.click();
      await nav.getByRole("link", { name: "How it works" }).click();
      await expect(page).toHaveURL(/\/methodology$/);
    });
  }

  for (const path of ["/", "/pricing"]) {
    test(`the Product menu opens, links out and closes on ${path}`, async ({ page, isMobile }) => {
      await page.goto(path);
      const header = page.getByRole("banner");
      if (isMobile) await header.getByRole("button", { name: "Menu" }).click();
      const trigger = header.getByRole("button", { name: "Product" });
      const sample = header.getByRole("link", { name: /Sample report/ });
      await expect(sample).toBeHidden();
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(sample).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await sample.click();
      await expect(page).toHaveURL(/\/demo$/);
    });
  }

  for (const path of ["/", "/pricing"]) {
    test(`stays on screen while ${path} scrolls`, async ({ page }) => {
      await page.goto(path);
      await page.mouse.wheel(0, 2000);
      await expect(page.getByRole("banner")).toBeInViewport();
    });
  }
});

test.describe("pricing", () => {
  test("shows each plan by what it adds and compares them side by side", async ({ page }) => {
    await page.goto("/pricing");
    const plans = page.getByRole("region", { name: "Plans" }).getByRole("article");
    await expect(plans).toHaveCount(3);
    await expect(plans.nth(1)).toContainText("Most popular");
    await expect(plans.nth(1)).toContainText("Everything in Page check, plus:");
    await expect(plans.nth(2)).toContainText("Everything in Site audit, plus:");
    await expect(plans.nth(2)).toContainText("$99");
    await expect(page.getByRole("table")).toContainText("Rerun with a before/after proof receipt");

    await plans.nth(1).getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/#get-started$/);
    await expect(page.getByLabel("Work email")).toBeVisible();
  });
});

test.describe("free page check", () => {
  test("stops a URL that cannot be a public site before it is sent", async ({ page }) => {
    let sent = false;
    await page.route("**/api/public-check", (route) => {
      sent = true;
      return route.continue();
    });
    await page.goto("/check");
    await page.getByLabel("Public page URL").fill("localhost");
    await page.getByRole("button", { name: "Check this page" }).click();
    await expect(page.getByText("Enter a valid public website URL.")).toBeVisible();
    expect(sent).toBe(false);
  });

  test("shows the rendered proof, false alarms and fixes for a checked page", async ({ page }) => {
    // Rendering a third-party page needs Cloudflare Browser Rendering, which
    // only exists on Cloudflare; this answer has the shape the Worker returns.
    await page.route("**/api/public-check", (route) =>
      route.fulfill({
        json: {
          ok: true,
          checkedUrl: "https://example.com/",
          finalUrl: "https://example.com/",
          engineVersion: "e2e",
          scannedAt: "2026-10-12T00:00:00.000Z",
          measured: {
            staticWordCount: 41,
            renderedWordCount: 1284,
            renderedH1: "Example Domain",
            renderedTitle: "Example Domain",
            renderedInternalLinkCount: 12
          },
          guards: [
            {
              severity: "guard",
              title: "“Missing H1” is a false alarm",
              evidence: "The H1 appears once the page loads."
            }
          ],
          findings: [
            {
              severity: "warning",
              title: "Social preview image missing",
              why: "Shared links show no image.",
              fix: "Add an og:image tag.",
              proposedMarkup: '<meta property="og:image" content="https://example.com/og.png" />'
            }
          ],
          nextStep: "Create a free account to audit the whole site.",
          boundary: "One public page at one moment."
        }
      })
    );
    await page.goto("/check");
    await page.getByLabel("Public page URL").fill("example.com");
    await page.getByRole("button", { name: "Check this page" }).click();
    await expect(page.getByRole("heading", { name: "Rendered proof" })).toBeVisible();
    await expect(page.getByText("1284")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Social preview image missing" })).toBeVisible();
    await expect(page.locator("#result").getByRole("link", { name: "Create a free account" })).toHaveAttribute(
      "href",
      /\/beta$/
    );
  });
});

test.describe("404", () => {
  test("an unknown address answers 404 with a way back", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Nothing to fix here." })).toBeVisible();
    await expect(page.getByText("/this-page-does-not-exist")).toBeVisible();
    await page.getByRole("link", { name: "Go to homepage" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "SEO fixes you can prove." })).toBeVisible();
  });
});
