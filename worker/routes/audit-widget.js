import { escapeHtml } from "../../shared/html.js";
import { resolvesToPrivateAddress } from "../../shared/url-safety.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { sendWorkerEmail } from "../lib/email.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { checkQuotaSet, requestIpHash } from "../lib/security.js";
import { body, email, number, parseJsonBody, text, z } from "../lib/validation.js";
import { auditUrl } from "./audits.js";
import { friendlyCheckError, publicCheckQuotaChecks, validatePublicCheckUrl } from "./public-check.js";

const WIDGET_ID = /^[a-f0-9]{20}$/;
const LEADS_SHOWN = 50;
const DEFAULT_COLOR = "#0f7a56";

const WidgetCheckBody = body({
  url: text(2048),
  email: email(),
  company: z.unknown().optional().transform(Boolean),
  timeToSubmitMs: number().transform((ms) => Math.round(ms || 0))
});

function newWidgetId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function widgetEmbedCode(origin, id) {
  return `<iframe src="${origin}/embed/${id}" title="Free SEO check" width="100%" height="480" loading="lazy" style="border:0;max-width:640px;width:100%"></iframe>`;
}

async function activeWidget(env, id) {
  if (!WIDGET_ID.test(id || "") || !env.WAITLIST_DB) return null;
  return env.WAITLIST_DB.prepare(`SELECT id, owner_email FROM audit_widgets WHERE id = ? AND revoked_at IS NULL`)
    .bind(id)
    .first();
}

async function ownerBranding(env, ownerEmail) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT agency_name, brand_color FROM report_branding WHERE owner_email = ?`
  )
    .bind(ownerEmail)
    .first();
  const color = /^#[0-9a-f]{6}$/i.test(row?.brand_color || "") ? row.brand_color : DEFAULT_COLOR;
  return { name: row?.agency_name || "", color };
}

async function widgetPayload(env, origin, ownerEmail) {
  const widget = await env.WAITLIST_DB.prepare(
    `SELECT id FROM audit_widgets WHERE owner_email = ? AND revoked_at IS NULL`
  )
    .bind(ownerEmail)
    .first();
  if (!widget) return { ok: true, widget: null, leads: [] };
  const leads = await env.WAITLIST_DB.prepare(
    `SELECT email, url, score, problems, created_at FROM widget_leads WHERE owner_email = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`
  )
    .bind(ownerEmail, LEADS_SHOWN)
    .all();
  return {
    ok: true,
    widget: { id: widget.id, url: `${origin}/embed/${widget.id}`, embedCode: widgetEmbedCode(origin, widget.id) },
    leads: (leads.results || []).map((lead) => ({
      email: lead.email,
      url: lead.url,
      score: lead.score,
      problems: lead.problems,
      createdAt: lead.created_at
    }))
  };
}

export async function getAuditWidget(request, env, _params, origin) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "The audit widget is not set up on this server." }, 503);
  return jsonNoStore(await widgetPayload(env, origin, access.ownerEmail));
}

export async function createAuditWidget(request, env, _params, origin) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "The audit widget is not set up on this server." }, 503);
  await env.WAITLIST_DB.prepare(
    `INSERT INTO audit_widgets (id, owner_email, created_at) VALUES (?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET revoked_at = NULL`
  )
    .bind(newWidgetId(), access.ownerEmail, new Date().toISOString())
    .run();
  return jsonNoStore(await widgetPayload(env, origin, access.ownerEmail));
}

export async function revokeAuditWidget(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "The audit widget is not set up on this server." }, 503);
  await env.WAITLIST_DB.prepare(`UPDATE audit_widgets SET revoked_at = ? WHERE owner_email = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), access.ownerEmail)
    .run();
  return jsonNoStore({ ok: true, widget: null, leads: [] });
}

function topProblems(report) {
  return (report?.repairPlan || [])
    .slice(0, 3)
    .map((item) => ({ severity: item.severity, title: item.title, scoreGain: item.scoreGain || 0 }));
}

