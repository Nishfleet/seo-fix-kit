import { expect, signInLinkFor, test, typeLikeAPerson, uniqueEmail } from "./fixtures.mjs";

const SECTIONS = ["Overview", "Reports", "Sites", "Alerts & API", "Billing"];

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

  const setup = page.getByRole("region", { name: "Set up your account" });
  await expect(setup.getByRole("listitem").first()).toContainText("Run your first audit");
  await setup.getByRole("link", { name: "Run audit" }).click();
  await expect(page.getByLabel("Page or site URL")).toBeFocused();
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

test("a report lists every problem and jumps from the top fixes to the proof", async ({
  page,
  request,
  isMobile
}, testInfo) => {
  const email = uniqueEmail(testInfo, "report");
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

  await page.goto("/beta/reports");
  const row = page.getByRole("table", { name: "Reports" }).getByRole("row", { name: /acme-widgets\.example/ });
  await expect(row.locator(".app-table-num").nth(1)).toHaveText("6");
  if (!isMobile) await expect(row.locator(".app-table-num").nth(0)).toHaveText("3");

  await page.goto(`/beta/reports/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "acme-widgets.example" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All problems (6)" })).toBeVisible();

  const rows = page.locator(".finding-list > details");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute("open", "");
  await expect(rows.nth(1).getByText("Evidence", { exact: true })).toBeHidden();

  const filters = page.getByRole("group", { name: "Filter problems by severity" });
  await page.setViewportSize({ width: 320, height: 700 });
  const notices = await filters.getByRole("button", { name: /^Notices/ }).boundingBox();
  expect(notices.x + notices.width).toBeLessThanOrEqual(320);
  await page.setViewportSize(testInfo.project.use.viewport);
  await filters.getByRole("button", { name: /^Warnings/ }).click();
  await expect(filters.getByRole("button", { name: /^Warnings/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Missing H1 on /pricing" })).toHaveCount(0);

  await page.getByRole("link", { name: "Missing H1 on /pricing" }).click();
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(6);
  const target = page.locator("details", { has: page.getByRole("heading", { name: "Missing H1 on /pricing" }) });
  await expect(target).toHaveAttribute("open", "");
  await expect(target.getByText("Evidence", { exact: true })).toBeInViewport();
});

test("a report shows what each fix is worth and hands over ready-to-paste AI fix prompts", async ({
  page,
  request
}, testInfo) => {
  const email = uniqueEmail(testInfo, "prompt");
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => window.__copied.push(text) }
    });
  });
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

  await page.goto(`/beta/reports/${id}`);
  const verdict = page.locator(".verdict-card");
  await expect(verdict.getByText("+12 pts", { exact: true })).toBeVisible();
  await expect(verdict.getByText("+16 pts · 2 pages").first()).toBeVisible();
  await expect(verdict.getByText(/score could rise by about 28 points/)).toBeVisible();
  await page.getByRole("button", { name: "Copy AI prompt for the top fixes" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const [all] = await page.evaluate(() => window.__copied);
  expect(all).toContain("My website is https://acme-widgets.example");
  expect(all).toMatch(/Please fix these \d+ problems/);

  const first = page.locator(".finding-list > details").first();
  await first.getByRole("button", { name: "Copy AI fix prompt" }).click();
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).toHaveLength(2);
  expect(copied[1]).toContain("Problem: ");
  expect(copied[1]).toContain("What the audit found:");
});

test("an owner turns on a live score badge and its public score page", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "badge");
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

  await page.goto(`/beta/reports/${id}#share`);
  await page.getByRole("button", { name: "Get my score badge" }).click();
  const badge = page.getByRole("img", { name: "Your SEO Fix Kit score badge" });
  await expect(badge).toBeVisible();
  await expect.poll(() => badge.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Copy badge HTML" })).toBeVisible();

  const scorePage = await badge.locator("xpath=..").getAttribute("href");
  await page.goto(scorePage);
  await expect(page.getByRole("heading", { level: 1, name: "acme-widgets.example" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check your site free" })).toBeVisible();
});

test("the check-your-inbox screen opens the right webmail and resends the link after a short wait", async ({
  page,
  request
}, testInfo) => {
  const email = uniqueEmail(testInfo, "inbox").replace("@example.com", "@gmail.com");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Gmail" })).toHaveAttribute(
    "href",
    /^https:\/\/mail\.google\.com\//
  );
  await signInLinkFor(request, email);

  const resend = page.getByRole("button", { name: /^Resend link/ });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/in \d+s$/);
  await page.clock.fastForward(31_000);
  await expect(resend).toHaveText("Resend link");
  await resend.click();
  await expect(page.getByText("We sent a new link.")).toBeVisible();
  await expect
    .poll(async () => (await (await request.get(`/__e2e/emails?to=${encodeURIComponent(email)}`)).json()).length)
    .toBe(2);
});

test("the overview shows each site's progress and the Alerts page switches audit emails", async ({
  page,
  request
}, testInfo) => {
  const email = uniqueEmail(testInfo, "progress");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = await signInLinkFor(request, email);
  await request.post("/__e2e/reports", { data: { ownerEmail: email, score: 12, daysAgo: 7 } });
  await request.post("/__e2e/reports", { data: { ownerEmail: email } });
  await page.goto(link);

  const progress = page.getByRole("region", { name: "Your progress" });
  const site = progress.getByRole("link", { name: /acme-widgets\.example/ });
  await expect(site).toContainText("2 checks since");
  await expect(site.locator(".progress-change.good")).toHaveText("▲ 8");
  await expect(site.locator(".progress-spark")).toBeVisible({ visible: !testInfo.project.name.includes("mobile") });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width);

  await page.goto("/beta/developers");
  const toggle = page.getByRole("switch", { name: "Email updates" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Email updates" })).toHaveAttribute("aria-checked", "false");
});

test("Check again reruns a report and leads with what changed", async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, "rerun");
  await page.goto("/beta");
  await page.getByLabel("Email").fill(email);
  await typeLikeAPerson(page);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = await signInLinkFor(request, email);
  const older = await (
    await request.post("/__e2e/reports", { data: { ownerEmail: email, score: 12, daysAgo: 7 } })
  ).json();
  const newer = await (
    await request.post("/__e2e/reports", {
      data: {
        ownerEmail: email,
        score: 92,
        reportDelta: {
          status: "ready",
          summary: { scoreDelta: 8, issuesDelta: -1, fixedIssuesCount: 1, newIssuesCount: 0, persistentIssuesCount: 6 },
          fixedIssues: [{ title: "Missing meta description on /about", severity: "warning" }],
          newIssues: []
        }
      }
    })
  ).json();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

  await page.route("**/api/pricing-preview", (route) =>
    route.fulfill({ json: { pricing: { displayPrice: "$49", currency: "USD" } } })
  );
  let sent;
  await page.route("**/api/audit", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, mode: "queued", jobId: "e2e-rerun" } });
  });
  await page.route("**/api/audit/jobs/e2e-rerun", (route) =>
    route.fulfill({
      json: { ok: true, job: { status: "completed", reportId: newer.id, reportPath: `/beta/reports/${newer.id}` } }
    })
  );

  await page.goto(`/beta/reports/${older.id}`);
  await expect(page.getByRole("region", { name: "Change since your last check" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page).toHaveURL(new RegExp(`/beta/reports/${newer.id}$`));
  expect(sent.url).toContain("acme-widgets.example");

  const change = page.getByRole("region", { name: "Change since your last check" });
  await expect(change).toContainText("You crossed 90. Up 8 since your last check");
  await expect(change).toContainText("1 fixed · 0 new");
  await change.getByRole("button", { name: "See what changed" }).click();
  await expect(page.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Insights").getByText("Missing meta description on /about", { exact: true })
  ).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width);
});
