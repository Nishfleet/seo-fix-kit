import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App.jsx";

export function render(url) {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </QueryClientProvider>
  );
}
