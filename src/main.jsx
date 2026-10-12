import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import { queryClient } from "./lib/queries.js";
import "./styles.css";

const app = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// The homepage arrives prerendered (scripts/prerender.mjs): hydrate it.
// The /beta shell arrives empty: render from scratch.
const root = document.getElementById("root");
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
