import fs from "node:fs";
import { buildPublicCheckResponse } from "../worker/routes/public-check.js";
import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

const report = JSON.parse(fs.readFileSync(new URL("./fixtures/report.json", import.meta.url), "utf8"));

const checkedPage = {
  ...report,
  pagesScanned: 1,
  pages: [
    {
      url: report.url,
      finalUrl: report.url,
      static: { wordCount: 38 },
      rendered: {
        finalUrl: report.url,
        title: "Acme Widgets | Durable widgets for small workshops",
        h1s: ["Durable widgets for small workshops"],
        wordCount: 1284,
        internalLinks: [{ href: "/pricing" }, { href: "/about" }]
      }
    }
  ]
};

test("a stranger buys a Fix Pack from the free check without retyping the page", async ({
  page,
  request
}, testInfo) => {
  const email = uniqueEmail(testInfo, "stranger");
  const steps = [];
  let since = Date.now();
  const mark = (step) => {
    steps.push({ step, seconds: Number(((Date.now() - since) / 1000).toFixed(1)) });
    since = Date.now();
  };

  await page.route("**/api/public-check", (route) => route.fulfill({ json: buildPublicCheckResponse(checkedPage) }));

  await page.goto("/check");
  await page.getByLabel("Public page URL").fill(checkedPage.url);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Check this page" }).click();
  const result = page.locator("#result");
  await expect(result.getByRole("heading", { name: "acme-widgets.example" })).toBeVisible();
  mark("free check: one page scored");

  const handoff = result.getByRole("link", { name: "Get the full report for acme-widgets.example" });
  await expect(handoff).toHaveAttribute("href", `/beta?url=${encodeURIComponent(checkedPage.url)}`);
  mark("next step shown above the detail");

  await handoff.click();
  await expect(page.getByLabel("Email")).toBeVisible();
  mark("handoff into sign-up");

  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await signInLinkFor(request, email));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  mark("sign up and sign in");

  await expect(page.locator("#audit-url")).toHaveValue(checkedPage.url);
  mark("audit prefilled from the check");

  const { id } = await (await request.post("/__e2e/reports", { data: { ownerEmail: email } })).json();
  await page.route("**/api/audit", (route) =>
    route.fulfill({ json: { ...report, id, reportPath: `/beta/reports/${id}` } })
  );
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page).toHaveURL(new RegExp(`/beta/reports/${id}$`));
  const fixPack = page.locator(".paid-panel");
  await expect(fixPack.getByText("$99.00")).toBeVisible();
  mark("full report with the fixes");

  await page.route("https://test.dodopayments.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Dodo checkout</title><h1>Dodo test checkout</h1>"
    })
  );
  await fixPack.getByRole("button", { name: "Buy Fix Pack" }).click();
  await expect(page).toHaveURL(/^https:\/\/test\.dodopayments\.com\/session\/cs_e2e_\d+$/);
  mark("Fix Pack checkout opened");

  const paid = await (await request.post("/__e2e/dodo/pay", { data: { ownerEmail: email } })).json();
  expect(paid).toMatchObject({ received: true, paid: true });
  await page.goto(`/beta/reports/${id}?checkout=return&fixRequestId=${paid.fixRequestId}`);
  await expect(page.getByText("Payment confirmed").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download fix files (.zip)" }).click();
  expect((await download).suggestedFilename()).toBe("seo-fix-kit-acme-widgets-example.zip");
  mark("paid and downloaded");

  console.log(`stranger path steps: ${JSON.stringify(steps)}`);
});
