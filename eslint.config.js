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
import noComments from "eslint-plugin-no-comments";
import prettier from "eslint-config-prettier";

// Vocabulary that marks a comment as an excuse for a workaround rather than an
// explanation of the code. Agents copy what exists, so one of these becomes
// house style and the workaround spreads with it.
const WORKAROUND_TERMS = [
  "todo",
  "fixme",
  "xxx",
  "hack",
  "workaround",
  "work around",
  "for now",
  "temporary",
  "temporarily",
  "not ideal",
  "should be",
  "ideally",
  "revisit",
  "later"
];

// The comment ban covers every source tree and every test tree. Config files
// at the repo root (eslint.config.js, vite.config.js, playwright.config.mjs)
// and the trees outside the app sit outside this list on purpose, so the gate
// never fights a config comment. Tests are inside it: only the root configs
// and the non-app trees are exempt (0509#7469, Nish 2026-10-14).
const NO_COMMENT_FILES = [
  "src/**/*.{js,jsx,mjs}",
  "worker/**/*.{js,mjs}",
  "server/**/*.{js,mjs}",
  "shared/**/*.{js,mjs}",
  "test/**/*.{js,mjs}"
];

// Recommended rules with a pre-existing backlog, downgraded to warnings.
const backlogWarnings = {
  "no-unused-vars": "warn",
  "no-useless-assignment": "warn",
  // The input sanitizers deliberately strip C0 control characters.
  "no-control-regex": "off",
  "preserve-caught-error": "warn",
  "no-useless-escape": "warn",
  "no-regex-spaces": "warn",
  "no-empty": ["error", { allowEmptyCatch: false }]
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
      ".cloudflare/**",
      "node_modules/**",
      "public/**",
      "docs/**",
      "specs/**",
      "migrations/**",
      "prototype-context/**",
      ".claude/**"
    ]
  },
  js.configs.recommended,
  {
    // Default for every JS file: modern ESM, Node globals (server/, config
    // files, and *.test.mjs suites all run under Node).
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
    // shared/ is imported by both the Worker and the Node server and tests.
    files: ["shared/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.serviceworker }
    }
  },
  {
    // Browser entries for Worker-rendered pages, bundled by Vite to /tools.js, /check.js and /chatgpt-read.js.
    files: ["shared/free-tools/client.js", "shared/public-check/client.js", "shared/chatgpt-read/client.js"],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    files: [
      "shared/audit-engine.js",
      "shared/public-page-fingerprints.js",
      "server/**/*.js",
      "server/**/*.mjs",
      "test/**/*.mjs",
      "**/*.test.mjs",
      "e2e/**/*.mjs",
      "playwright.config.mjs"
    ],
    languageOptions: {
      globals: pageEvaluateGlobals
    }
  },
  {
    // Server code that fetches a URL a customer typed must refuse private and
    // internal addresses on every redirect hop (seo-fix-kit#282). fetchPublicUrl
    // in shared/url-safety.js is the one place allowed to call fetch directly.
    // server/submit-index-now.js only calls this site and the IndexNow endpoints.
    files: ["worker/**/*.js", "shared/**/*.js", "server/**/*.js"],
    ignores: [
      "shared/url-safety.js",
      "shared/free-tools/client.js",
      "shared/public-check/client.js",
      "shared/chatgpt-read/client.js",
      "server/submit-index-now.js"
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use fetchPublicUrl from shared/url-safety.js with a privateAddressResolver. For a fixed vendor host, add an eslint-disable-next-line with the reason."
        }
      ],
      "no-restricted-properties": [
        "error",
        ...["globalThis", "self", "window"].map((object) => ({
          object,
          property: "fetch",
          message: "Use fetchPublicUrl from shared/url-safety.js with a privateAddressResolver."
        }))
      ]
    }
  },
  {
    // Every no-restricted-syntax band for these trees lives in this one block.
    // ESLint flat config replaces a rule outright when a later block redefines
    // it, so a second block with the same rule and files silently drops the
    // first's selectors: that is how the paid-copy block of #371 killed the
    // local-fetch band of #368 for a day. Add new bands to this array, do not
    // add a second block. test/eslint-restrictions.test.mjs asserts each band
    // still reports.
    //
    // Band 1 (fetch): a local binding named fetch hides raw fetch calls from
    // no-restricted-globals, so the binding itself is refused (seo-fix-kit#282).
    //
    // Bands 2 and 3 (paid): "Has this owner paid?" lives in one place, the
    // paid_owners view (migrations/0098) read through
    // worker/lib/paid-features.js. Copies drifted before: 9cb0089 counted test
    // orders and lost disputes as paid.
    files: ["worker/**/*.js", "shared/**/*.js", "server/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(VariableDeclarator[id.name='fetch'], FunctionDeclaration[id.name='fetch'], :function > Identifier.params[name='fetch'], AssignmentPattern > Identifier.left[name='fetch'], Property[key.name='fetch'] > Identifier.value[name='fetch'])",
          message:
            "A local binding named fetch hides raw fetch calls from no-restricted-globals. Call fetchPublicUrl from shared/url-safety.js instead."
        },
        {
          selector:
            "TemplateLiteral:has(TemplateElement[value.raw=/fix_requests/]):has(TemplateElement[value.raw=/owner_email/]):has(TemplateElement[value.raw=/status IN|paid_at|'paid'/])",
          message:
            "Read the paid_owners view (hasPaidFixPack in worker/lib/paid-features.js) instead of copying the paid rule."
        },
        {
          selector: "Literal[value=/fix_requests/][value=/owner_email/][value=/status IN|paid_at|'paid'/]",
          message:
            "Read the paid_owners view (hasPaidFixPack in worker/lib/paid-features.js) instead of copying the paid rule."
        }
      ]
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
  },
  {
    // Comment ban on source and test code (fleet-ops AGENTS.md, fleet-wide 2026-10-14).
    // A comment here survives three ways: an eslint disable directive or a
    // `global` declaration, an `upstream:` comment linking the browser quirk,
    // third-party bug or protocol rule that forces the code's shape, or not
    // existing, because the reason moved to a commit, a PR body or a named
    // test. `npm run lint` on this tree returns 0 findings, so the backlog is
    // cleared. Only the root configs and the non-app trees are exempt, so
    // `files` below lists the five app and test trees.
    files: NO_COMMENT_FILES,
    plugins: { "no-comments": noComments },
    rules: {
      "no-comments/disallowComments": ["error", { allow: ["eslint", "global", "upstream:", "@vite-ignore", "\\* @"] }],
      "no-inline-comments": ["error", { ignorePattern: "@vite-ignore|@type" }],
      "no-warning-comments": ["error", { terms: WORKAROUND_TERMS, location: "anywhere" }]
    }
  }
];
