import { z } from "zod";

// Request validation for the Worker's JSON endpoints, built on Zod.
//
// Every route that reads a JSON body declares a schema next to its handler and
// calls `parseJsonBody(request, Schema)`. A failed parse becomes a 400 with a
// readable `error` message and the offending `field`, so clients (the SPA and
// the public v1 API alike) get one consistent error shape.

// --- Free text ----------------------------------------------------------------

// Collapses control characters and runs of whitespace, then trims and caps the
// length. This is sanitising (what we store), not validation (what we accept).
function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// Optional text field: must be a string (or a number, which forms often send)
// when present; stored cleaned and truncated to `maxLength`. Absent or null
// becomes "".
function text(maxLength) {
  return z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => cleanText(value ?? "", maxLength));
}

// Optional finite number. Accepts numeric strings ("50") because HTML forms
// and query-string-minded clients send them; blank becomes undefined.
function number() {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().optional()
  );
}

// Optional boolean that also accepts the "true"/"false" strings forms send.
function flag() {
  return z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().nullish().transform(Boolean)
  );
}

// Optional plain object (for example `utm` or `billing_address`).
function record() {
  return z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value || {});
}

// --- Identifiers and formats -----------------------------------------------

const EMAIL_MAX_LENGTH = 254;

// Deliberately permissive (anything@anything.tld, Unicode included): stored
// invites and leads were accepted under this rule, so a stricter format would
// lock existing holders out.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email({ pattern: EMAIL_PATTERN }));

// Required email field whose every failure reports `message`.
function email(message = "Enter a valid email address.") {
  return z
    .string({ error: message })
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, { error: message })
    .pipe(z.email({ pattern: EMAIL_PATTERN, error: message }));
}

// Optional email: "" when absent, blank, or not a valid address.
function optionalEmail() {
  return z
    .unknown()
    .optional()
    .transform((value) => parsedOrEmpty(emailSchema, String(value || "")));
}

const inviteCodeSchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

const accessTokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);

// Row ids are `crypto.randomUUID()` values; older rows may be bare 32-char hex.
const uuidSchema = z.string().regex(/^[a-f0-9-]{32,40}$/i);

const reportIdSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{12,120}$/i);

const httpUrlSchema = z.url({ protocol: /^https?$/ });

const isoDateSchema = z.coerce.date().transform((date) => date.toISOString());

// "" when the value does not match `schema`, else the parsed value. Lets the
// lenient helpers in text.js share these schemas.
function parsedOrEmpty(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? result.data : "";
}

// --- Bodies --------------------------------------------------------------------

// A schema for a JSON body object. `aliases` maps a legacy or snake_case key
// onto the canonical key, which wins when both are sent:
// `body({ landingPath: text(500) }, { landing_path: "landingPath" })`.
// Unknown keys are dropped.
function body(shape, aliases = {}) {
  const schema = z.object(shape);
  if (!Object.keys(aliases).length) return schema;
  return z.preprocess((input) => {
    if (!input || typeof input !== "object") return input;
    const output = { ...input };
    for (const [alias, key] of Object.entries(aliases)) {
      if (output[key] === undefined && output[alias] !== undefined) output[key] = output[alias];
    }
    return output;
  }, schema);
}

function typeName(expected) {
  if (expected === "string") return "text";
  return `${/^[aeiou]/.test(expected) ? "an" : "a"} ${expected}`;
}

function describeIssue(issue) {
  const field = issue.path?.length ? issue.path.join(".") : "Request body";
  if (issue.code === "invalid_type") return `${field} must be ${typeName(issue.expected)}.`;
  // A union of plain types (text or a number, text or a list) failed on type.
  if (issue.code === "invalid_union" && issue.errors?.length) {
    const expected = issue.errors.map((branch) => branch[0]?.code === "invalid_type" && branch[0].expected);
    if (expected.every(Boolean)) return `${field} must be ${expected.map(typeName).join(" or ")}.`;
  }
  if (issue.code === "too_big") return `${field} is too long or too large.`;
  if (issue.code === "too_small") return `${field} is too short or too small.`;
  return `${field} is invalid.`;
}

// Reads the request's JSON body and validates it. A missing, malformed, or
// non-object body is treated as `{}`, so required fields report themselves.
// Returns `{ data }` on success or `{ error: { error, field } }` ready to send
// as a 400.
async function parseJsonBody(request, schema) {
  const input = await request.json().catch(() => undefined);
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const result = schema.safeParse(value, { error: describeIssue });
  if (result.success) return { data: result.data };
  const [issue] = result.error.issues;
  return {
    error: {
      error: issue.message,
      ...(issue.path?.length ? { field: issue.path.join(".") } : {})
    }
  };
}

export {
  EMAIL_MAX_LENGTH,
  accessTokenSchema,
  body,
  cleanText,
  email,
  emailSchema,
  flag,
  httpUrlSchema,
  inviteCodeSchema,
  isoDateSchema,
  number,
  optionalEmail,
  parseJsonBody,
  parsedOrEmpty,
  record,
  reportIdSchema,
  text,
  uuidSchema,
  z
};