async function notifyOwner(env, origin, widget, lead, problems) {
  if (!env.EMAIL) return;
  const host = new URL(lead.url).hostname;
  const list = problems.map((item) => `- ${item.title}`).join("\n");
  const htmlList = problems.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("");
  await sendWorkerEmail(env, {
    to: widget.owner_email,
    subject: `New lead: ${host} scored ${lead.score}/100`,
    preheader: `${lead.email} just checked ${host} with your audit widget.`,
    tag: "widget-lead",
    text: `${lead.email} just checked ${lead.url} with your audit widget.\n\nScore: ${lead.score}/100, ${lead.problems} problems.\n${list}\n\nReply to them at ${lead.email}. All your leads: ${origin}/beta/developers`,
    html: `<p><strong>${escapeHtml(lead.email)}</strong> just checked <a href="${escapeHtml(lead.url)}">${escapeHtml(host)}</a> with your audit widget.</p>
<p>Score: <strong>${lead.score}/100</strong>, ${lead.problems} problems.</p>${htmlList ? `<ul>${htmlList}</ul>` : ""}
<p>Reply to them at <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>. <a href="${origin}/beta/developers">See all your leads</a>.</p>`
  });
}

export function widgetCheckHandler({ audit = auditUrl, isPrivateHost = resolvesToPrivateAddress } = {}) {
  return (request, env, params, origin, ctx) => checkForWidget(request, env, params, origin, ctx, audit, isPrivateHost);
}

export const runWidgetCheck = widgetCheckHandler();

