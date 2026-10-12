// Shared fixtures for the e2e suite.
//   - Every page gets its own fake client IP (see e2e/server.mjs) so per-IP
//     rate limits behave as they do for separate real visitors.
//   - Console errors and uncaught page errors fail the test that caused them.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({ "x-e2e-client": `${testInfo.project.name}:${testInfo.testId}` });
    await use(context);
  },
  page: async ({ page }, use) => {
    // A controllable clock that still runs in real time (see typeLikeAPerson).
    await page.clock.install();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // A signed-out session check answers 401 by design, and a 404 page's
      // own document is a 404; the browser logs both as resource errors.
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

// The sign-up forms drop submissions made faster than a person can type
// (worker/routes/access.js bot trap). Install a controllable clock before the
// page loads, then call this before submitting to let "human" time pass.
export async function typeLikeAPerson(page) {
  await page.clock.fastForward(3_000);
}

// The sign-in link the Worker emailed to `email`, as a path on this server.
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
