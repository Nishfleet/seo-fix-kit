// Prerenders the homepage into dist/index.html after `vite build`.
//
// SEO Fix Kit audits whether a page's content is in its raw HTML, so its own
// homepage must pass that test: the landing page is rendered to HTML at build
// time and hydrated in the browser. The signed-in app keeps an empty shell
// (dist/beta-shell.html), served by the Worker for /beta/*, so it never
// flashes marketing content before it mounts.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = new URL("../dist/", import.meta.url);
const EMPTY_ROOT = '<div id="root"></div>';

export async function prerender({ dist = DIST } = {}) {
  const indexFile = new URL("index.html", dist);
  const template = fs.readFileSync(indexFile, "utf8");
  if (!template.includes(EMPTY_ROOT)) throw new Error("dist/index.html has no empty #root to fill");

  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false }
  });
  try {
    const { render } = await vite.ssrLoadModule("/src/entry-server.jsx");
    const html = render("/");
    fs.writeFileSync(new URL("beta-shell.html", dist), template);
    fs.writeFileSync(indexFile, template.replace(EMPTY_ROOT, `<div id="root">${html}</div>`));
    return html;
  } finally {
    await vite.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await prerender();
  console.log(`prerendered / (${html.length} bytes of HTML)`);
}
