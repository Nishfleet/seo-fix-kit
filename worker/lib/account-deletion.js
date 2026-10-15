import { isEmailConfigured } from "../../shared/fulfillment.js";
import { recordReportBlobDeletionFailure } from "./report-data.js";
import { sendWorkerEmail } from "./email.js";
import { sha256Hex } from "./security.js";
import { cleanText, normalizeEmail } from "./text.js";

// Deletes one account and everything stored for it. Payment records the merchant
// of record and tax law need for reconciliation are kept with every personal field
// cleared and the owner replaced by a random pseudonym; every other row is deleted.

// Fix Pack requests in these states still owe the customer a repair, a refund or a
// dispute answer, so the account stays until they settle.
const OPEN_FIX_REQUEST_STATUSES = ["paid", "in_progress", "refund_failed", "disputed"];

// A request that never reached checkout has no payment trail and is deleted outright.
const UNPAID_FIX_REQUEST = `status = 'new'
  AND COALESCE(checkout_session_id, '') = ''
  AND COALESCE(payment_id, '') = ''
  AND NOT EXISTS (SELECT 1 FROM fix_request_payments p WHERE p.fix_request_id = fix_requests.id)`;

const REDACTED = "[deleted account]";
const R2_DELETE_CHUNK = 1000;

const BLOCKER_MESSAGES = {
  invalid_email: "Enter a valid account email.",
  open_fix_pack:
    "A Fix Pack on this account is paid, in progress, or has an open refund or dispute. Delete the account once it is delivered or refunded, or email support@seofixkit.com.",
  active_subscription:
    "This account has a Proof Monitoring subscription. Cancel it first (email support@seofixkit.com if you need help), then delete the account."
};

function deletionBlockedMessage(blockers = []) {
  return (
    blockers
      .map((blocker) => BLOCKER_MESSAGES[blocker])
      .filter(Boolean)
      .join(" ") || BLOCKER_MESSAGES.invalid_email
  );
}

