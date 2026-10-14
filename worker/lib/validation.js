import { z } from "zod";

function cleanText(input, maxLength) {
  return String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function text(maxLength) {
  return z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => cleanText(value ?? "", maxLength));
}

function number() {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().optional()
  );
}

function flag() {
  return z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().nullish().transform(Boolean)
  );
}

function record() {
  return z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value || {});
}

const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email({ pattern: EMAIL_PATTERN }));

function email(message = "Enter a valid email address.") {
  return z
    .string({ error: message })
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, { error: message })
    .pipe(z.email({ pattern: EMAIL_PATTERN, error: message }));
}

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

const uuidSchema = z.string().regex(/^[a-f0-9-]{32,40}$/i);

const reportIdSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{12,120}$/i);

const httpUrlSchema = z.url({ protocol: /^https?$/ });

const isoDateSchema = z.coerce.date().transform((date) => date.toISOString());

function parsedOrEmpty(schema, value) {
  const result = schema.safeParse(value);
  return result.success ? result.data : "";
}

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
  if (issue.code === "invalid_union" && issue.errors?.length) {
    const expected = issue.errors.map((branch) => branch[0]?.code === "invalid_type" && branch[0].expected);
    if (expected.every(Boolean)) return `${field} must be ${expected.map(typeName).join(" or ")}.`;
  }
  if (issue.code === "too_big") return `${field} is too long or too large.`;
  if (issue.code === "too_small") return `${field} is too short or too small.`;
  return `${field} is invalid.`;
}

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
