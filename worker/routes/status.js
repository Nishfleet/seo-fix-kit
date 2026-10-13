// Public service status: /status (page) and /api/status (JSON). Each part of
// the product is checked live on every request (bindings, provider config and
// a database round trip), so the page shows what is true right now. It is
// not an uptime history and doesn't claim to be one.
import { dodoCheckoutConfigStatus } from "../../shared/dodo.js";
import { VERSION } from "../../shared/audit-engine.js";
import { esc } from "../../shared/free-tools/render.js";
import { jsonNoStore } from "../lib/http.js";
import { bindingStatus } from "./health.js";
import { publicProductPageHtml } from "./pages.js";

async function databaseCheck(env) {
  if (!env.WAITLIST_DB) return { ok: false, lastAuditAt: null };
  try {
    const row = await env.WAITLIST_DB.prepare(
      "SELECT MAX(completed_at) AS last FROM audit_jobs WHERE status = 'completed'"
    ).first();
    return { ok: true, lastAuditAt: row?.last || null };
  } catch {
    return { ok: false, lastAuditAt: null };
  }
}

export async function serviceStatus(env = {}) {
  const bindings = bindingStatus(env);
  const database = await databaseCheck(env);
  const dodo = dodoCheckoutConfigStatus(env);
  const components = [
    { key: "website", name: "Website and API", ok: true, detail: "Serving this page." },
    {
      key: "audits",
      name: "Page checks and site audits",
      ok: bindings.browserRun && bindings.auditQueue && database.ok,
      detail: "Real-browser rendering, the audit queue and the database."
    },
    {
      key: "reports",
      name: "Saved reports and share links",
      ok: bindings.reportStorage && database.ok,
      detail: "Report storage and the database."
    },
    {
      key: "sign-in",
      name: "Sign-in emails",
      ok: bindings.emailNotifications,
      detail: "Sending the email that signs you in."
    },
    {
      key: "payments",
      name: "Fix Pack checkout",
      ok: Boolean(dodo.checkoutReady && dodo.webhookSecret),
      detail: "Checkout and payment confirmation through Dodo Payments."
    }
  ];
  const down = components.filter((component) => !component.ok);
  return {
    ok: down.length === 0,
    status: down.length === 0 ? "operational" : "degraded",
    summary:
      down.length === 0 ? "All systems working" : `${down.length} part${down.length === 1 ? "" : "s"} not working`,
    checkedAt: new Date().toISOString(),
    lastAuditCompletedAt: database.lastAuditAt,
    version: VERSION,
    components: components.map(({ key, name, ok, detail }) => ({
      key,
      name,
      status: ok ? "operational" : "down",
      detail
    }))
  };
}

export async function getStatusJson(_request, env) {
  return jsonNoStore(await serviceStatus(env));
}

function relativeTime(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

export function statusHtml(origin, status) {
  const rows = status.components
    .map(
      (component) => `<li class="status-row">
            <span class="status-dot ${component.status === "operational" ? "up" : "down"}" aria-hidden="true"></span>
            <span><strong>${esc(component.name)}</strong><small>${esc(component.detail)}</small></span>
            <span class="status-word ${component.status === "operational" ? "up" : "down"}">${component.status === "operational" ? "Working" : "Not working"}</span>
          </li>`
    )
    .join("\n          ");
  const lastAudit = status.lastAuditCompletedAt ? relativeTime(status.lastAuditCompletedAt) : null;
  return publicProductPageHtml({
    origin,
    path: "/status",
    title: "Status",
    description:
      "Live status of SEO Fix Kit: page checks, site audits, saved reports, sign-in emails and Fix Pack checkout, checked when you load the page.",
    eyebrow: "Status",
    heading: status.ok ? "All systems working." : "Some things aren’t working.",
    lead: status.ok
      ? "Every part of SEO Fix Kit passed its check just now."
      : "Parts marked below are not working right now. We’re on it.",
    body: `
      <section class="status-board" aria-label="Service status">
        <div class="status-head ${status.ok ? "up" : "down"}">
          <span class="status-dot ${status.ok ? "up" : "down"}" aria-hidden="true"></span>
          <strong>${esc(status.summary)}</strong>
          <time datetime="${esc(status.checkedAt)}">Checked ${esc(status.checkedAt.replace("T", " ").slice(0, 16))} UTC</time>
        </div>
        <ul class="status-list">
          ${rows}
        </ul>
      </section>
      <section class="band">
        <h2>About this page</h2>
        <p>Each part is checked live when you load this page: the services it depends on are connected and the database answers.${
          lastAudit ? ` The last site audit finished ${esc(lastAudit)}.` : ""
        } It isn’t an uptime history.</p>
        <p>Something not working that shows as working here? Email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>. Developers can read the same data as JSON at <a href="${origin}/api/status"><code>/api/status</code></a>.</p>
      </section>`,
    extraStyle: `
      .status-board { background: var(--card-bg); border: 1px solid var(--line); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); margin: 0 0 40px; overflow: hidden; }
      .status-head { align-items: center; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 18px 24px; }
      .status-head.up { background: var(--success-surface); }
      .status-head.down { background: var(--error-surface); }
      .status-head strong { color: var(--ink); font-size: 17px; }
      .status-head time { color: var(--ink-muted); font-size: 13px; margin-left: auto; }
      .status-list { list-style: none; margin: 0; padding: 0; }
      .status-row { align-items: center; border-top: 1px solid var(--line); display: grid; gap: 14px; grid-template-columns: auto minmax(0, 1fr) auto; padding: 16px 24px; }
      .status-row:first-child { border-top: 0; }
      .status-row strong { color: var(--ink); display: block; font-size: 15px; font-weight: 600; }
      .status-row small { color: var(--ink-muted); display: block; font-size: 13px; line-height: 1.5; }
      .status-dot { border-radius: 50%; display: inline-block; flex: none; height: 10px; width: 10px; }
      .status-dot.up { background: var(--success); box-shadow: 0 0 0 4px var(--success-surface); }
      .status-dot.down { background: var(--error); box-shadow: 0 0 0 4px var(--error-surface); }
      .status-word { font-size: 13px; font-weight: 600; }
      .status-word.up { color: var(--success); }
      .status-word.down { color: var(--error); }
      @media (max-width: 600px) { .status-head, .status-row { padding-left: 16px; padding-right: 16px; } .status-head time { margin-left: 0; width: 100%; } }`
  });
}
