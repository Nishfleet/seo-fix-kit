// End-to-end suite: Playwright drives the real Worker and database
// (e2e/server.mjs) on a desktop and a phone viewport. Run `npm run test:e2e`.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 4321);

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "node e2e/server.mjs",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PORT: String(PORT) },
    stdout: "ignore",
    stderr: "pipe"
  }
});
