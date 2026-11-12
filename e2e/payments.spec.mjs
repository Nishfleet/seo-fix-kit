import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

test("a fresh owner downloads the fix files from a report without paying", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "fixfiles");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const { id } = await (await request.post("/__e2e/reports", { data: { ownerEmail: email } })).json();

  await page.goto(`/beta/reports/${id}`);
  const fixFiles = page.locator(".paid-panel");
  await expect(fixFiles.getByText("Get every fix ready to ship — free")).toBeVisible();
  await expect(page.getByText("Every fix in one checklist: 2 problems, most important first")).toBeVisible();

  // No price and no checkout anywhere on the report page.
  const reportText = await page.locator("body").innerText();
  expect(reportText).not.toMatch(/\$\d/);
  expect(reportText).not.toContain("Buy Fix Pack");

  // The fix files download free, with no payment step.
  const zip = await page.request.get(`/api/reports/${id}/fix-kit.zip`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download fix files (.zip)" }).first().click();
  expect((await download).suggestedFilename()).toBe("seo-fix-kit-acme-widgets-example.zip");

  await page.goto("/beta/billing");
  await expect(page.getByRole("heading", { name: "Fix files" })).toBeVisible();
  await expect(page.locator(".billing-price")).toHaveText("Free");
  await expect(page.getByText("No Fix Packs yet")).toBeVisible();
});
