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

test("a stranger signs up from the free check and downloads the fix files without paying", async ({
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
  const fixFiles = page.locator(".paid-panel");
  await expect(fixFiles.getByText("Get every fix ready to ship — free")).toBeVisible();
  mark("full report with the fixes");

  const reportText = await page.locator("body").innerText();
  expect(reportText).not.toMatch(/\$\d/);
  expect(reportText).not.toContain("Buy Fix Pack");

  const zip = await page.request.get(`/api/reports/${id}/fix-kit.zip`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download fix files (.zip)" }).click();
  expect((await download).suggestedFilename()).toBe("seo-fix-kit-acme-widgets-example.zip");
  mark("downloaded free, no payment");

  console.log(`stranger path steps: ${JSON.stringify(steps)}`);
});
