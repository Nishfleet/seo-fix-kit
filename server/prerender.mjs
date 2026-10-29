import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = new URL("../.cloudflare/output/v0/workers/default/assets/", import.meta.url);
const EMPTY_ROOT = '<div id="root"></div>';

export async function prerender({ dist = DIST } = {}) {
  const indexFile = new URL("index.html", dist);
  const template = fs.readFileSync(indexFile, "utf8");
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
    const { render } = await vite.ssrLoadModule("/src/entry-server.jsx");
    const html = render("/");
    fs.writeFileSync(new URL("beta-shell.html", dist), template);
    const page = template
      .replace('<html lang="en">', '<html lang="en" data-theme="light">')
      .replace(EMPTY_ROOT, `<div id="root">${html}</div>`);
    fs.writeFileSync(indexFile, page);
    return html;
  } finally {
    await vite.close();
  }
}
