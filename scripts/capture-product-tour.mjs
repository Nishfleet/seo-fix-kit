// Re-shoots the homepage product tour (public/tour/*.webp) from the real app.
// Run `npm run build`, start `node e2e/server.mjs`, then `npm run tour:capture`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.TOUR_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || 4321}`;
const EMAIL = "tour@acme-widgets.example";
const SHOTS = [
  { file: "report.webp", tab: "Problems" },
  { file: "pages.webp", tab: "Pages" }
];

async function signInLink(email) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const messages = await (await fetch(`${BASE}/__e2e/emails?to=${encodeURIComponent(email)}`)).json();
    const link = messages.at(-1)?.text.match(/https?:\/\/\S+\/beta\?access=[A-Za-z0-9_-]+/)?.[0];
    if (link) return new URL(link);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in email reached ${email}. Is e2e/server.mjs running at ${BASE}?`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1012 } });
await page.clock.install();
await page.goto(`${BASE}/beta`);
await page.getByLabel("Email").fill(EMAIL);
await page.clock.fastForward(3_000);
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
const link = await signInLink(EMAIL);
await page.goto(`${BASE}${link.pathname}${link.search}`);
await page.getByRole("heading", { level: 1, name: "Overview" }).waitFor();

const seeded = await fetch(`${BASE}/__e2e/reports`, {
  method: "POST",
  body: JSON.stringify({ ownerEmail: EMAIL, score: 72 })
});
const { id } = await seeded.json();
await page.goto(`${BASE}/beta/reports/${id}`, { waitUntil: "networkidle" });

for (const shot of SHOTS) {
  await page.getByRole("tab", { name: new RegExp(`^${shot.tab}`) }).click();
  await page.waitForTimeout(400);
  const png = await page.screenshot({ type: "png" });
  const webp = await page.evaluate(async (base64) => {
    const image = new window.Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, png.toString("base64"));
  const target = path.join(ROOT, "public/tour", shot.file);
  fs.writeFileSync(target, Buffer.from(webp, "base64"));
  console.log(`wrote ${path.relative(ROOT, target)}`);
}

await browser.close();
