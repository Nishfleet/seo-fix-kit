// ESLint flat config (ESLint 9).
//
// Pragmatic baseline: the recommended rule sets for each runtime, with rules
// that flagged a large backlog of pre-existing code downgraded to "warn" so
// `npm run lint` exits 0 today and new errors still fail CI. Tighten a rule
// back to "error" once its warnings are cleared.
//
// Formatting is Prettier's job (`npm run format`); eslint-config-prettier
// switches off every stylistic rule that would fight it.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

// Recommended rules with a pre-existing backlog, downgraded to warnings.
const backlogWarnings = {
  "no-unused-vars": "warn",
  "no-useless-assignment": "warn",
  // The input sanitizers deliberately strip C0 control characters.
  "no-control-regex": "off",
  "preserve-caught-error": "warn",
  "no-useless-escape": "warn",
  "no-regex-spaces": "warn",
  "no-empty": ["error", { allowEmptyCatch: true }]
};

// Code passed to Playwright/Puppeteer page.evaluate() is serialized and runs
// inside the page, so these Node/Worker-side files legitimately reference a
// few DOM globals. Kept to the minimal set actually used.
const pageEvaluateGlobals = {
  document: "readonly",
  window: "readonly",
  getComputedStyle: "readonly"
};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/**",
      "docs/**",
      "specs/**",
      "ops/**",
      ".lane/**",
      "migrations/**",
      "prototype-context/**",
      ".claude/**",
      ".wrangler/**"
    ]
  },
  js.configs.recommended,
  {
    // Default for every JS file: modern ESM, Node globals (server/, scripts/,
    // config files, and *.test.mjs suites all run under Node).
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node }
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn"
    },
    rules: backlogWarnings
  },
  {
    // React SPA (browser).
    files: ["src/**/*.{js,jsx}"],
    ignores: ["src/**/*.test.mjs"],
    ...jsxA11y.flatConfigs.recommended,
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    }
  },
  {
    files: ["src/**/*.{js,jsx}"],
    ignores: ["src/**/*.test.mjs"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh.default ?? reactRefresh
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Count identifiers used only as JSX tags (<StatusMessage />) as used.
      "react/jsx-uses-vars": "error",
      // React Compiler rule (react-hooks v7); existing effects predate it.
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  {
    // Cloudflare Worker runtime (service-worker style globals: fetch,
    // Request, Response, crypto, caches, ...). Tests under worker/ run in Node.
    files: ["worker/**/*.js"],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.worker }
    }
  },
  {
    // shared/ is imported by both the Worker and the Node server/scripts.
    files: ["shared/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.serviceworker }
    }
  },
  {
    // The free tools' browser entry, bundled by Vite to /tools.js.
    files: ["shared/free-tools/client.js"],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    files: [
      "shared/audit-engine.js",
      "server/**/*.js",
      "scripts/**/*.mjs",
      "**/*.test.mjs",
      "e2e/**/*.mjs",
      "playwright.config.mjs"
    ],
    languageOptions: {
      globals: pageEvaluateGlobals
    }
  },
  prettier,
  {
    // Re-apply the backlog downgrades after the plugin presets so a preset
    // cannot silently turn one back into an error.
    rules: backlogWarnings
  },
  {
    // The backlog is cleared outside src/: keep it from regrowing there.
    // src/ stays on the warning baseline above until its own backlog is fixed.
    ignores: ["src/**"],
    rules: {
      "no-unused-vars": "error",
      "no-useless-assignment": "error",
      "preserve-caught-error": "error",
      "no-useless-escape": "error",
      "no-regex-spaces": "error"
    }
  },
  {
    // One remaining no-useless-assignment warning lives here; drop this
    // carve-out once it is fixed.
    files: ["shared/promise-audit.test.mjs"],
    rules: { "no-useless-assignment": "warn" }
  }
];
