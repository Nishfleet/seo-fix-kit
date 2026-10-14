import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({ "x-e2e-client": `${testInfo.project.name}:${testInfo.testId}` });
    await use(context);
  },
  page: async ({ page }, use) => {
    await page.clock.install();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // A signed-out session check answers 401 by design, and a 404 page's
      if (/status of 401/.test(text)) return;
      if (/status of 404/.test(text) && message.location().url === page.url()) return;
      problems.push(`console: ${text}`);
    });
    await use(page);
    expect(problems, "the page logged errors").toEqual([]);
  }
});

export { expect };

let emailCounter = 0;
export function uniqueEmail(testInfo, label = "owner") {
  emailCounter += 1;
  const slug = `${testInfo.project.name}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "").slice(0, 32);
  return `${label}-${slug}-${emailCounter}@example.com`.toLowerCase();
}

export async function typeLikeAPerson(page) {
  await page.clock.fastForward(3_000);
}

export async function signInLinkFor(request, email) {
  let link = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(`/__e2e/emails?to=${encodeURIComponent(email)}`);
        const messages = await response.json();
        const text = messages.at(-1)?.text || "";
        link = text.match(/https?:\/\/\S+\/beta\?access=[A-Za-z0-9_-]+/)?.[0] || "";
        return link;
      },
      { message: `a sign-in email reaches ${email}` }
    )
    .not.toBe("");
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}
