import { isEmailConfigured } from "../../shared/fulfillment.js";
import { CHECKOUT_URL_TTL_HOURS } from "../routes/billing.js";
import { recordReportBlobDeletionFailure } from "./report-data.js";
import { sendWorkerEmail, SUPPORT_EMAIL } from "./email.js";
import { sha256Hex } from "./security.js";
import { DELETED_ACCOUNT_PREFIX, cleanText, isoSecondsFromNow, normalizeEmail } from "./text.js";

const OPEN_FIX_REQUEST_STATUSES = ["paid", "in_progress", "refund_failed", "disputed"];

const UNPAID_FIX_REQUEST = `paid_at IS NULL
  AND refunded_at IS NULL
  AND COALESCE(refund_id, '') = ''
  AND disputed_at IS NULL
  AND COALESCE(dispute_event, '') = ''
  AND NOT EXISTS (SELECT 1 FROM fix_request_payments p WHERE p.fix_request_id = fix_requests.id)`;

const DELETABLE_FIX_REQUEST = `${UNPAID_FIX_REQUEST}
  AND COALESCE(checkout_session_id, '') = ''`;

function liveCheckoutCutoff() {
  return isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60);
}

const REDACTED = "[deleted account]";
const R2_DELETE_CHUNK = 1000;
const LATE_WRITE_PASSES = 2;

const WHOLE_ADDRESS_EDGE_PUNCTUATION = ".,;:!?)]}>\"'`";

function wholeAddressMatch(expression, needle) {
  const spaced = (value) => `replace(replace(replace(replace(${value}, '@', ' '), '-', ' '), '_', ' '), '+', ' ')`;
  return `instr(' ' || rtrim(${spaced(expression)}, '${WHOLE_ADDRESS_EDGE_PUNCTUATION.replaceAll("'", "''")}') || ' ', ' ' || ${spaced(needle)} || ' ')`;
}
const BLOCKER_MESSAGES = {
  invalid_email: "Enter a valid account email.",
  no_account: "We found no account for that address. Check the address, or email support@seofixkit.com.",
  open_fix_pack:
    "A Fix Pack on this account is paid, in progress, or has an open refund or dispute. Delete the account once it is delivered or refunded, or email support@seofixkit.com.",
  active_subscription:
    "This account has a Proof Monitoring subscription. Cancel it first (email support@seofixkit.com if you need help), then delete the account.",
  open_checkout: `This account has a checkout that is still open. Finish the payment, or wait for the checkout to expire (${CHECKOUT_URL_TTL_HOURS} hours after it was opened), then delete the account.`
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
  const now = new Date().toISOString();
  const cutoff = liveCheckoutCutoff();
  const [openRequests, subscriptions, fixPackCheckouts, monitoringCheckouts] = await Promise.all([
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
      .first(),
    env.WAITLIST_DB.prepare(
      `SELECT COUNT(*) AS count FROM fix_requests
       WHERE owner_email = ? AND is_test = 0 AND ${UNPAID_FIX_REQUEST}
         AND (
           checkout_lock_until > ?
           OR (COALESCE(checkout_session_id, '') != '' AND checkout_created_at > ?)
         )`
    )
      .bind(ownerEmail, now, cutoff)
      .first(),
    env.WAITLIST_DB.prepare(
      `SELECT COUNT(*) AS count FROM monitoring_checkout_sessions s
       WHERE s.owner_email = ?
         AND (
           s.lock_until > ?
           OR (
             COALESCE(s.checkout_session_id, '') != ''
             AND s.checkout_created_at > ?
             AND NOT EXISTS (
               SELECT 1 FROM offer_entitlements e
               WHERE e.owner_email = s.owner_email AND e.source = 'dodo_subscription'
                 AND e.updated_at >= s.checkout_created_at
             )
           )
         )`
    )
      .bind(ownerEmail, now, cutoff)
      .first()
  ]);
  const blockers = [];
  if (Number(openRequests?.count || 0)) blockers.push("open_fix_pack");
  if (Number(subscriptions?.count || 0)) blockers.push("active_subscription");
  if (Number(fixPackCheckouts?.count || 0) || Number(monitoringCheckouts?.count || 0)) blockers.push("open_checkout");
  return blockers;
}

function reportBlobKeys(reportRows = [], shareRows = []) {
  const keys = [];
  for (const row of reportRows) {
    if (row.blob_key) keys.push({ reportId: row.id, key: row.blob_key });
    keys.push({ reportId: row.id, key: `report-pdfs/owner/${row.id}.pdf` });
  }
  for (const row of shareRows) keys.push({ reportId: "", key: `report-pdfs/shares/${row.id}.pdf` });
  return keys;
}

