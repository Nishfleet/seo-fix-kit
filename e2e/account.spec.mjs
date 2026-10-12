// Signing up, signing in and moving around the signed-in app, end to end
// against the real Worker and database: the email a user would receive is
// read back from the test server and its link opened in the browser.
import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

const SECTIONS = ["Overview", "Reports", "Sites", "Developers", "Billing"];

async function openAppNav(page, isMobile) {
  const nav = page.getByRole("navigation", { name: "App" });
  if (isMobile) await nav.scrollIntoViewIfNeeded();
  return nav;
}

test("a new visitor signs up from the homepage and lands in their workspace", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "signup");
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(page.getByText(/check your (email|inbox)/i)).toBeVisible();

  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page).toHaveURL(/\/beta$/);
});

test("a returning user signs in, visits every section and signs out", async ({ page, request, isMobile }, testInfo) => {
  const email = uniqueEmail(testInfo, "returning");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/check your (email|inbox)/i)).toBeVisible();

  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  if (!isMobile) await expect(page.locator(".app-account-email")).toHaveText(email);

  for (const section of SECTIONS) {
    const nav = await openAppNav(page, isMobile);
    await nav.getByRole("link", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(nav.getByRole("link", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await page.goto("/beta/reports");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("a used sign-in link cannot sign anyone in again", async ({ page, request, browser }, testInfo) => {
  const email = uniqueEmail(testInfo, "once");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = await signInLinkFor(request, email);
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(link);
  await expect(strangerPage.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect(strangerPage.getByRole("heading", { level: 1, name: "Overview" })).toHaveCount(0);
  await stranger.close();
});

test("a report lists every problem and jumps from the top fixes to the proof", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "report");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

  // The Fix Pack price comes live from Dodo, which the test server cannot reach.
  await page.route("**/api/pricing-preview", (route) =>
    route.fulfill({ json: { pricing: { displayPrice: "$49", currency: "USD" } } })
  );
  const { id } = await (await request.post("/__e2e/reports", { data: { ownerEmail: email } })).json();
  await page.goto(`/beta/reports/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "acme-widgets.example" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All problems (6)" })).toBeVisible();

  const rows = page.locator(".finding-list > details");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute("open", "");
  await expect(rows.nth(1).getByText("Evidence", { exact: true })).toBeHidden();

  await page.getByRole("link", { name: "Missing H1 on /pricing" }).click();
  const target = page.locator("details", { has: page.getByRole("heading", { name: "Missing H1 on /pricing" }) });
  await expect(target).toHaveAttribute("open", "");
  await expect(target.getByText("Evidence", { exact: true })).toBeInViewport();
});