async function accountDeletionBlockers(env, ownerEmail) {
  const placeholders = OPEN_FIX_REQUEST_STATUSES.map(() => "?").join(", ");
  const [openRequests, subscriptions] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT COUNT(*) AS count FROM fix_requests
       WHERE owner_email = ? AND is_test = 0 AND status IN (${placeholders})`
    )
      .bind(ownerEmail, ...OPEN_FIX_REQUEST_STATUSES)
      .first(),
    env.WAITLIST_DB.prepare(
      `SELECT COUNT(*) AS count FROM offer_entitlements
       WHERE owner_email = ? AND source = 'dodo_subscription' AND revoked_at IS NULL`
    )
      .bind(ownerEmail)
      .first()
  ]);
  const blockers = [];
  if (Number(openRequests?.count || 0)) blockers.push("open_fix_pack");
  if (Number(subscriptions?.count || 0)) blockers.push("active_subscription");
  return blockers;
}

async function reportBlobKeys(env, ownerEmail) {
  const [reports, shares] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT id, CASE WHEN substr(report_json, 1, 3) = 'r2:' THEN substr(report_json, 4) ELSE '' END AS blob_key
       FROM audit_reports
       WHERE owner_email = ?`
    )
      .bind(ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT id FROM report_share_links
       WHERE owner_email = ? OR report_id IN (SELECT id FROM audit_reports WHERE owner_email = ?)`
    )
      .bind(ownerEmail, ownerEmail)
      .all()
  ]);
  const keys = [];
  for (const row of reports.results || []) {
    if (row.blob_key) keys.push({ reportId: row.id, key: row.blob_key });
    keys.push({ reportId: row.id, key: `report-pdfs/owner/${row.id}.pdf` });
  }
  for (const row of shares.results || []) keys.push({ reportId: "", key: `report-pdfs/shares/${row.id}.pdf` });
  return keys;
}

function deletionStatements(env, ownerEmail, pseudonym, now, loginBucketHash) {
  const db = env.WAITLIST_DB;
  const run = (sql, ...values) => db.prepare(sql).bind(...values);
  const ownedReports = "SELECT id FROM audit_reports WHERE owner_email = ?";
  const ownedFixRequests = "SELECT id FROM fix_requests WHERE owner_email = ?";
  const unpaidFixRequests = `SELECT id FROM fix_requests WHERE owner_email = ? AND ${UNPAID_FIX_REQUEST}`;
  const ownedCrawls = "SELECT id FROM large_crawl_jobs WHERE owner_email = ?";
  const e = ownerEmail;

  return [
    // Traces of this person inside other accounts.
    run(`UPDATE issue_collaboration SET assignee_email = NULL WHERE assignee_email = ?`, e),
    run(`UPDATE issue_collaboration SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_queue_items SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_agent_actions SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_proposals SET approved_by_email = NULL WHERE approved_by_email = ?`, e),
    run(`UPDATE repair_proposal_events SET actor_email = NULL WHERE actor_email = ?`, e),
    run(`DELETE FROM team_members WHERE owner_email = ? OR member_email = ?`, e, e),
    run(`DELETE FROM widget_leads WHERE owner_email = ? OR email = ?`, e, e),

    // Reports and everything hanging off them.
    run(
      `DELETE FROM repair_proposal_events WHERE proposal_id IN (SELECT id FROM repair_proposals WHERE owner_email = ?)`,
      e
    ),
    run(`DELETE FROM repair_proposals WHERE owner_email = ?`, e),
    run(`DELETE FROM repair_agent_actions WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM repair_queue_items WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM issue_collaboration WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM report_share_links WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM report_branding WHERE owner_email = ?`, e),
    run(`DELETE FROM report_domains WHERE owner_email = ?`, e),
    run(`DELETE FROM score_badges WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_widgets WHERE owner_email = ?`, e),
    run(`DELETE FROM score_history WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_jobs WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_schedules WHERE owner_email = ?`, e),

    // Large crawls and imported link/keyword data.
    run(`DELETE FROM large_crawl_url_proofs WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_dead_letters WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_events WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_frontier WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_batches WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_worker_heartbeats WHERE crawl_job_id IN (${ownedCrawls})`, e),
    run(`DELETE FROM large_crawl_jobs WHERE owner_email = ?`, e),
    run(`DELETE FROM backlink_edges WHERE owner_email = ?`, e),
    run(`DELETE FROM backlink_import_batches WHERE owner_email = ?`, e),
    run(`DELETE FROM keyword_rank_observations WHERE owner_email = ?`, e),
    run(`DELETE FROM keyword_volume_observations WHERE owner_email = ?`, e),
    run(`DELETE FROM keyword_import_batches WHERE owner_email = ?`, e),

    // Developer API.
    run(
      `DELETE FROM api_webhook_events
       WHERE owner_email = ? OR webhook_id IN (SELECT id FROM api_webhooks WHERE owner_email = ?)`,
      e,
      e
    ),
    run(`DELETE FROM api_webhooks WHERE owner_email = ?`, e),
    run(`DELETE FROM api_tokens WHERE owner_email = ?`, e),

    // Payments: unpaid requests go; paid ones stay with personal fields cleared.
    run(`DELETE FROM fix_request_events WHERE fix_request_id IN (${unpaidFixRequests})`, e),
    run(`DELETE FROM fix_request_notifications WHERE fix_request_id IN (${unpaidFixRequests})`, e),
    run(`DELETE FROM fix_requests WHERE owner_email = ? AND ${UNPAID_FIX_REQUEST}`, e),
    run(
      `UPDATE fix_request_events
       SET actor_email = NULL, detail_json = NULL, reason = REPLACE(reason, ?, '${REDACTED}')
       WHERE fix_request_id IN (${ownedFixRequests})`,
      e,
      e
    ),
    run(`UPDATE fix_request_events SET actor_email = NULL WHERE actor_email = ?`, e),
    run(
      `UPDATE fix_request_notifications SET recipient_email = NULL, error = NULL WHERE fix_request_id IN (${ownedFixRequests})`,
      e
    ),
    run(`UPDATE fix_request_notifications SET recipient_email = NULL WHERE recipient_email = ?`, e),
    run(
      `UPDATE dodo_webhook_events
       SET payload_json = NULL, error = NULL, updated_at = ?
       WHERE fix_request_id IN (${ownedFixRequests}) OR instr(lower(COALESCE(payload_json, '')), ?) > 0`,
      now,
      e,
      e
    ),
    run(
      `UPDATE fix_requests
       SET owner_email = ?,
           payment_customer_email = NULL,
           note = NULL,
           customer_note = NULL,
           admin_note = NULL,
           status_reason = REPLACE(status_reason, ?, '${REDACTED}'),
           refund_reason = REPLACE(refund_reason, ?, '${REDACTED}'),
           target_url = '',
           target_host = '',
           checkout_url = NULL,
           checkout_repair_json = NULL,
           before_after_summary_json = NULL,
           delivery_url = NULL,
           notification_error = NULL,
           delivery_notification_error = NULL,
           updated_at = ?
       WHERE owner_email = ?`,
      pseudonym,
      e,
      e,
      now,
      e
    ),
    run(`UPDATE fix_requests SET payment_customer_email = NULL WHERE payment_customer_email = ?`, e),
    run(
      `DELETE FROM offer_entitlement_events WHERE owner_email = ? AND entitlement_id IN (SELECT id FROM offer_entitlements WHERE owner_email = ? AND source != 'dodo_subscription')`,
      e,
      e
    ),
    run(`DELETE FROM offer_entitlements WHERE owner_email = ? AND source != 'dodo_subscription'`, e),
    run(`UPDATE offer_entitlement_events SET owner_email = ?, detail_json = NULL WHERE owner_email = ?`, pseudonym, e),
    run(`UPDATE offer_entitlements SET owner_email = ?, updated_at = ? WHERE owner_email = ?`, pseudonym, now, e),
    run(`DELETE FROM monitoring_checkout_sessions WHERE owner_email = ?`, e),

    // Sign-in, preferences, signup and funnel records.
    run(`DELETE FROM site_claims WHERE owner_email = ?`, e),
    run(`DELETE FROM email_preferences WHERE owner_email = ?`, e),
    run(`DELETE FROM lifecycle_emails WHERE owner_email = ?`, e),
    run(`DELETE FROM access_events WHERE owner_email = ?`, e),
    run(`DELETE FROM access_tokens WHERE owner_email = ?`, e),
    run(`DELETE FROM beta_sessions WHERE owner_email = ?`, e),
    run(`DELETE FROM beta_invites WHERE owner_email = ?`, e),
    run(`DELETE FROM waitlist_leads WHERE email = ?`, e),
    run(`DELETE FROM audit_usage WHERE instr(bucket, ?) > 0 OR instr(bucket, ?) > 0`, `:${e}`, `:${loginBucketHash}`),
    run(`UPDATE admin_audit_log SET detail = REPLACE(detail, ?, '${REDACTED}') WHERE instr(detail, ?) > 0`, e, e),
    run(`UPDATE admin_audit_log SET actor_email = NULL WHERE actor_email = ?`, e),

    // The reports themselves go last: the statements above select through them.
    run(`DELETE FROM audit_reports WHERE owner_email = ?`, e)
  ];
}

async function deleteBlobs(env, keys) {
  if (!env.REPORTS || !keys.length) return { deleted: 0, failed: 0 };
  let failed = 0;
  for (let index = 0; index < keys.length; index += R2_DELETE_CHUNK) {
    const chunk = keys.slice(index, index + R2_DELETE_CHUNK);
    try {
      await env.REPORTS.delete(chunk.map((entry) => entry.key));
    } catch (error) {
      failed += chunk.length;
      const message = cleanText(error?.message || "Report blob deletion failed.", 500);
      for (const entry of chunk) {
        await recordReportBlobDeletionFailure(env, { reportId: entry.reportId, key: entry.key, error: message });
      }
    }
  }
  return { deleted: keys.length - failed, failed };
}

async function recordDeletion(env, { deletionId, actor, now, summary }) {
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO admin_audit_log (id, action, success, actor_email, ip_hash, user_agent, detail, created_at)
       VALUES (?, 'account-deleted', 1, ?, '', '', ?, ?)`
    )
      .bind(deletionId, actor, JSON.stringify(summary), now)
      .run();
  } catch (error) {
    console.error("Account deletion audit entry was not written", error);
  }
}