function deletionStatements(env, ownerEmail, pseudonym, now, loginBucketHash) {
  const db = env.WAITLIST_DB;
  const run = (sql, ...values) => db.prepare(sql).bind(...values);
  const ownedReports = "SELECT id FROM audit_reports WHERE owner_email = ?";
  const ownedFixRequests = "SELECT id FROM fix_requests WHERE owner_email = ?";
  const unpaidFixRequests = `SELECT id FROM fix_requests WHERE owner_email = ? AND ${DELETABLE_FIX_REQUEST} AND created_at <= ?`;
  const ownedCrawls = "SELECT id FROM large_crawl_jobs WHERE owner_email = ?";
  const e = ownerEmail;
  const shareLinks = run(
    `DELETE FROM report_share_links WHERE owner_email = ? OR report_id IN (${ownedReports}) RETURNING id`,
    e,
    e
  );
  const reports = run(
    `DELETE FROM audit_reports WHERE owner_email = ?
     RETURNING id, CASE WHEN substr(report_json, 1, 3) = 'r2:' THEN substr(report_json, 4) ELSE '' END AS blob_key`,
    e
  );

  const statements = [
    run(`UPDATE issue_collaboration SET assignee_email = NULL WHERE assignee_email = ?`, e),
    run(`UPDATE issue_collaboration SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_queue_items SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_agent_actions SET updated_by_email = NULL WHERE updated_by_email = ?`, e),
    run(`UPDATE repair_proposals SET approved_by_email = NULL WHERE approved_by_email = ?`, e),
    run(`UPDATE repair_proposal_events SET actor_email = NULL WHERE actor_email = ?`, e),
    run(`DELETE FROM team_members WHERE owner_email = ? OR member_email = ?`, e, e),
    run(`DELETE FROM widget_leads WHERE owner_email = ? OR email = ?`, e, e),

    run(
      `DELETE FROM repair_proposal_events WHERE proposal_id IN (SELECT id FROM repair_proposals WHERE owner_email = ?)`,
      e
    ),
    run(
      `DELETE FROM audit_report_blob_deletion_failures
       WHERE blob_key IN (
         SELECT 'reports/' || id || '.json' FROM audit_reports WHERE owner_email = ?
         UNION ALL
         SELECT 'report-pdfs/owner/' || id || '.pdf' FROM audit_reports WHERE owner_email = ?
         UNION ALL
         SELECT 'report-pdfs/shares/' || id || '.pdf'
         FROM report_share_links
         WHERE owner_email = ? OR report_id IN (SELECT id FROM audit_reports WHERE owner_email = ?)
       )`,
      e,
      e,
      e,
      e
    ),
    run(`DELETE FROM repair_proposals WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM repair_agent_actions WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM repair_queue_items WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    run(`DELETE FROM issue_collaboration WHERE owner_email = ? OR report_id IN (${ownedReports})`, e, e),
    shareLinks,
    run(`DELETE FROM report_branding WHERE owner_email = ?`, e),
    run(`DELETE FROM report_domains WHERE owner_email = ?`, e),
    run(`DELETE FROM score_badges WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_widgets WHERE owner_email = ?`, e),
    run(`DELETE FROM score_history WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_jobs WHERE owner_email = ?`, e),
    run(`DELETE FROM audit_schedules WHERE owner_email = ?`, e),

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

    run(
      `DELETE FROM api_webhook_events
       WHERE owner_email = ? OR webhook_id IN (SELECT id FROM api_webhooks WHERE owner_email = ?)`,
      e,
      e
    ),
    run(`DELETE FROM api_webhooks WHERE owner_email = ?`, e),
    run(`DELETE FROM api_tokens WHERE owner_email = ?`, e),

    run(`DELETE FROM fix_request_events WHERE fix_request_id IN (${unpaidFixRequests})`, e, now),
    run(`DELETE FROM fix_request_notifications WHERE fix_request_id IN (${unpaidFixRequests})`, e, now),
    run(`DELETE FROM dodo_webhook_events WHERE fix_request_id IN (${unpaidFixRequests})`, e, now),
    run(`DELETE FROM fix_requests WHERE owner_email = ? AND ${DELETABLE_FIX_REQUEST} AND created_at <= ?`, e, now),
    run(
      `UPDATE fix_request_events
       SET actor_email = NULL, detail_json = NULL, reason = NULL
       WHERE fix_request_id IN (${ownedFixRequests})`,
      e
    ),
    run(
      `UPDATE fix_request_events
       SET actor_email = NULL, detail_json = NULL, reason = NULL
       WHERE actor_email = ?`,
      e
    ),
    run(
      `UPDATE fix_request_notifications
       SET recipient_email = NULL, error = NULL, provider_message_id = NULL
       WHERE fix_request_id IN (${ownedFixRequests})`,
      e
    ),
    run(`UPDATE fix_request_notifications SET recipient_email = NULL WHERE recipient_email = ?`, e),
    run(
      `UPDATE dodo_webhook_events
       SET payload_json = NULL, error = NULL, updated_at = ?
       WHERE fix_request_id IN (${ownedFixRequests})
          OR (COALESCE(fix_request_id, '') = ''
              AND instr(lower(COALESCE(payload_json, '')), '"' || lower(?) || '"') > 0)`,
      now,
      e,
      e
    ),
    run(
      `UPDATE fix_requests
       SET owner_email = ?,
           report_id = 'deleted-report:' || id,
           final_report_id = NULL,
           payment_customer_email = NULL,
           note = NULL,
           customer_note = NULL,
           admin_note = NULL,
           assigned_to = NULL,
           status_reason = NULL,
           refund_reason = NULL,
           target_url = '',
           target_host = '',
           score = NULL,
           issue_count = NULL,
           checkout_url = NULL,
           checkout_repair_json = NULL,
           checkout_lock_until = NULL,
           before_after_summary_json = NULL,
           delivery_url = NULL,
           notification_error = NULL,
           delivery_notification_error = NULL,
           updated_at = ?
       WHERE owner_email = ?`,
      pseudonym,
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

    run(`DELETE FROM site_claims WHERE owner_email = ?`, e),
    run(`DELETE FROM email_preferences WHERE owner_email = ?`, e),
    run(`DELETE FROM lifecycle_emails WHERE owner_email = ?`, e),
    run(`DELETE FROM access_events WHERE owner_email = ?`, e),
    run(`DELETE FROM access_tokens WHERE owner_email = ?`, e),
    run(`DELETE FROM beta_sessions WHERE owner_email = ?`, e),
    run(`DELETE FROM beta_invites WHERE owner_email = ?`, e),
    run(`DELETE FROM waitlist_leads WHERE email = ?`, e),
    run(
      `DELETE FROM audit_usage
       WHERE substr(bucket, -length(?)) = ? OR substr(bucket, -length(?)) = ?`,
      `:${e}`,
      `:${e}`,
      `:${loginBucketHash}`,
      `:${loginBucketHash}`
    ),
    run(`UPDATE admin_audit_log SET detail = '${REDACTED}' WHERE ${wholeAddressMatch("detail", "?")} > 0`, e),
    run(`UPDATE admin_audit_log SET actor_email = NULL WHERE actor_email = ?`, e),

    reports
  ];
  return { statements, shareLinks, reports };
}

async function blobIsStored(env, key) {
  try {
    return Boolean(await env.REPORTS.head(key));
  } catch {
    return true;
  }
}

async function clearReportBlobDeletionFailures(env, keys) {
  if (!env.WAITLIST_DB || !keys.length) return;
  try {
    const placeholders = keys.map(() => "?").join(", ");
    await env.WAITLIST_DB.prepare(`DELETE FROM audit_report_blob_deletion_failures WHERE blob_key IN (${placeholders})`)
      .bind(...keys)
      .run();
  } catch {}
}

async function deleteBlobs(env, keys) {
  if (!env.REPORTS || !keys.length) return { deleted: 0, failed: 0 };
  let deleted = 0;
  const confirmed = [];
  const stillPresent = [];
  for (let index = 0; index < keys.length; index += R2_DELETE_CHUNK) {
    const chunk = keys.slice(index, index + R2_DELETE_CHUNK);
    const stored = [];
    for (const entry of chunk) {
      if (await blobIsStored(env, entry.key)) stored.push(entry);
    }
    if (!stored.length) continue;
    try {
      await env.REPORTS.delete(stored.map((entry) => entry.key));
      deleted += stored.length;
      confirmed.push(...stored.map((entry) => entry.key));
    } catch {
      const message = "Report blob deletion failed.";
      stillPresent.push(...stored.map((entry) => ({ entry, error: message })));
    }
  }
  for (const { entry, error } of stillPresent) {
    await recordReportBlobDeletionFailure(env, {
      reportId: "",
      key: `deleted:${await sha256Hex(entry.key)}`,
      error
    });
  }
  await clearReportBlobDeletionFailures(env, confirmed);
  return { deleted, failed: stillPresent.length };
}

async function recordDeletion(env, { deletionId, actor, now, summary }) {
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO admin_audit_log (id, action, success, actor_email, ip_hash, user_agent, detail, created_at)
       VALUES (?, 'account-deleted', 1, ?, '', '', ?, ?)`
    )
      .bind(deletionId, actor, JSON.stringify(summary), now)
      .run();
    return true;
  } catch (error) {
    console.error("Account deletion audit entry was not written", error);
    return false;
  }
}

