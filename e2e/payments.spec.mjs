import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

test("an owner buys a Fix Pack from a report and sees the payment confirmed", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "buyer");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const { id } = await (await request.post("/__e2e/reports", { data: { ownerEmail: email } })).json();

  await page.route("https://test.dodopayments.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Dodo checkout</title><h1>Dodo test checkout</h1>"
    })
  );
  await page.goto(`/beta/reports/${id}`);
  const fixPack = page.locator(".paid-panel");
  await expect(fixPack.getByText("$99.00")).toBeVisible();
  await expect(fixPack.getByText("Download with the Fix Pack")).toBeVisible();
  await expect(fixPack.getByText("Every fix in one checklist: 2 problems, most important first")).toBeVisible();
  expect((await page.request.get(`/api/reports/${id}/fix-kit.zip`)).status()).toBe(402);
  await fixPack.getByRole("button", { name: "Buy Fix Pack" }).click();
  await expect(page).toHaveURL(/^https:\/\/test\.dodopayments\.com\/session\/cs_e2e_\d+$/);
  await expect(page.getByRole("heading", { name: "Dodo test checkout" })).toBeVisible();

  const paid = await (await request.post("/__e2e/dodo/pay", { data: { ownerEmail: email } })).json();
  expect(paid).toMatchObject({ received: true, paid: true });

  await page.goto(`/beta/reports/${id}?checkout=return&fixRequestId=${paid.fixRequestId}`);
  await expect(page.getByText("Payment confirmed").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download fix files (.zip)" }).click();
  expect((await download).suggestedFilename()).toBe("seo-fix-kit-acme-widgets-example.zip");

  await page.goto("/beta/billing");
  const fixPacks = page.locator("section", { has: page.getByRole("heading", { name: "Fix Packs" }) });
  await expect(fixPacks.getByRole("heading", { name: "acme-widgets.example" })).toBeVisible();
  await expect(fixPacks.getByText("Payment confirmed").first()).toBeVisible();
});
