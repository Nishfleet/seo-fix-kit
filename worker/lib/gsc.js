import { Google, generateCodeVerifier, generateState } from "arctic";
import { GSC_READONLY_SCOPE, GSC_WINDOW_DAYS, gscPageSummary, normalizeGscPageRows } from "../../shared/gsc-traffic.js";
import { cleanText, isoSecondsFromNow, parseJson, safeHostname } from "./text.js";
import { sha256Hex } from "./security.js";

const GSC_CALLBACK_PATH = "/api/gsc/callback";
const GSC_STATE_TTL_SECONDS = 60 * 10;
const GSC_ROW_LIMIT = 1000;
const SEARCH_ANALYTICS_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites";

const textEncoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function tokenKey(env) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(env.GSC_TOKEN_SECRET || "")));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGscSecret(env, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tokenKey(env);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(String(plaintext || ""))
  );
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

export async function decryptGscSecret(env, encoded) {
  const parts = String(encoded || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return "";
  const key = await tokenKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(parts[1]) },
    key,
    base64UrlDecode(parts[2])
  );
  return new TextDecoder().decode(decrypted);
}

export function gscConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GSC_TOKEN_SECRET && env.WAITLIST_DB);
}

export function gscClient(env, origin) {
  return new Google(String(env.GOOGLE_CLIENT_ID), String(env.GOOGLE_CLIENT_SECRET), `${origin}${GSC_CALLBACK_PATH}`);
}

export function gscAuthorizationUrl(client, scopes = [GSC_READONLY_SCOPE]) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = client.createAuthorizationURL(state, codeVerifier, scopes);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return { url, state, codeVerifier };
}

export async function saveAuthState(env, ownerEmail, state, codeVerifier) {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.batch([
    env.WAITLIST_DB.prepare(`DELETE FROM gsc_auth_states WHERE expires_at <= ?`).bind(now),
    env.WAITLIST_DB.prepare(
      `INSERT INTO gsc_auth_states (state_hash, owner_email, code_verifier, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(await sha256Hex(state), ownerEmail, codeVerifier, now, isoSecondsFromNow(GSC_STATE_TTL_SECONDS))
  ]);
}

export async function takeAuthState(env, state) {
  const stateHash = await sha256Hex(String(state || ""));
  const now = new Date().toISOString();
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM gsc_auth_states WHERE state_hash = ? LIMIT 1`)
    .bind(stateHash)
    .first();
  await env.WAITLIST_DB.prepare(`DELETE FROM gsc_auth_states WHERE state_hash = ?`).bind(stateHash).run();
  if (!row?.code_verifier || row.expires_at <= now) return null;
  return row;
}

export async function saveGscConnection(env, ownerEmail, refreshToken, siteUrl = "") {
  const encrypted = await encryptGscSecret(env, refreshToken);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO gsc_connections (owner_email, site_url, refresh_token_enc, created_at, updated_at, last_synced_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(owner_email) DO UPDATE SET
       site_url = excluded.site_url,
       refresh_token_enc = excluded.refresh_token_enc,
       updated_at = excluded.updated_at`
  )
    .bind(ownerEmail, cleanText(siteUrl, 200), encrypted, now, now)
    .run();
}

export async function loadGscConnection(env, ownerEmail) {
  return env.WAITLIST_DB.prepare(`SELECT * FROM gsc_connections WHERE owner_email = ? LIMIT 1`)
    .bind(ownerEmail)
    .first();
}

export async function deleteGscConnection(env, ownerEmail) {
  await env.WAITLIST_DB.batch([
    env.WAITLIST_DB.prepare(`DELETE FROM gsc_connections WHERE owner_email = ?`).bind(ownerEmail),
    env.WAITLIST_DB.prepare(`DELETE FROM gsc_page_data WHERE owner_email = ?`).bind(ownerEmail)
  ]);
}

export async function saveGscPageRows(env, ownerEmail, siteUrl, rows) {
  const normalized = normalizeGscPageRows(rows, { limit: GSC_ROW_LIMIT });
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO gsc_page_data (owner_email, site_url, page_rows_json, synced_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET
       site_url = excluded.site_url,
       page_rows_json = excluded.page_rows_json,
       synced_at = excluded.synced_at`
  )
    .bind(ownerEmail, cleanText(siteUrl, 200), JSON.stringify(normalized), now)
    .run();
  await env.WAITLIST_DB.prepare(`UPDATE gsc_connections SET last_synced_at = ?, updated_at = ? WHERE owner_email = ?`)
    .bind(now, now, ownerEmail)
    .run();
  return { normalized, syncedAt: now };
}

export async function loadGscPageRows(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(`SELECT * FROM gsc_page_data WHERE owner_email = ? LIMIT 1`)
    .bind(ownerEmail)
    .first();
  if (!row) return null;
  return {
    siteUrl: row.site_url || "",
    syncedAt: row.synced_at || "",
    rows: parseJson(row.page_rows_json, []),
    summary: gscPageSummary(parseJson(row.page_rows_json, []))
  };
}

export async function verifiedHostsForOwner(env, ownerEmail) {
  const result = await env.WAITLIST_DB.prepare(
    `SELECT host FROM site_claims
     WHERE owner_email = ? AND status = 'verified' AND revoked_at IS NULL`
  )
    .bind(ownerEmail)
    .all();
  const hosts = [];
  for (const row of result.results || []) {
    const host = safeHostname(row.host || "") || safeHostname(`https://${row.host || ""}`);
    if (host) hosts.push(host.replace(/^www\./, ""));
  }
  return [...new Set(hosts)];
}

async function gscFetch(url, accessToken, init = {}) {
  // eslint-disable-next-line no-restricted-globals -- fixed Google Search Console API host
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${accessToken}`,
      ...(init.headers?.["content-type"] ? {} : { "content-type": "application/json" })
    }
  });
  return response;
}

export async function fetchGscSiteList(accessToken) {
  const response = await gscFetch("https://www.googleapis.com/webmasters/v3/sites", accessToken);
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.siteEntry) ? payload.siteEntry : [];
}

export function pickGscSiteUrl(siteEntries = [], hosts = []) {
  for (const host of hosts) {
    const domainMatch = siteEntries.find((entry) => entry.siteUrl === `sc-domain:${host}`);
    if (domainMatch?.siteUrl) return domainMatch.siteUrl;
    const wwwMatch = siteEntries.find((entry) => entry.siteUrl === `https://www.${host}/`);
    if (wwwMatch?.siteUrl) return wwwMatch.siteUrl;
    const bareMatch = siteEntries.find((entry) => entry.siteUrl === `https://${host}/`);
    if (bareMatch?.siteUrl) return bareMatch.siteUrl;
  }
  return "";
}

export async function fetchGscPageRows(accessToken, siteUrl, options = {}) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - GSC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await gscFetch(
    `${SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        startDate: options.startDate || startDate,
        endDate: options.endDate || endDate,
        dimensions: ["page"],
        rowLimit: GSC_ROW_LIMIT
      })
    }
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(cleanText(detail?.error?.message, 300) || "Google Search Console data could not be read.");
    error.status = response.status;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.rows) ? payload.rows : [];
}

export { GSC_WINDOW_DAYS };