function paymentRecordsKeptMessage(paymentRecordsKept) {
  if (!paymentRecordsKept) return "";
  const records = paymentRecordsKept === 1 ? "1 payment record" : `${paymentRecordsKept} payment records`;
  return `We kept the ${records} we must keep for accounting and tax (amounts, dates and payment IDs), with your email, site and notes removed. Dodo Payments, our merchant of record, keeps its own receipts under its privacy policy.`;
}

async function sendDeletionConfirmation(env, ownerEmail, { paymentRecordsKept, storedFilesFailed = 0 }) {
  if (!isEmailConfigured(env)) return false;
  const kept = paymentRecordsKeptMessage(paymentRecordsKept);
  const files = storedFilesFailed
    ? `We could not remove ${storedFilesFailed} stored report file(s) just now. Email ${SUPPORT_EMAIL} and we will remove them for you.`
    : "";
  const text = [
    "Your SEO Fix Kit account and its data were deleted: reports, sites, checks, alerts, API keys, settings and sign-in records.",
    files,
    kept,
    "If you did not ask for this, reply to this email."
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = [
    '<p style="font-size:20px;font-weight:650;letter-spacing:-0.015em;line-height:28px;margin:0 0 8px">Your account was deleted</p>',
    '<p style="margin:0 0 12px">Your SEO Fix Kit account and its data were deleted: reports, sites, checks, alerts, API keys, settings and sign-in records.</p>',
    files ? `<p style="margin:0 0 12px">${files}</p>` : "",
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

  const known = await env.WAITLIST_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM fix_requests WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM audit_reports WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM audit_jobs WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM audit_schedules WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM beta_sessions WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM access_events WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM offer_entitlements WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM waitlist_leads WHERE email = ?)
     + (SELECT COUNT(*) FROM monitoring_checkout_sessions WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM api_tokens WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM email_preferences WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM site_claims WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM large_crawl_jobs WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM team_members WHERE owner_email = ?) AS count`
  )
    .bind(
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail,
      ownerEmail
    )
    .first();
  if (!Number(known?.count || 0)) return { ok: false, blockers: ["no_account"] };

  const deletionId = crypto.randomUUID();
  const pseudonym = `${DELETED_ACCOUNT_PREFIX}${deletionId}`;
  const now = new Date().toISOString();
  const { statements, shareLinks, reports } = deletionStatements(
    env,
    ownerEmail,
    pseudonym,
    now,
    await sha256Hex(ownerEmail)
  );
  const returned = (batchResults, statement) => batchResults[statements.indexOf(statement)]?.results || [];
  const firstPass = await env.WAITLIST_DB.batch(statements);
  const reportRows = returned(firstPass, reports);
  const blobKeys = reportBlobKeys(reportRows, returned(firstPass, shareLinks));
  const rowsChanged = firstPass.reduce(
    (total, result) => total + (Number(result?.meta?.changes || 0) || Number(result?.results?.length || 0)),
    0
  );
  let reportCount = reportRows.length;
  let blobs = await deleteBlobs(env, blobKeys);
  for (let pass = 0; pass < LATE_WRITE_PASSES; pass += 1) {
    const late = await env.WAITLIST_DB.batch(statements);
    const lateReports = returned(late, reports);
    if (!lateReports.length) break;
    reportCount += lateReports.length;
    const lateBlobs = await deleteBlobs(env, reportBlobKeys(lateReports, returned(late, shareLinks)));
    blobs = { deleted: blobs.deleted + lateBlobs.deleted, failed: blobs.failed + lateBlobs.failed };
  }
  const kept = await env.WAITLIST_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM fix_requests WHERE owner_email = ?)
     + (SELECT COUNT(*) FROM offer_entitlements WHERE owner_email = ?) AS count`
  )
    .bind(pseudonym, pseudonym)
    .first();
  const paymentRecordsKept = Number(kept?.count || 0);

  const summary = {
    reports: reportCount,
    rowsChanged,
    storedFilesDeleted: blobs.deleted,
    storedFilesFailed: blobs.failed,
    paymentRecordsKept
  };
  const auditRecorded = await recordDeletion(env, { deletionId, actor: cleanText(actor, 254), now, summary });
  const confirmationSent = notify
    ? await sendDeletionConfirmation(env, ownerEmail, { paymentRecordsKept, storedFilesFailed: blobs.failed })
    : false;
  return { ok: true, deletionId, deletedAt: now, confirmationSent, auditRecorded, ...summary };
}

export {
  DELETED_ACCOUNT_PREFIX,
  OPEN_FIX_REQUEST_STATUSES,
  accountDeletionBlockers,
  deleteAccount,
  deletionBlockedMessage
};
