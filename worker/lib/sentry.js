import { captureException, withSentry } from "@sentry/cloudflare";

// Error reporting is opt-in: it turns on only when the SENTRY_DSN secret is set.
// Without it every handler runs exactly as before, with no SDK in the call path.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Path segments that work as bearer links: unsubscribe tokens and client report share IDs (/r/<id>).
const SECRET_PATH = /(\/email\/unsubscribe\/|\/r\/)[^/?#\s"']+/gi;
const SAFE_HEADERS = new Set(["accept", "content-type", "user-agent"]);

function sentryOptions(env) {
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event, hint) => (hint?.originalException?.alreadyReported ? null : scrubEvent(event)),
    beforeBreadcrumb: (breadcrumb) => scrubValue(breadcrumb)
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

function scrubEvent(event) {
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

export { alreadyReported, reportError, scrubEvent, sentryOptions, withErrorReporting };
