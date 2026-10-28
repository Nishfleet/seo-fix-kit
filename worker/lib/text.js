import { normalizeUrl, publicAuditUrlStatus } from "../../shared/audit-engine.js";
import {
  accessTokenSchema,
  cleanText,
  emailSchema,
  httpUrlSchema,
  inviteCodeSchema,
  isoDateSchema,
  parsedOrEmpty,
  reportIdSchema,
  uuidSchema
} from "./validation.js";

function normalizeDnsTxt(value) {
  return String(value || "")
    .replace(/\\"/g, '"')
    .replaceAll('" "', "")
    .replaceAll('"', "")
    .trim();
}

function normalizeDnsHost(value) {
  return cleanReportDomain(String(value || "").replace(/\.$/, ""));
}

function cleanReportDomain(input) {
  let value = String(input || "")
    .trim()
    .toLowerCase();
  if (!value) return "";
  value = value
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .replace(/\.$/, "");
  value = value.split(":")[0];
  if (value.length < 4 || value.length > 253) return "";
  if (!value.includes(".")) return "";
  if (/[^a-z0-9.-]/.test(value)) return "";
  if (value.includes("..") || value.startsWith(".") || value.endsWith(".")) return "";
  if (value === "localhost" || value.endsWith(".localhost")) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return "";
  if (value.endsWith(".internal") || value.endsWith(".invalid")) return "";
  return value;
}

function workerAppHost(host = "", env = {}) {
  const clean = cleanReportDomain(host);
  if (!clean) return true;
  const appHosts = new Set([
    "seofixkit.com",
    "www.seofixkit.com",
    ...String(env.SEOFIXKIT_APP_HOSTS || "")
      .split(",")
      .map((value) => cleanReportDomain(value))
      .filter(Boolean)
  ]);
  return appHosts.has(clean) || clean.endsWith(".workers.dev");
}

function claimHostFromInput(input) {
  try {
    const url = new URL(normalizeUrl(String(input || "").trim()));
    const check = publicAuditUrlStatus(url.href);
    if (!check.ok) return "";
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeEmail(input) {
  return parsedOrEmpty(emailSchema, String(input || ""));
}

function cleanInviteCode(input) {
  return parsedOrEmpty(inviteCodeSchema, String(input || ""));
}

function cleanAccessToken(input) {
  return parsedOrEmpty(accessTokenSchema, String(input || ""));
}

function cleanAccessMode(input) {
  const mode = String(input || "")
    .trim()
    .toLowerCase();
  if (mode === "invite" || mode === "self-serve" || mode === "founder-override") return mode;
  if (mode === "api") return "api";
  return "invite";
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clampScheduleInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  if (parsed <= 7) return 7;
  if (parsed <= 14) return 14;
  return 30;
}

function scheduleCadenceLabel(value) {
  const days = clampScheduleInterval(value);
  if (days === 7) return "Weekly";
  if (days === 14) return "Every 2 weeks";
  return "Monthly";
}

function cleanUrlText(input, maxLength) {
  const url = parsedOrEmpty(httpUrlSchema, cleanText(input, maxLength));
  return url ? new URL(url).href.slice(0, maxLength) : "";
}

function cleanIsoDateText(input) {
  const value = cleanText(input, 80);
  return value ? parsedOrEmpty(isoDateSchema, value) : "";
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSafeUuid(input) {
  return uuidSchema.safeParse(String(input || "")).success;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function hourWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCMinutes(0, 0, 0);
  resetAt.setUTCHours(resetAt.getUTCHours() + 1);
  return {
    key: now.toISOString().slice(0, 13),
    resetAt
  };
}

function dayWindow(now) {
  const resetAt = new Date(now);
  resetAt.setUTCHours(0, 0, 0, 0);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  return {
    key: now.toISOString().slice(0, 10),
    resetAt
  };
}

function isoSecondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoDaysFromNow(days) {
  return isoSecondsFromNow(days * 24 * 60 * 60);
}

function isoDaysFromDate(value, days) {
  const start = new Date(value);
  const base = Number.isNaN(start.getTime()) ? Date.now() : start.getTime();
  return new Date(base + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

function isSafeReportId(value) {
  return reportIdSchema.safeParse(value).success;
}

const DELETED_ACCOUNT_PREFIX = "deleted-account:";

function isDeletedAccountEmail(value) {
  return String(value || "").startsWith(DELETED_ACCOUNT_PREFIX);
}

export {
  DELETED_ACCOUNT_PREFIX,
  claimHostFromInput,
  clampScheduleInterval,
  cleanAccessMode,
  cleanAccessToken,
  cleanInviteCode,
  cleanIsoDateText,
  cleanReportDomain,
  cleanText,
  cleanUrlText,
  dayWindow,
  hourWindow,
  isDeletedAccountEmail,
  isSafeReportId,
  isSafeUuid,
  isoDaysFromDate,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeDnsHost,
  normalizeDnsTxt,
  normalizeEmail,
  parseJson,
  randomHex,
  safeHostname,
  scheduleCadenceLabel,
  workerAppHost
};
