// Captures the real screens named by script.md from the live site, at 1920x1080,
// into assets/screens/. Run from the repo root:
//   node marketing/launch-video/capture-screens.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "assets", "screens");
const BASE = process.env.LAUNCH_VIDEO_BASE_URL || "https://seofixkit.com";

const SHOTS = [
  { file: "home-hero.png", url: "/", scroll: "top" },
  { file: "raw-vs-rendered.png", url: "/demo", selector: '.grid[aria-label="Sample audit outcome"]' },
  { file: "report-list.png", url: "/", selector: ".tour-frame img:not([hidden])" },
  { file: "find-fix-confirm.png", url: "/", selector: "#how-title" },
  { file: "repair-queue.png", url: "/demo", text: "What the engine queues for the test page" },
  { file: "score-history.png", url: "/proof", selector: '.grid[aria-label="Audit scores before and after each fix"]' },
  { file: "account-form.png", url: "/", selector: ".landing-final" },
  { file: "check-form.png", url: "/check", scroll: "top" }
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.emulateMedia({ reducedMotion: "reduce" });

for (const shot of SHOTS) {
  await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(600);

  if (shot.element) {
    const anchor = page.locator(shot.reveal ?? shot.element).first();
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page
      .locator(shot.element)
      .first()
      .screenshot({ path: path.join(OUT, shot.file), type: "png" });
  } else if (shot.selector) {
    await page.locator(shot.selector).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, shot.file), type: "png" });
  } else if (shot.text) {
    await page
      .getByText(shot.text)
      .first()
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page.evaluate("window.scrollBy(0, -60)");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, shot.file), type: "png" });
  } else {
    await page.screenshot({ path: path.join(OUT, shot.file), type: "png" });
  }
  console.log(`captured ${shot.file} from ${BASE}${shot.url}`);
}

await browser.close();
