import { captureException, withSentry } from "@sentry/cloudflare";

// Error reporting is opt-in: it turns on only when the SENTRY_DSN secret is set.
// Without it every handler runs exactly as before, with no SDK in the call path.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Path segments that work as bearer links: unsubscribe tokens and client report share IDs (/r/<id>).
const SECRET_PATH = /(\/email\/unsubscribe\/|\/r\/)[^/?#\s"']+/gi;
const SAFE_HEADERS = new Set(["accept", "content-type", "user-agent"]);

// The Console integration turns every console.log/warn/error line into a breadcrumb,
// and log lines can carry customer fields, so it is never set up.
const DROPPED_INTEGRATIONS = new Set(["Console"]);
// SDK contexts that carry no request or customer data; anything else is dropped.
const TRACE_CONTEXT_KEYS = ["trace_id", "span_id", "parent_span_id", "op", "status", "origin"];

function beforeSend(event, hint) {
  if (hint?.originalException?.alreadyReported) return null;
  return scrubEvent(event);
}

function sentryOptions(env) {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || "production",
    sendDefaultPii: false,
    // Tracing stays off: no tracesSampleRate (even 0 lets an incoming
    // sentry-trace header sample a request), and any transaction that still
    // gets built is dropped, since transactions skip beforeSend's scrubber.
    beforeSendTransaction: () => null,
    tracePropagationTargets: [],
    integrations: (defaults) => defaults.filter((integration) => !DROPPED_INTEGRATIONS.has(integration.name)),
    beforeSend,
    beforeBreadcrumb: scrubBreadcrumb
  };
}

function scrubString(value) {
  return value.replace(EMAIL, "[email]").replace(SECRET_PATH, "$1[redacted]");
}

function scrubValue(value, depth = 0) {
  if (typeof value === "string") return scrubString(value);
  if (!value || typeof value !== "object" || depth > 8) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  for (const key of Object.keys(value)) value[key] = scrubValue(value[key], depth + 1);
  return value;
}

// Breadcrumbs keep what happened, not the text: console lines are dropped and so is
// every breadcrumb message. Data (a fetch URL, method, status) is scrubbed.
function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== "object") return null;
  if (breadcrumb.category === "console") return null;
  const rest = { ...breadcrumb };
  delete rest.message;
  return scrubValue(rest);
}

function scrubContexts(contexts) {
  const out = {};
  if (contexts.runtime) out.runtime = { name: contexts.runtime.name, version: contexts.runtime.version };
  if (contexts.cloud_resource) out.cloud_resource = { "cloud.provider": contexts.cloud_resource["cloud.provider"] };
  if (contexts.trace) {
    out.trace = {};
    for (const key of TRACE_CONTEXT_KEYS) {
      if (contexts.trace[key] !== undefined) out.trace[key] = contexts.trace[key];
    }
  }
  return out;
}

function scrubEvent(event) {
  delete event.extra;
  if (event.contexts && typeof event.contexts === "object") event.contexts = scrubContexts(event.contexts);
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    const headers = event.request.headers || {};
    event.request.headers = Object.fromEntries(
      Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase()))
    );
    if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0];
  }
  delete event.user;
  return scrubValue(event);
}

// Marks an error whose causes were already sent one by one, so the wrapper doesn't send it again.
function alreadyReported(error) {
  error.alreadyReported = true;
  return error;
}

function reportError(error, tags) {
  captureException(error, tags ? { tags } : undefined);
}

function withErrorReporting(handlers) {
  const instrumented = withSentry(sentryOptions, { ...handlers });
  const wrapped = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = (input, env, ctx) => (env?.SENTRY_DSN ? instrumented[name] : handler)(input, env, ctx);
  }
  return wrapped;
}

export { alreadyReported, reportError, scrubBreadcrumb, scrubEvent, sentryOptions, withErrorReporting };
