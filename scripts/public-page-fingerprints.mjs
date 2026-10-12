// Content fingerprints for the public pages listed in the sitemap.
//
// A page's <lastmod> must move whenever what it shows changes. Instead of
// tracking source line ranges through git history, we hash what each page
// actually serves: Worker-rendered pages are fetched through the Worker, and
// the SPA homepage ("/") hashes the files that make up its landing page.
// `npm run sitemap:refresh` stores the hashes in
// shared/public-page-fingerprints.json and bumps the lastmod of any page whose
// hash changed; worker/routes/pages.test.mjs fails when they are out of date.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ROOT_PUBLIC_PATHS } from "../shared/audit-engine.js";
import worker from "../worker/index.js";

export const FINGERPRINTS_FILE = new URL("../shared/public-page-fingerprints.json", import.meta.url);
const ORIGIN = "https://seofixkit.com";
const SPA_LANDING_FILES = [
  "src/pages/LandingPage.jsx",
  "src/pages/landing.css",
  "src/components/SiteChrome.jsx",
  "src/components/Icon.jsx",
  "src/components/ProofField.jsx",
  "src/design/tokens.css",
  "src/design/site.css",
  "shared/site-nav.js",
  "index.html",
  "public/tour/report.webp",
  "public/tour/pages.webp"
];

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function workerPageHtml(path) {
  const env = { ASSETS: { fetch: async () => new Response("", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`), env, ctx);
  if (response.status !== 200) throw new Error(`${path} rendered HTTP ${response.status}`);
  return response.text();
}

// Hashed as bytes, so the product-tour screenshots count too; for the text
// files this matches hashing their contents joined with newlines.
function landingFingerprint() {
  const hash = createHash("sha256");
  SPA_LANDING_FILES.forEach((file, index) => {
    if (index > 0) hash.update("\n");
    hash.update(readFileSync(new URL(`../${file}`, import.meta.url)));
  });
  return hash.digest("hex");
}

export async function currentPublicPageFingerprints() {
  const fingerprints = {};
  for (const path of ROOT_PUBLIC_PATHS) {
    fingerprints[path] = path === "/" ? landingFingerprint() : sha256(await workerPageHtml(path));
  }
  return fingerprints;
}

export function recordedPublicPageFingerprints() {
  return JSON.parse(readFileSync(FINGERPRINTS_FILE, "utf8"));
}
