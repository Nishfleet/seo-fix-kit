import { ROOT_PUBLIC_PATHS } from "../shared/audit-engine.js";
import { APP_SECTIONS } from "../src/lib/app-sections.js";
import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

const NARROW = { width: 320, height: 640 };

test.use({ viewport: NARROW });
test.skip(({ isMobile }) => !isMobile, "one phone run is enough");

function offScreenElements(page) {
  return page.evaluate(() => {
    const screenWidth = document.documentElement.clientWidth;
    const scrollsSideways = (element) => {
      const style = getComputedStyle(element);
      return ["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
    };
    const loopsForever = (element) => getComputedStyle(element).animationIterationCount === "infinite";
    const meantToLeaveTheScreen = (element) => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (loopsForever(node) || (node !== element && scrollsSideways(node))) return true;
      }
      return false;
    };
    const describe = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].map((name) => `.${name}`).join("");
      const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${element.tagName.toLowerCase()}${id}${classes} "${text}"`;
    };
    const offenders = [];
    for (const element of document.body.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (rect.right <= screenWidth + 1 && rect.left >= -1) continue;
      if (rect.right <= 0) continue;
      if (getComputedStyle(element).visibility === "hidden") continue;
      if (element.closest("[inert], [aria-hidden='true']")) continue;
      if (meantToLeaveTheScreen(element)) continue;
      offenders.push(`${describe(element)} spans ${Math.round(rect.left)}..${Math.round(rect.right)}px`);
    }
    return {
      screenWidth,
      pageWidth: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 10)
    };
  });
}

async function expectFitsOnScreen(page) {
  const { screenWidth, pageWidth, offenders } = await offScreenElements(page);
  expect(pageWidth, "the page scrolls sideways").toBeLessThanOrEqual(screenWidth);
  expect(offenders, "elements reach past the screen edge, so they are cut off").toEqual([]);
}

for (const path of ROOT_PUBLIC_PATHS) {
  test(`${path} fits a 320px screen`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expectFitsOnScreen(page);
  });
}

test("every signed-in section and a report fit a 320px screen", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "narrow");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

  await page.route("**/api/pricing-preview", (route) =>
    route.fulfill({ json: { pricing: { displayPrice: "$49", currency: "USD" } } })
  );
  const { id } = await (await request.post("/__e2e/reports", { data: { ownerEmail: email } })).json();

  for (const path of [...APP_SECTIONS.map((section) => section.path), `/beta/reports/${id}`]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".app-loading, [aria-busy='true']")).toHaveCount(0);
      await expectFitsOnScreen(page);
    });
  }
});
