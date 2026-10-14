import { escapeHtml } from "../../shared/html.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { publicAssetHead, siteFooter, siteHeader } from "./pages.js";

const BADGE_ID = /^[a-f0-9]{20}$/;
const HISTORY_LIMIT = 12;

function newBadgeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function badgeLinks(origin, id) {
  const pageUrl = `${origin}/score/${id}`;
  const imageUrl = `${origin}/badge/${id}.svg`;
  return {
    id,
    pageUrl,
    imageUrl,
    html: `<a href="${pageUrl}"><img src="${imageUrl}" alt="SEO score checked by SEO Fix Kit" width="150" height="24" /></a>`,
    markdown: `[![SEO score checked by SEO Fix Kit](${imageUrl})](${pageUrl})`
  };
}

async function activeBadge(env, id) {
  if (!BADGE_ID.test(id || "") || !env.WAITLIST_DB) return null;
  return env.WAITLIST_DB.prepare(
    `SELECT id, owner_email, target_host FROM score_badges WHERE id = ? AND revoked_at IS NULL`
  )
    .bind(id)
    .first();
}

async function scoreHistory(env, badge, limit = HISTORY_LIMIT) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT score, total_findings, created_at FROM score_history
     WHERE owner_email = ? AND target_host = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`
  )
    .bind(badge.owner_email, badge.target_host, limit)
    .all();
  return (rows.results || []).reverse();
}

export function scoreTone(score) {
  if (typeof score !== "number") return { color: "#5b6b63", label: "pending" };
  if (score >= 90) return { color: "#0f7a56", label: "good" };
  if (score >= 70) return { color: "#a86206", label: "ok" };
  return { color: "#c2410c", label: "needs work" };
}

export function badgeSvg(score) {
  const value = typeof score === "number" ? `${score}/100` : "pending";
  const tone = scoreTone(score);
  const left = 92;
  const right = 58;
  const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24" role="img" aria-label="SEO Fix Kit score: ${value}">
  <title>SEO Fix Kit score: ${value}</title>
  <clipPath id="r"><rect width="${width}" height="24" rx="5"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${left}" height="24" fill="#0b1712"/>
    <rect x="${left}" width="${right}" height="24" fill="${tone.color}"/>
  </g>
  <g fill="#98f0cc">
    <rect x="8" y="7" width="2.6" height="2.6" rx=".5"/><rect x="11.7" y="7" width="2.6" height="2.6" rx=".5" opacity=".35"/><rect x="15.4" y="7" width="2.6" height="2.6" rx=".5"/>
    <rect x="8" y="10.7" width="2.6" height="2.6" rx=".5" opacity=".35"/><rect x="11.7" y="10.7" width="2.6" height="2.6" rx=".5"/><rect x="15.4" y="10.7" width="2.6" height="2.6" rx=".5" opacity=".35"/>
    <rect x="8" y="14.4" width="2.6" height="2.6" rx=".5"/><rect x="11.7" y="14.4" width="2.6" height="2.6" rx=".5" opacity=".35"/><rect x="15.4" y="14.4" width="2.6" height="2.6" rx=".5"/>
  </g>
  <g fill="#fff" font-family="Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600">
    <text x="24" y="16">SEO Fix Kit</text>
    <text x="${left + right / 2}" y="16" text-anchor="middle">${value}</text>
  </g>
</svg>`;
}

async function ownedReport(env, ownerEmail, reportId) {
  return env.WAITLIST_DB.prepare(`SELECT id, target_host FROM audit_reports WHERE id = ? AND owner_email = ?`)
    .bind(reportId, ownerEmail)
    .first();
}

