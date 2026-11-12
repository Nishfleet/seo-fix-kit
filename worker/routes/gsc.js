import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { gscPageSummary } from "../../shared/gsc-traffic.js";
import {
  deleteGscConnection,
  decryptGscSecret,
  fetchGscPageRows,
  fetchGscSiteList,
  gscAuthorizationUrl,
  gscClient,
  gscConfigured,
  loadGscConnection,
  loadGscPageRows,
  pickGscSiteUrl,
  refreshGscAccessToken,
  saveAuthState,
  saveGscConnection,
  saveGscPageRows,
  takeAuthState,
  verifiedHostsForOwner
} from "../lib/gsc.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { cleanText } from "../lib/text.js";

function gscOrigin(request) {
  return new URL(request.url).origin;
}

function gscRedirect(origin, status) {
  return new Response(null, { status: 302, headers: secureHeaders({ Location: `${origin}/beta?gsc=${status}` }) });
}

function notConfigured() {
  return json(
    {
      error:
        "Google Search Console sign-in is not configured on this server yet. The Google OAuth client is an account step and is still pending."
    },
    503
  );
}

async function startGscConnect(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!gscConfigured(env)) return notConfigured();
  const origin = gscOrigin(request);
  const { url, state, codeVerifier } = gscAuthorizationUrl(gscClient(env, origin));
  await saveAuthState(env, access.ownerEmail, state, codeVerifier);
  return jsonNoStore({ ok: true, authorizeUrl: url.toString() });
}

async function gscCallback(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = cleanText(url.searchParams.get("code") || "", 2048);
  const state = cleanText(url.searchParams.get("state") || "", 256);
  const errorParam = cleanText(url.searchParams.get("error") || "", 120);
  if (errorParam || !code || !state) return gscRedirect(origin, "error");

  const stateRow = await takeAuthState(env, state);
  if (!stateRow) return gscRedirect(origin, "error");
  const access = await betaAccessStatus(request, env);
  if (!access.ok || access.ownerEmail !== stateRow.owner_email) return gscRedirect(origin, "error");

  let accessToken;
  let refreshToken;
  try {
    const tokens = await gscClient(env, origin).validateAuthorizationCode(code, stateRow.code_verifier);
    accessToken = tokens.accessToken();
    refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : "";
  } catch {
    return gscRedirect(origin, "error");
  }
  if (!refreshToken) return gscRedirect(origin, "no-refresh-token");

  let siteUrl;
  try {
    const sites = await fetchGscSiteList(accessToken);
    const hosts = await verifiedHostsForOwner(env, access.ownerEmail);
    siteUrl = pickGscSiteUrl(sites, hosts);
  } catch (error) {
    console.error("Google Search Console site lookup failed", error);
    siteUrl = "";
  }
  await saveGscConnection(env, access.ownerEmail, refreshToken, siteUrl);
  return gscRedirect(origin, siteUrl ? "connected" : "connected-no-site");
}

async function getGscConnection(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!gscConfigured(env)) return json({ ok: true, connected: false, configured: false });
  const row = await loadGscConnection(env, access.ownerEmail);
  if (!row) return json({ ok: true, connected: false, configured: true });
  const pageData = await loadGscPageRows(env, access.ownerEmail);
  return json({
    ok: true,
    connected: true,
    configured: true,
    siteUrl: row.site_url || pageData?.siteUrl || "",
    syncedAt: pageData?.syncedAt || row.last_synced_at || "",
    summary: pageData?.summary || null
  });
}

async function disconnectGsc(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  const row = await loadGscConnection(env, access.ownerEmail);
  if (row && gscConfigured(env)) {
    try {
      const refreshToken = String((await decryptGscSecret(env, row.refresh_token_enc)) || "");
      if (refreshToken) await gscClient(env, gscOrigin(request)).revokeToken(refreshToken);
    } catch {
      await deleteGscConnection(env, access.ownerEmail);
      return jsonNoStore({ ok: true });
    }
  }
  await deleteGscConnection(env, access.ownerEmail);
  return jsonNoStore({ ok: true });
}

async function syncGsc(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!gscConfigured(env)) return notConfigured();
  const row = await loadGscConnection(env, access.ownerEmail);
  if (!row) return json({ error: "Connect Google Search Console first." }, 400);

  const client = gscClient(env, gscOrigin(request));
  let refreshToken;
  try {
    refreshToken = String((await decryptGscSecret(env, row.refresh_token_enc)) || "");
  } catch {
    return json({ error: "The stored Google token could not be read. Disconnect and connect again." }, 409);
  }
  if (!refreshToken) return json({ error: "The stored Google token is missing. Disconnect and connect again." }, 409);

  let tokens;
  try {
    tokens = await refreshGscAccessToken(client, refreshToken);
  } catch {
    return json({ error: "Google could not refresh the connection. Disconnect and connect again." }, 401);
  }
  const nextRefreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : "";
  if (nextRefreshToken && nextRefreshToken !== refreshToken) {
    await saveGscConnection(env, access.ownerEmail, nextRefreshToken, row.site_url || "");
    refreshToken = nextRefreshToken;
  }

  const accessToken = tokens.accessToken();
  let siteUrl = row.site_url || "";
  if (!siteUrl) {
    const hosts = await verifiedHostsForOwner(env, access.ownerEmail);
    const sites = await fetchGscSiteList(accessToken).catch(() => []);
    siteUrl = pickGscSiteUrl(sites, hosts);
    if (siteUrl) await saveGscConnection(env, access.ownerEmail, refreshToken, siteUrl);
  }
  if (!siteUrl) {
    return json(
      {
        error:
          "No verified property for your account is in Google Search Console yet. Verify the site in Google Search Console, then sync again."
      },
      409
    );
  }

  try {
    const rows = await fetchGscPageRows(accessToken, siteUrl);
    const saved = await saveGscPageRows(env, access.ownerEmail, siteUrl, rows);
    return jsonNoStore({ ok: true, siteUrl, syncedAt: saved.syncedAt, summary: gscPageSummary(saved.normalized) });
  } catch (error) {
    return json({ error: error?.message || "Google Search Console data could not be read." }, error?.status || 502);
  }
}

export { disconnectGsc, getGscConnection, gscCallback, startGscConnect, syncGsc };