async function checkForWidget(request, env, params, origin, ctx, audit, isPrivateHost) {
  const widget = await activeWidget(env, params.id);
  if (!widget) return jsonNoStore({ error: "This widget is turned off." }, 404);
  const parsed = await parseJsonBody(request, WidgetCheckBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const input = parsed.data;
  if (input.company || (input.timeToSubmitMs > 0 && input.timeToSubmitMs < 1200)) {
    return jsonNoStore({ error: "Please try again." }, 400);
  }
  const validated = validatePublicCheckUrl(input.url);
  if (!validated.ok) return jsonNoStore({ error: validated.error }, 400);
  const hostname = new URL(validated.url).hostname;
  if (await isPrivateHost(hostname)) {
    return jsonNoStore({ error: "This URL points at a private or internal address and cannot be checked." }, 400);
  }
  const quota = await checkQuotaSet(env, await publicCheckQuotaChecks(await requestIpHash(request), hostname));
  if (!quota.ok) return jsonNoStore({ error: quota.error, resetAt: quota.resetAt }, 429);

  let report;
  try {
    report = await audit(validated.url, env, { maxPages: 1, appOrigin: origin });
  } catch (error) {
    if (error?.code === "BROWSER_BUSY") {
      return jsonNoStore({ error: "All check browsers are busy right now. Wait a minute and try again." }, 503);
    }
    return jsonNoStore({ error: friendlyCheckError(error?.message) }, 422);
  }
  const summary = report.summary || {};
  const lead = {
    email: input.email,
    url: report.url || validated.url,
    score: Number(report.score) || 0,
    problems: (summary.critical || 0) + (summary.warnings || 0) + (summary.notices || 0)
  };
  await env.WAITLIST_DB.prepare(
    `INSERT INTO widget_leads (widget_id, owner_email, email, url, score, problems, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(widget.id, widget.owner_email, lead.email, lead.url, lead.score, lead.problems, new Date().toISOString())
    .run();
  const problems = topProblems(report);
  const sending = notifyOwner(env, origin, widget, lead, problems).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(sending);
  else await sending;
  return jsonNoStore({
    ok: true,
    url: lead.url,
    score: lead.score,
    issues: { critical: summary.critical || 0, warnings: summary.warnings || 0, notices: summary.notices || 0 },
    problems
  });
}

function scriptString(value) {
  return JSON.stringify(String(value)).replace(/</g, "\\u003c");
}

export function widgetPageHtml(origin, { id, brand }) {
  const owner = brand.name ? escapeHtml(brand.name) : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Free SEO check</title>
    <style>
      :root { --brand: ${brand.color}; --ink: #0b1712; --soft: #4b5a53; --line: #dfe5e1; --bg: #fff; color-scheme: light; }
      * { box-sizing: border-box; }
      body { background: var(--bg); color: var(--ink); font: 15px/1.5 Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; }
      main { border: 1px solid var(--line); border-radius: 16px; margin: 0 auto; max-width: 640px; padding: clamp(18px, 4vw, 28px); }
      h1 { font-size: 22px; line-height: 1.25; margin: 0 0 6px; }
      p { color: var(--soft); margin: 0 0 16px; }
      label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 6px; }
      input { border: 1px solid var(--line); border-radius: 10px; font: inherit; margin: 0 0 14px; min-height: 44px; padding: 0 12px; width: 100%; }
      input:focus { border-color: var(--brand); outline: 2px solid color-mix(in srgb, var(--brand) 25%, transparent); }
      button { background: var(--brand); border: 0; border-radius: 10px; color: #fff; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 600; min-height: 46px; padding: 0 18px; width: 100%; }
      button[disabled] { opacity: .7; cursor: progress; }
      .trap { left: -9999px; position: absolute; }
      .error { color: #b42318; font-size: 14px; margin: 10px 0 0; }
      .result { display: grid; gap: 14px; }
      .score { align-items: baseline; display: flex; gap: 8px; }
      .score strong { color: var(--brand); font-size: 56px; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; }
      .score span { color: var(--soft); font-size: 18px; }
      ol { margin: 0; padding-left: 20px; }
      li { margin: 0 0 6px; }
      .sev { border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; margin-right: 6px; padding: 1px 7px; text-transform: uppercase; }
      .sev.critical { background: #fde7e4; color: #b42318; } .sev.warning { background: #fdf1dc; color: #8a5300; } .sev.notice { background: #e7efeb; color: #33463d; }
      footer { color: var(--soft); font-size: 12px; margin-top: 16px; text-align: center; }
      footer a { color: inherit; }
    </style>
  </head>
  <body>
    <main>
      <form id="check" novalidate>
        <h1>How healthy is your site's SEO?</h1>
        <p>Get a free score and the top problems to fix in about 30 seconds.</p>
        <label for="url">Website</label>
        <input id="url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="yourwebsite.com" required />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" placeholder="you@company.com" required />
        <input class="trap" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <button type="submit">Check my site</button>
        <p class="error" id="error" role="alert" hidden></p>
      </form>
      <section class="result" id="result" hidden aria-live="polite"></section>
      <footer>${owner ? `${owner} · ` : ""}Powered by <a href="${origin}/?ref=widget" target="_blank" rel="noopener">SEO Fix Kit</a></footer>
    </main>
    <script>
      const form = document.getElementById("check");
      const error = document.getElementById("error");
      const result = document.getElementById("result");
      const startedAt = Date.now();
      const doneMessage = ${scriptString(
        brand.name
          ? `${brand.name} has your results and will be in touch with the full fix list.`
          : "The team behind this site has your results and will follow up with the full fix list."
      )};
      const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button");
        error.hidden = true;
        button.disabled = true;
        button.textContent = "Checking your site…";
        try {
          const response = await fetch("/api/embed/${id}/check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              url: form.url.value,
              email: form.email.value,
              company: form.company.value,
              timeToSubmitMs: Date.now() - startedAt
            })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "The check didn't finish. Try again.");
          const host = new URL(data.url).hostname;
          const items = data.problems.map((p) => "<li><span class='sev " + esc(p.severity) + "'>" + esc(p.severity) + "</span>" + esc(p.title) + "</li>").join("");
          result.innerHTML =
            "<h1>" + esc(host) + "</h1>" +
            "<div class='score'><strong>" + esc(data.score) + "</strong><span>/100</span></div>" +
            "<p>" + esc(data.issues.critical) + " critical, " + esc(data.issues.warnings) + " warnings, " + esc(data.issues.notices) + " notices.</p>" +
            (items ? "<div><strong>Fix these first</strong><ol>" + items + "</ol></div>" : "<p>No problems found on this page.</p>") +
            "<p>" + esc(doneMessage) + "</p>";
          form.hidden = true;
          result.hidden = false;
        } catch (failure) {
          error.textContent = failure.message;
          error.hidden = false;
          button.disabled = false;
          button.textContent = "Check my site";
        }
      });
    </script>
  </body>
</html>`;
}

export async function showWidgetPage(request, env, params, origin) {
  const widget = await activeWidget(env, params.id);
  if (!widget) {
    return new Response("This widget is turned off.", {
      status: 404,
      headers: secureHeaders({ "content-type": "text/plain; charset=utf-8" })
    });
  }
  const brand = await ownerBranding(env, widget.owner_email);
  const headers = secureHeaders({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-robots-tag": "noindex, nofollow"
  });
  headers.delete("x-frame-options");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors *"
  );
  return new Response(widgetPageHtml(origin, { id: widget.id, brand }), { headers });
}
