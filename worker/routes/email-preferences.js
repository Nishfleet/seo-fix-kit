import { escapeHtml } from "../../shared/html.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { emailPreferencesFor, preferencesForToken, setAuditEmails } from "../lib/audit-emails.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { body, parseJsonBody, z } from "../lib/validation.js";
import { publicAssetHead, siteFooter, siteHeader } from "./pages.js";

const EmailPreferencesBody = body({ auditEmails: z.boolean() });

async function getEmailPreferences(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Email settings are not set up on this server." }, 503);
  const preferences = await emailPreferencesFor(env, access.ownerEmail);
  return jsonNoStore({ ok: true, auditEmails: preferences ? preferences.auditEmails : false });
}

async function saveEmailPreferences(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Email settings are not set up on this server." }, 503);
  const parsed = await parseJsonBody(request, EmailPreferencesBody);
  if (parsed.error) return json(parsed.error, 400);
  const preferences = await setAuditEmails(env, access.ownerEmail, parsed.data.auditEmails);
  if (!preferences) return json({ error: "This account has no email address to send to." }, 400);
  return jsonNoStore({ ok: true, auditEmails: preferences.auditEmails });
}

function maskEmail(value = "") {
  const [name, domain] = String(value).split("@");
  if (!domain) return "your address";
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

function unsubscribePageHtml(origin, { title, message, action = "" }) {
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - SEO Fix Kit</title>
    <meta name="robots" content="noindex, nofollow" />${publicAssetHead(origin)}
    <style>
      main { margin: 0 auto; max-width: 560px; min-width: 0; padding: clamp(48px, 8vw, 96px) 22px 72px; }
      h1 { font-size: clamp(30px, 5vw, 40px); line-height: var(--leading-heading); margin: 0 0 16px; overflow-wrap: break-word; }
      p { color: var(--ink-soft); font-size: 17px; line-height: 1.6; margin: 0 0 24px; overflow-wrap: anywhere; }
      form { margin: 0 0 16px; }
      .links { display: flex; flex-wrap: wrap; gap: 12px; }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <h1>${escapeHtml(title)}</h1>
      <p>${message}</p>
      ${action}
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: secureHeaders({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    })
  });
}

function notFoundPage(origin) {
  return htmlResponse(
    unsubscribePageHtml(origin, {
      title: "This link doesn’t work",
      message:
        "The unsubscribe link is out of date or was copied incompletely. You can turn audit emails off from the Alerts page in the app.",
      action: `<div class="links"><a class="btn btn-primary" href="${origin}/beta/developers">Open email settings</a></div>`
    }),
    404
  );
}

async function showUnsubscribe(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const token = url.pathname.split("/").pop();
  const preferences = await preferencesForToken(env, token);
  if (!preferences) return notFoundPage(origin);
  const who = escapeHtml(maskEmail(preferences.ownerEmail));
  if (!preferences.auditEmails) {
    return htmlResponse(
      unsubscribePageHtml(origin, {
        title: "You’re already unsubscribed",
        message: `${who} doesn’t get audit emails. Sign-in links and receipts still arrive.`,
        action: `<div class="links"><a class="btn btn-secondary" href="${origin}/beta/developers">Turn them back on</a></div>`
      })
    );
  }
  return htmlResponse(
    unsubscribePageHtml(origin, {
      title: "Stop audit emails?",
      message: `${who} will stop getting “report ready” and weekly check emails. Weekly checks keep running, and the results stay in the app.`,
      action: `<form method="post" action="${escapeHtml(url.pathname)}"><button class="btn btn-primary" type="submit">Stop audit emails</button></form>`
    })
  );
}

async function confirmUnsubscribe(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const token = url.pathname.split("/").pop();
  const preferences = await preferencesForToken(env, token);
  if (!preferences) return notFoundPage(origin);
  await setAuditEmails(env, preferences.ownerEmail, false);
  return htmlResponse(
    unsubscribePageHtml(origin, {
      title: "You’re unsubscribed",
      message: `${escapeHtml(maskEmail(preferences.ownerEmail))} won’t get audit emails anymore. Sign-in links and receipts still arrive. Changed your mind? Turn them back on from the Alerts page.`,
      action: `<div class="links"><a class="btn btn-secondary" href="${origin}/beta/developers">Email settings</a></div>`
    })
  );
}

export { confirmUnsubscribe, getEmailPreferences, maskEmail, saveEmailPreferences, showUnsubscribe };
