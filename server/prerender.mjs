import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const ROOT = fileURLToPath(new URL("..", import.meta.url).href);
const DIST = new URL("../.cloudflare/output/v0/workers/default/assets/", import.meta.url);
const EMPTY_ROOT = '<div id="root"></div>';

/** @param {{ dist?: URL }} [options]
 * @returns {Promise<string>}
 */
export async function prerender({ dist = DIST } = {}) {
  const indexFile = new URL("index.html", dist);
  const indexPath = fileURLToPath(indexFile.href);
  const template = fs.readFileSync(indexPath, "utf8");
  if (!template.includes(EMPTY_ROOT)) throw new Error("index.html has no empty #root to fill");

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    plugins: [react()],
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false }
  });
  try {
    const { render } = /** @type {{ render: (path: string) => string }} */ (
      await vite.ssrLoadModule("/src/entry-server.jsx")
    );
    const html = render("/");
    fs.writeFileSync(fileURLToPath(new URL("beta-shell.html", dist).href), template);
    const page = template
      .replace('<html lang="en">', '<html lang="en" data-theme="light">')
      .replace(EMPTY_ROOT, `<div id="root">${html}</div>`);
    fs.writeFileSync(indexPath, page);
    return html;
  } finally {
    await vite.close();
  }
}
