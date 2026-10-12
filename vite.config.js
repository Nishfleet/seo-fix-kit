import fs from "node:fs";
import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import { notFoundHtml } from "./worker/routes/pages.js";

// The worker-rendered public pages (worker/routes/pages.js) and the static
// 404 page load one stylesheet, /tokens.css. It is built from the same design
// files the React app imports, so the two surfaces cannot drift apart.
const SITE_STYLESHEET_PARTS = ["src/design/tokens.css", "src/design/base.css", "src/design/site.css"];

function readSiteStylesheet() {
  return SITE_STYLESHEET_PARTS.map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
}

function siteStylesheet() {
  return {
    name: "seofixkit-site-stylesheet",
    configureServer(server) {
      server.middlewares.use("/tokens.css", (_request, response) => {
        response.setHeader("content-type", "text/css; charset=utf-8");
        response.end(readSiteStylesheet());
      });
    },
    async generateBundle() {
      const { code } = await transformWithEsbuild(readSiteStylesheet(), "tokens.css", { loader: "css", minify: true });
      this.emitFile({ type: "asset", fileName: "tokens.css", source: code });
      // Cloudflare serves 404.html for unknown paths; render it from the
      // Worker's own template so it carries the live header and footer.
      this.emitFile({ type: "asset", fileName: "404.html", source: notFoundHtml() });
    }
  };
}

export default defineConfig({
  plugins: [react(), siteStylesheet()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/admin": "http://127.0.0.1:8787",
      "/r": "http://127.0.0.1:8787"
    }
  }
});
