import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App.jsx";

// Build-time render of a public SPA route (scripts/prerender.mjs), so the
// homepage ships its full content in the HTML for crawlers, link previews and
// first paint. The tree matches src/main.jsx so the client hydrates it as is.
export function render(url) {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </QueryClientProvider>
  );
}
