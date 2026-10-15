import { buildFixKitFiles, fixKitFilename, fixKitManifest } from "../../shared/fix-kit-files.js";
import { zipFiles } from "../../shared/zip.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { json, jsonNoStore } from "../lib/http.js";
import { ownerReportRow } from "../lib/report-data.js";
import { parseJson } from "../lib/text.js";

export const FIX_KIT_UNLOCKED_STATUSES = ["paid", "in_progress", "delivered"];

async function fixKitContext(request, env, params) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return { response: betaAccessResponse(access) };
  if (!env.WAITLIST_DB) return { response: json({ error: "Reports are not set up on this server." }, 503) };
  const row = await ownerReportRow(env, params.id, access);
  const report = row ? parseJson(row.report_json, null) : null;
  if (!report) return { response: json({ error: "Report not found." }, 404) };
  const paid = await env.WAITLIST_DB.prepare(
    `SELECT status FROM fix_requests
     WHERE report_id = ? AND owner_email = ? AND status IN (${FIX_KIT_UNLOCKED_STATUSES.map(() => "?").join(", ")})
     LIMIT 1`
  )
    .bind(params.id, access.ownerEmail, ...FIX_KIT_UNLOCKED_STATUSES)
    .first();
  return { report, unlocked: Boolean(paid) || access.accessMode === "founder-override" };
}

export async function getFixKit(request, env, params) {
  const context = await fixKitContext(request, env, params);
  if (context.response) return context.response;
  return jsonNoStore({ ok: true, unlocked: context.unlocked, manifest: fixKitManifest(context.report) });
}

export async function downloadFixKit(request, env, params) {
  const context = await fixKitContext(request, env, params);
  if (context.response) return context.response;
  if (!context.unlocked) {
    return json({ error: "The fix files come with the Fix Pack for this report.", code: "FIX_KIT_LOCKED" }, 402);
  }
  const filename = fixKitFilename(context.report);
  const folder = filename.replace(/\.zip$/, "");
  const files = buildFixKitFiles(context.report).map((file) => ({ ...file, path: `${folder}/${file.path}` }));
  return new Response(zipFiles(files), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store"
    }
  });
}