export async function createScoreBadge(request, env, params, origin) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Badges are not set up on this server." }, 503);
  const report = await ownedReport(env, access.ownerEmail, params.id);
  if (!report?.target_host) return json({ error: "Report not found." }, 404);
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO score_badges (id, owner_email, target_host, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_email, target_host) DO UPDATE SET revoked_at = NULL`
  )
    .bind(newBadgeId(), access.ownerEmail, report.target_host, now)
    .run();
  const badge = await env.WAITLIST_DB.prepare(`SELECT id FROM score_badges WHERE owner_email = ? AND target_host = ?`)
    .bind(access.ownerEmail, report.target_host)
    .first();
  return jsonNoStore({ ok: true, host: report.target_host, badge: badgeLinks(origin, badge.id) });
}

export async function getScoreBadgeForReport(request, env, params, origin) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return jsonNoStore({ ok: true, badge: null });
  const report = await ownedReport(env, access.ownerEmail, params.id);
  if (!report?.target_host) return json({ error: "Report not found." }, 404);
  const badge = await env.WAITLIST_DB.prepare(
    `SELECT id FROM score_badges WHERE owner_email = ? AND target_host = ? AND revoked_at IS NULL`
  )
    .bind(access.ownerEmail, report.target_host)
    .first();
  return jsonNoStore({ ok: true, host: report.target_host, badge: badge ? badgeLinks(origin, badge.id) : null });
}

export async function revokeScoreBadge(request, env, params) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB) return json({ error: "Badges are not set up on this server." }, 503);
  const result = await env.WAITLIST_DB.prepare(
    `UPDATE score_badges SET revoked_at = ? WHERE id = ? AND owner_email = ? AND revoked_at IS NULL`
  )
    .bind(new Date().toISOString(), params.id, access.ownerEmail)
    .run();
  if (!result.meta?.changes) return json({ error: "Badge not found." }, 404);
  return jsonNoStore({ ok: true });
}

export async function serveBadgeSvg(request, env, params) {
  const badge = await activeBadge(env, String(params.file || "").replace(/\.svg$/, ""));
  const [latest] = badge ? await scoreHistory(env, badge, 1).then((rows) => rows.slice(-1)) : [];
  return new Response(badge ? badgeSvg(latest ? Number(latest.score) : null) : badgeSvg(null), {
    status: badge ? 200 : 404,
    headers: secureHeaders({
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*"
    })
  });
}

function sparkline(points = []) {
  if (points.length < 2) return "";
  const width = 560;
  const height = 120;
  const step = width / (points.length - 1);
  const y = (score) => height - 8 - (Math.max(0, Math.min(100, score)) / 100) * (height - 16);
  const path = points.map(
    (point, index) => `${index ? "L" : "M"}${(index * step).toFixed(1)},${y(point.score).toFixed(1)}`
  );
  const last = points.at(-1);
  return `<svg class="score-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score over the last ${points.length} checks" preserveAspectRatio="none">
      <path d="${path.join(" ")}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${((points.length - 1) * step).toFixed(1)}" cy="${y(last.score).toFixed(1)}" r="5" fill="currentColor"/>
    </svg>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function scorePageHtml(origin, { id, host, points }) {
  const latest = points.at(-1) || null;
  const first = points[0] || null;
  const score = latest ? Number(latest.score) : null;
  const tone = scoreTone(score);
  const change = latest && first && points.length > 1 ? Number(latest.score) - Number(first.score) : 0;
  const title = `${host} SEO score${latest ? `: ${score}/100` : ""}`;
  const description = latest
    ? `${host} scored ${score}/100 in its latest SEO Fix Kit check on ${formatDate(latest.created_at)}${
        change > 0 ? `, up ${change} points since ${formatDate(first.created_at)}` : ""
      }.`
    : `${host} is checked by SEO Fix Kit. The first score appears after its next check.`;
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | SEO Fix Kit</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="noindex, follow" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${origin}/score/${id}" />
    <meta property="og:image" content="${origin}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />${publicAssetHead(origin)}
    <style>
      main { margin: 0 auto; max-width: 720px; min-width: 0; padding: clamp(40px, 7vw, 88px) 22px 72px; }
      .score-eyebrow { color: var(--ink-muted); font-size: 14px; font-weight: 600; letter-spacing: .04em; margin: 0 0 12px; text-transform: uppercase; }
      h1 { font-size: clamp(30px, 5vw, 44px); line-height: var(--leading-heading); margin: 0 0 24px; overflow-wrap: anywhere; }
      .score-card { border: 1px solid var(--line); border-radius: 16px; padding: clamp(20px, 4vw, 32px); background: var(--surface, #fff); }
      .score-big { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 0 0 8px; }
      .score-big strong { color: ${tone.color}; font-size: clamp(56px, 12vw, 88px); font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; }
      .score-big span { color: var(--ink-muted); font-size: 20px; }
      .score-change { background: color-mix(in srgb, #0f7a56 12%, transparent); border-radius: 999px; color: #0f7a56; font-size: 14px; font-weight: 600; padding: 4px 10px; }
      .score-meta { color: var(--ink-soft); margin: 0 0 20px; }
      .score-trend { color: ${tone.color}; display: block; height: 120px; width: 100%; }
      .score-cta { margin-top: 32px; }
      .score-cta p { color: var(--ink-soft); margin: 0 0 16px; }
    </style>
  </head>
  <body>
    ${siteHeader(origin)}
    <main class="hero-light" id="main">
      <p class="score-eyebrow">Checked by SEO Fix Kit</p>
      <h1>${escapeHtml(host)}</h1>
      <section class="score-card" aria-label="Latest score">
        <p class="score-big"><strong>${latest ? score : "–"}</strong><span>/100</span>${
          change > 0
            ? `<span class="score-change">+${change} since ${escapeHtml(formatDate(first.created_at))}</span>`
            : ""
        }</p>
        <p class="score-meta">${
          latest
            ? `Latest check ${escapeHtml(formatDate(latest.created_at))} · ${Number(latest.total_findings)} open ${
                Number(latest.total_findings) === 1 ? "problem" : "problems"
              } · ${points.length} ${points.length === 1 ? "check" : "checks"} shown`
            : "No checks yet."
        }</p>
        ${sparkline(points.map((point) => ({ score: Number(point.score) })))}
      </section>
      <div class="score-cta">
        <p>SEO Fix Kit loads every page in a real browser, finds what hurts rankings and AI answers, and hands you the fix.</p>
        <a class="btn btn-primary" href="${origin}/?ref=score-badge">Check your site free</a>
      </div>
    </main>
    ${siteFooter(origin)}
  </body>
</html>`;
}

export async function showScorePage(request, env, params, origin) {
  const badge = await activeBadge(env, params.id);
  if (!badge) {
    return new Response("Not found", { status: 404, headers: secureHeaders({ "content-type": "text/plain" }) });
  }
  const points = await scoreHistory(env, badge);
  return new Response(scorePageHtml(origin, { id: badge.id, host: badge.target_host, points }), {
    headers: secureHeaders({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=600"
    })
  });
}