async function sendDeletionConfirmation(env, ownerEmail, { paymentRecordsKept }) {
  if (!isEmailConfigured(env)) return false;
  const kept = paymentRecordsKept
    ? "We kept the payment records we must keep for accounting and tax (amounts, dates and payment IDs), with your email, site and notes removed. Dodo Payments, our merchant of record, keeps its own receipts under its privacy policy."
    : "";
  const text = [
    "Your SEO Fix Kit account and its data were deleted: reports, sites, checks, alerts, API keys, settings and sign-in records.",
    kept,
    "If you did not ask for this, reply to this email."
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = [
    '<p style="font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 8px">Your account was deleted</p>',
    '<p style="margin:0 0 12px">Your SEO Fix Kit account and its data were deleted: reports, sites, checks, alerts, API keys, settings and sign-in records.</p>',
    kept ? `<p style="margin:0 0 12px">${kept}</p>` : "",
    '<p style="color:#6b6f6c;font-size:13px;line-height:20px;margin:0">If you did not ask for this, reply to this email.</p>'
  ].join("");
  try {
    await sendWorkerEmail(env, {
      to: ownerEmail,
      subject: "Your SEO Fix Kit account was deleted",
      text,
      html,
      preheader: "Your account and its data were deleted.",
      tag: "account-deleted"
    });
    return true;
  } catch (error) {
    console.error("Account deletion confirmation email failed", error?.message || "");
    return false;
  }
}

async function deleteAccount(env, rawEmail, { actor = "account-owner", notify = true } = {}) {
  const ownerEmail = normalizeEmail(rawEmail);
  if (!ownerEmail) return { ok: false, blockers: ["invalid_email"] };
  const blockers = await accountDeletionBlockers(env, ownerEmail);
  if (blockers.length) return { ok: false, blockers };

  const deletionId = crypto.randomUUID();
  const pseudonym = `deleted-account:${deletionId}`;
  const now = new Date().toISOString();
  const blobKeys = await reportBlobKeys(env, ownerEmail);
  const reportCount = new Set(blobKeys.filter((entry) => entry.reportId).map((entry) => entry.reportId)).size;
  const statements = deletionStatements(env, ownerEmail, pseudonym, now, await sha256Hex(ownerEmail));
  const results = await env.WAITLIST_DB.batch(statements);
  const rowsChanged = results.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
  const kept = await env.WAITLIST_DB.prepare(`SELECT COUNT(*) AS count FROM fix_requests WHERE owner_email = ?`)
    .bind(pseudonym)
    .first();
  const paymentRecordsKept = Number(kept?.count || 0);
  const blobs = await deleteBlobs(env, blobKeys);

  const summary = {
    reports: reportCount,
    rowsChanged,
    storedFilesDeleted: blobs.deleted,
    storedFilesFailed: blobs.failed,
    paymentRecordsKept
  };
  await recordDeletion(env, { deletionId, actor: cleanText(actor, 254), now, summary });
  const confirmationSent = notify ? await sendDeletionConfirmation(env, ownerEmail, { paymentRecordsKept }) : false;
  return { ok: true, deletionId, deletedAt: now, confirmationSent, ...summary };
}

export { OPEN_FIX_REQUEST_STATUSES, accountDeletionBlockers, deleteAccount, deletionBlockedMessage };
