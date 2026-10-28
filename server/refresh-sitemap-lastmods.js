import { readFileSync, writeFileSync } from "node:fs";
import { ROOT_PUBLIC_LASTMODS, ROOT_PUBLIC_PATHS } from "../shared/audit-engine.js";
import {
  FINGERPRINTS_FILE,
  currentPublicPageFingerprints,
  recordedPublicPageFingerprints
} from "../shared/public-page-fingerprints.js";

const AUDIT_ENGINE = new URL("../shared/audit-engine.js", import.meta.url);
const SITEMAP = new URL("../public/sitemap.xml", import.meta.url);
const ORIGIN = "https://seofixkit.com";

function utcSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const current = await currentPublicPageFingerprints();
const recorded = recordedPublicPageFingerprints();
const lastmods = { ...ROOT_PUBLIC_LASTMODS };
const changed = ROOT_PUBLIC_PATHS.filter((path) => current[path] !== recorded[path]);

for (const path of changed) {
  const previous = Date.parse(lastmods[path] || "") || 0;
  lastmods[path] = utcSeconds(Math.max(Date.now(), previous + 1000));
}

const lastmodsBlock = `export const ROOT_PUBLIC_LASTMODS = {\n${ROOT_PUBLIC_PATHS.map(
  (path) => `  "${path}": "${lastmods[path]}"`
).join(",\n")}\n};`;
const engine = readFileSync(AUDIT_ENGINE, "utf8");
writeFileSync(AUDIT_ENGINE, engine.replace(/export const ROOT_PUBLIC_LASTMODS = \{[\s\S]*?\n\};/, lastmodsBlock));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ROOT_PUBLIC_PATHS.map(
  (path) => `  <url><loc>${ORIGIN}${path}</loc><lastmod>${lastmods[path]}</lastmod></url>`
).join("\n")}\n</urlset>\n`;
writeFileSync(SITEMAP, sitemap);

writeFileSync(FINGERPRINTS_FILE, `${JSON.stringify(current, null, 2)}\n`);
console.log(changed.length ? `Refreshed lastmod for: ${changed.join(", ")}` : "All public page lastmods are current.");
