import {
  DODO_DISPUTE_EVENTS,
  DODO_DISPUTE_RESOLVED_EVENTS,
  DODO_PAYMENT_FAILURE_EVENTS,
  DODO_PAYMENT_PROCESSING_EVENTS,
  DODO_PAYMENT_SUCCESS_EVENTS,
  DODO_REFUND_FAILURE_EVENTS,
  DODO_REFUND_SUCCESS_EVENTS,
  DODO_SUBSCRIPTION_ACTIVE_EVENTS,
  DODO_SUBSCRIPTION_EVENTS,
  DODO_SUBSCRIPTION_INACTIVE_EVENTS,
  PAID_STATUSES,
  dodoAdaptiveCurrencyFeesInclusive,
  dodoApiKey,
  dodoBaseUrl,
  dodoBrandId,
  dodoCheckoutConfigStatus,
  dodoCountryFromRequest,
  dodoMonitoringCheckoutConfigStatus,
  dodoMonitoringProductId,
  dodoProductId,
  dodoProductMatches,
  dodoRepairSprintCheckoutConfigStatus,
  dodoRepairSprintProductId,
  dodoWebhookSecret,
  extractDodoPayment,
  extractDodoSubscription,
  hasDodoCheckoutConfig,
  hasDodoMonitoringCheckoutConfig,
  verifyDodoWebhookSignature
} from "../../shared/dodo.js";
import {
  ADMIN_EDITABLE_FIX_REQUEST_STATUSES,
  adminNotificationEmail,
  buildPaymentNotificationEmail,
  buildStatusNotificationEmail,
  fixRequestStatusLabel,
  isEmailConfigured,
  normalizeFixRequestStatus
} from "../../shared/fulfillment.js";
import { buildRepairProposalsFromReport } from "../../shared/repair-execution.js";
import { betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { EMAIL_PROVIDER, sendWorkerEmail, shouldSkipOwnedInternalEmail } from "../lib/email.js";
import { json, jsonNoStore, secureHeaders } from "../lib/http.js";
import { monitoringAccessForOwner, offerCatalogForOwner } from "../lib/offers.js";
import { preserveFixRequestReports, reportJsonForRow } from "../lib/report-data.js";
import { repairProposalSummariesForFixRequests } from "../lib/repair-proposal-summary.js";
import { isRepairTablesMissingError } from "../lib/repair-tables.js";
import { ensureRepairQueueRows } from "../lib/repair-agent-actions.js";
import { checkQuotaSet, sha256Hex } from "../lib/security.js";
import { billingFixRequestResponse, fixRequestResponse } from "../lib/serializers.js";
import { cleanQueueStatus } from "../../shared/repair-queue.js";
import { selectFixPackRepair } from "../../shared/fix-pack-repair-selection.js";
import { OFFER_KEYS, repairSprintEligibilityFromProposals } from "../../shared/offers.js";
import {
  cleanText,
  cleanReportDomain,
  hourWindow,
  isSafeReportId,
  isoDaysFromNow,
  isoSecondsFromNow,
  normalizeEmail,
  parseJson,
  safeHostname
} from "../lib/text.js";
import { body, flag, parseJsonBody, text, z } from "../lib/validation.js";

const ReportCheckoutBody = body({
  reportId: text(140),
  note: text(1000),
  testMode: flag(),
  isTest: flag(),
  issueId: text(160),
  issue_id: text(160),
  queueItemId: text(160),
  queue_item_id: text(160),
  selectedRepair: z.object({ issueId: text(160), queueItemId: text(160) }).nullish(),
  selected_repair: z.object({ issue_id: text(160), queue_item_id: text(160) }).nullish()
});

const MonitoringCheckoutBody = body({
  targetHost: text(500),
  host: text(500),
  targetUrl: z.string().nullish(),
  url: z.string().nullish()
});

const FIX_PACK_OFFER = {
  name: "SEO Fix Pack",
  productKey: "seofixkit_fix_pack",
  description: "One proof-backed repair pass for this report plus one rerun after fixes."
};

const MONITORING_OFFER = {
  name: "Proof Monitoring",
  productKey: "seofixkit_proof_monitoring",
  offerKey: OFFER_KEYS.MONITORING,
  description: "Weekly proof monitoring, report deltas, and change alerts for verified sites."
};

const REPAIR_SPRINT_OFFER = {
  name: "Repair Sprint",
  productKey: "seofixkit_repair_sprint",
  offerKey: OFFER_KEYS.REPAIR_SPRINT,
  description: "A scoped repair queue, owner approval, delivery notes, and final rerun proof."
};

const FIX_PACK_DUE_DAYS = 5;

const FIX_PACK_NEXT_UPDATE_DAYS = 2;

const PAID_LIKE_FIX_REQUEST_STATUSES = new Set(["paid", "in_progress", "delivered"]);

const REBUY_BLOCKED_FIX_REQUEST_STATUSES = new Set(["refunded", "refund_failed", "disputed"]);

const REPAIR_SPRINT_BLOCKED_FIX_REQUEST_STATUSES = new Set(REBUY_BLOCKED_FIX_REQUEST_STATUSES);

const CHECKOUT_URL_TTL_HOURS = 24;

// A paid payment rejected for one of these reasons means a customer was charged
// without getting access: the webhook is recorded as `error` and the admin is alerted.
const UNATTRIBUTABLE_PAYMENT_IDENTITY_REASONS = new Set([
  "checkout_product_mismatch",
  "repair_sprint_checkout_target_missing",
  "customer_email_mismatch",
  "product_mismatch",
  "missing_product_cart",
  "product_quantity_mismatch"
]);

// Lease taken on a fix request (or monitoring owner) while a Dodo checkout is being created.
const CHECKOUT_LOCK_SECONDS = 30;

const CHECKOUT_HOURLY_LIMIT = 10;

// Only flag clearly wrong amounts: tax and adaptive-currency fees move the total a little.
const MIN_EXPECTED_AMOUNT_RATIO = 0.5;

function isRefundOrDisputeEvent(eventType) {
  return (
    DODO_REFUND_SUCCESS_EVENTS.has(eventType) ||
    DODO_REFUND_FAILURE_EVENTS.has(eventType) ||
    DODO_DISPUTE_EVENTS.has(eventType) ||
    DODO_DISPUTE_RESOLVED_EVENTS.has(eventType)
  );
}

async function checkoutQuotaResponse(env, access, kind) {
  const hour = hourWindow(new Date());
  const quota = await checkQuotaSet(env, [
    {
      bucket: `checkout:${kind}:${hour.key}:${normalizeEmail(access.ownerEmail)}`,
      limit: CHECKOUT_HOURLY_LIMIT,
      windowStart: hour.key,
      resetAt: hour.resetAt,
      error: "Too many checkout attempts. Try again in an hour, or email support@seofixkit.com."
    }
  ]);
  if (quota.ok) return null;
  return jsonNoStore({ error: quota.error, code: "CHECKOUT_RATE_LIMITED", resetAt: quota.resetAt }, 429);
}

async function claimFixRequestCheckoutLock(env, fixRequestId) {
  const result = await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET checkout_lock_until = ?
     WHERE id = ?
       AND (checkout_lock_until IS NULL OR checkout_lock_until <= ?)`
  )
    .bind(isoSecondsFromNow(CHECKOUT_LOCK_SECONDS), fixRequestId, new Date().toISOString())
    .run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function releaseFixRequestCheckoutLock(env, fixRequestId) {
  await env.WAITLIST_DB.prepare("UPDATE fix_requests SET checkout_lock_until = NULL WHERE id = ?")
    .bind(fixRequestId)
    .run();
}

async function fixRequestById(env, fixRequestId) {
  return env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1").bind(fixRequestId).first();
}

function isFreshCheckout(fixRequest = {}) {
  return Boolean(
    fixRequest.status === "checkout_created" &&
    fixRequest.checkout_url &&
    fixRequest.checkout_session_id &&
    fixRequest.checkout_created_at &&
    fixRequest.checkout_created_at > isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60)
  );
}

function checkoutInProgressResponse(extra = {}) {
  return jsonNoStore(
    {
      ok: false,
      code: "CHECKOUT_IN_PROGRESS",
      error: "Checkout is already being opened for this report. Wait a few seconds and try again.",
      checkoutAvailable: false,
      ...extra
    },
    409
  );
}

async function expectedFixPackPrice(request, env, access) {
  try {
    const pricing = await previewDodoFixPackPricing(request, env, access);
    return {
      amount: Number.isFinite(pricing.amountMinor) && pricing.amountMinor > 0 ? pricing.amountMinor : null,
      currency: pricing.currency || null
    };
  } catch {
    return { amount: null, currency: null };
  }
}

async function requestFixPack(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Fix request storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const fixPackLimited = await checkoutQuotaResponse(env, access, "fix-pack");
  if (fixPackLimited) return fixPackLimited;

  const parsed = await parseJsonBody(request, ReportCheckoutBody);
  if (parsed.error) return json(parsed.error, 400);
  const body = parsed.data;
  const reportId = body.reportId;
  if (!isSafeReportId(reportId)) return json({ error: "Report not found." }, 404);

  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, owner_invite_id, score, summary_json, report_json, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.id || row.owner_email !== access.ownerEmail) return json({ error: "Report not found." }, 404);
  if (row.owner_invite_id && access.accessMode !== "founder-override" && row.owner_invite_id !== access.inviteId) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString())
    return json({ error: "This report expired. Run a new audit to get a fresh report." }, 404);

  const summary = parseJson(row.summary_json, {});
  const report = parseJson(await reportJsonForRow(env, row), {});
  const now = new Date().toISOString();
  const note = body.note;
  const isTest = (body.testMode || body.isTest) && access.accessMode === "founder-override";
  const existingFixRequest = await latestFixRequestForReport(env, row.id, access.ownerEmail);
  const skippedProposalSeed = { status: "skipped", total: 0, created: 0, executable: 0 };

  if (existingFixRequest?.status === "delivered") {
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      request: fixRequestWithProposalSummary(existingFixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  if (REBUY_BLOCKED_FIX_REQUEST_STATUSES.has(existingFixRequest?.status)) {
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      checkoutAvailable: false,
      message:
        "This Fix Pack was refunded or disputed, so checkout is closed for this report. Email support@seofixkit.com to start a new repair.",
      request: fixRequestWithProposalSummary(existingFixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  if (PAID_LIKE_FIX_REQUEST_STATUSES.has(existingFixRequest?.status)) {
    const proposalSeed = await seedRepairProposalsForFixRequest(env, report, existingFixRequest, row, access, now);
    return jsonNoStore({
      ok: true,
      mode: existingFixRequest.status,
      request: fixRequestWithProposalSummary(existingFixRequest, proposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: null
    });
  }

  const repairContext = await fixPackRepairContext(env, access, row.id, report, body);

  if (repairContext.unavailable) {
    return jsonNoStore(
      {
        error: "Repair queue storage is being updated. Try again in a few minutes.",
        code: "REPAIR_QUEUE_MIGRATION_MISSING",
        checkoutAvailable: false,
        offer: FIX_PACK_OFFER,
        selectedRepair: null
      },
      503
    );
  }

  if (repairContext.selectionConflict) {
    return jsonNoStore(
      {
        error: "That repair is no longer open for checkout. Refresh the report and pick an open repair.",
        code: "FIX_PACK_REPAIR_SELECTION_UNAVAILABLE",
        checkoutAvailable: false,
        offer: FIX_PACK_OFFER,
        selectedRepair: null
      },
      409
    );
  }

  if (!repairContext.selectedRepair) {
    return jsonNoStore(
      {
        error: "This report has no open repairs to buy.",
        checkoutAvailable: false,
        offer: FIX_PACK_OFFER,
        selectedRepair: null
      },
      409
    );
  }

  const fixRequest =
    existingFixRequest ||
    (await getOrCreateFixRequest(env, row, access, summary, note, now, {
      isTest,
      selectedRepair: repairContext.selectedRepair
    }));

  const cachedFixPackCheckout = (current) =>
    isFreshCheckout(current) && checkoutRepairTargetMatches(current, repairContext.selectedRepair)
      ? jsonNoStore({
          ok: true,
          mode: "checkout",
          checkoutUrl: current.checkout_url,
          request: fixRequestWithProposalSummary(current, skippedProposalSeed, now),
          offer: FIX_PACK_OFFER,
          selectedRepair: repairContext.selectedRepair
        })
      : null;
  const cachedResponse = cachedFixPackCheckout(fixRequest);
  if (cachedResponse) return cachedResponse;

  if (!hasDodoCheckoutConfig(env)) {
    return jsonNoStore({
      ok: true,
      mode: "request",
      checkoutAvailable: false,
      message: "Fix request saved. Checkout is not open yet, so you have not been charged.",
      request: fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, now),
      offer: FIX_PACK_OFFER,
      selectedRepair: repairContext.selectedRepair
    });
  }

  const checkoutSchema = await fixPackCheckoutSchemaStatus(env);
  if (!checkoutSchema.ok) {
    return jsonNoStore(
      {
        error: "Fix Pack checkout storage is being updated. Try again in a few minutes.",
        code: "FIX_PACK_CHECKOUT_SCHEMA_MISSING",
        checkoutAvailable: false,
        request: fixRequestResponse(fixRequest, now),
        offer: FIX_PACK_OFFER,
        selectedRepair: repairContext.selectedRepair
      },
      503
    );
  }

  // Claim the request before calling Dodo so concurrent clicks cannot each mint a session.
  if (!(await claimFixRequestCheckoutLock(env, fixRequest.id))) {
    const current = await fixRequestById(env, fixRequest.id);
    return (
      cachedFixPackCheckout(current || {}) ||
      checkoutInProgressResponse({ offer: FIX_PACK_OFFER, selectedRepair: repairContext.selectedRepair })
    );
  }
  const claimed = (await fixRequestById(env, fixRequest.id)) || fixRequest;
  const claimedCached = cachedFixPackCheckout(claimed);
  if (
    claimedCached ||
    PAID_LIKE_FIX_REQUEST_STATUSES.has(claimed.status) ||
    REBUY_BLOCKED_FIX_REQUEST_STATUSES.has(claimed.status)
  ) {
    await releaseFixRequestCheckoutLock(env, fixRequest.id);
    return claimedCached || checkoutInProgressResponse({ offer: FIX_PACK_OFFER, selectedRepair: null });
  }

  const expectedPrice = await expectedFixPackPrice(request, env, access);
  let checkout;
  try {
    checkout = await createDodoFixPackCheckout(request, env, row, fixRequest, access, repairContext.selectedRepair);
  } catch (error) {
    await releaseFixRequestCheckoutLock(env, fixRequest.id);
    return jsonNoStore(
      {
        error: error?.message || "Dodo checkout could not be created.",
        code: error?.code || "DODO_CHECKOUT_ERROR",
        request: fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, now),
        offer: FIX_PACK_OFFER,
        selectedRepair: repairContext.selectedRepair
      },
      503
    );
  }
  const checkoutCreatedAt = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET status = 'checkout_created',
         checkout_session_id = ?,
         checkout_url = ?,
         checkout_created_at = ?,
         product_id = ?,
         checkout_repair_json = ?,
         expected_amount = ?,
         expected_currency = ?,
         checkout_lock_until = NULL,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      checkout.checkoutSessionId,
      checkout.checkoutUrl,
      checkoutCreatedAt,
      dodoProductId(env),
      checkoutRepairTargetJson(repairContext.selectedRepair),
      expectedPrice.amount,
      expectedPrice.currency,
      checkoutCreatedAt,
      fixRequest.id
    )
    .run();

  return jsonNoStore({
    ok: true,
    mode: "checkout",
    checkoutUrl: checkout.checkoutUrl,
    request: {
      ...fixRequestWithProposalSummary(fixRequest, skippedProposalSeed, checkoutCreatedAt),
      status: "checkout_created",
      checkoutSessionId: checkout.checkoutSessionId,
      offer: FIX_PACK_OFFER,
      checkoutCreatedAt
    },
    offer: FIX_PACK_OFFER,
    selectedRepair: repairContext.selectedRepair
  });
}

async function requestRepairSprintCheckout(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Repair Sprint storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  const sprintLimited = await checkoutQuotaResponse(env, access, "repair-sprint");
  if (sprintLimited) return sprintLimited;

  const parsed = await parseJsonBody(request, ReportCheckoutBody);
  if (parsed.error) return json(parsed.error, 400);
  const body = parsed.data;
  const reportId = body.reportId;
  if (!isSafeReportId(reportId)) return json({ error: "Report not found." }, 404);

  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, owner_invite_id, score, summary_json, report_json, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(reportId)
    .first();
  if (!row?.id || row.owner_email !== access.ownerEmail) return json({ error: "Report not found." }, 404);
  if (row.owner_invite_id && access.accessMode !== "founder-override" && row.owner_invite_id !== access.inviteId) {
    return json({ error: "Report not found." }, 404);
  }
  if (row.expires_at && row.expires_at <= new Date().toISOString())
    return json({ error: "This report expired. Run a new audit to get a fresh report." }, 404);

  const now = new Date().toISOString();
  const existingFixRequest = await latestFixRequestForReport(env, row.id, access.ownerEmail);
  if (REPAIR_SPRINT_BLOCKED_FIX_REQUEST_STATUSES.has(existingFixRequest?.status)) {
    const blockedEligibility = repairSprintEligibilityFromProposals([], existingFixRequest, {
      checkoutReady: false
    });
    return repairSprintCheckoutErrorResponse({
      status: 409,
      code: "REPAIR_SPRINT_REBUY_BLOCKED",
      error:
        "A payment for this report was refunded or disputed. Email support@seofixkit.com to start a new Repair Sprint.",
      repairSprint: {
        ...blockedEligibility,
        status: "blocked",
        message:
          "A payment for this report was refunded or disputed. Email support@seofixkit.com to start a new Repair Sprint."
      },
      proposalSummary: repairSprintProposalSummary([]),
      request: fixRequestWithProposalSummary(existingFixRequest, repairSprintProposalSummary([]), now)
    });
  }
  let proposals;
  try {
    proposals = await repairSprintProposalsForCheckout(env, row.id, access.ownerEmail);
  } catch {
    return repairSprintCheckoutErrorResponse({
      status: 503,
      code: "REPAIR_SPRINT_PROPOSAL_STORAGE_UNAVAILABLE",
      error: "Repair Sprint proposal storage is being updated. Try again in a few minutes.",
      repairSprint: repairSprintEligibilityFromProposals([], existingFixRequest, { checkoutReady: false }),
      proposalSummary: {
        status: "unavailable",
        total: 0,
        executable: 0,
        approved: 0,
        approvedExecutable: 0,
        delivered: 0
      },
      request: existingFixRequest ? fixRequestWithProposalSummary(existingFixRequest, null, now) : null
    });
  }
  const proposalSummary = repairSprintProposalSummary(proposals);
  const config = dodoRepairSprintCheckoutConfigStatus(env);
  const eligibility = repairSprintEligibilityFromProposals(proposals, existingFixRequest, {
    checkoutReady: config.checkoutReady
  });

  if (eligibility.status !== "approval_ready") {
    return repairSprintCheckoutErrorResponse({
      status: eligibility.status === "active" ? 409 : 422,
      code: eligibility.status === "active" ? "REPAIR_SPRINT_ALREADY_PAID" : "REPAIR_SPRINT_NOT_READY",
      error: eligibility.message,
      repairSprint: eligibility,
      proposalSummary,
      request: existingFixRequest ? fixRequestWithProposalSummary(existingFixRequest, proposalSummary, now) : null
    });
  }

  if (!config.checkoutReady) {
    return repairSprintCheckoutErrorResponse({
      status: 503,
      code: "REPAIR_SPRINT_CHECKOUT_NOT_CONFIGURED",
      error: "Repair Sprint checkout is not open yet. You have not been charged.",
      missing: dodoConfigMissing(config),
      repairSprint: eligibility,
      proposalSummary,
      request: existingFixRequest ? fixRequestWithProposalSummary(existingFixRequest, proposalSummary, now) : null
    });
  }

  const schema = await fixPackCheckoutSchemaStatus(env);
  if (!schema.ok) {
    return repairSprintCheckoutErrorResponse({
      status: 503,
      code: "REPAIR_SPRINT_CHECKOUT_SCHEMA_MISSING",
      error: "Repair Sprint checkout storage is being updated. Try again in a few minutes.",
      repairSprint: eligibility,
      proposalSummary,
      request: existingFixRequest ? fixRequestWithProposalSummary(existingFixRequest, proposalSummary, now) : null
    });
  }

  const report = parseJson(await reportJsonForRow(env, row), {});
  const summary = parseJson(row.summary_json, report.summary || {});
  const note = body.note;
  const isTest = (body.testMode || body.isTest) && access.accessMode === "founder-override";
  const fixRequest =
    existingFixRequest ||
    (await getOrCreateFixRequest(env, row, access, summary, note, now, {
      isTest
    }));

  const checkoutTarget = checkoutRepairSprintTarget(proposals);
  const cachedCheckoutFresh =
    fixRequest.status === "checkout_created" &&
    fixRequest.product_id === dodoRepairSprintProductId(env) &&
    fixRequest.checkout_url &&
    fixRequest.checkout_session_id &&
    fixRequest.checkout_created_at &&
    fixRequest.checkout_created_at > isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60) &&
    checkoutRepairSprintTargetMatches(fixRequest, checkoutTarget);
  if (cachedCheckoutFresh) {
    return jsonNoStore({
      ok: true,
      mode: "checkout",
      checkoutUrl: fixRequest.checkout_url,
      request: fixRequestWithProposalSummary(fixRequest, proposalSummary, now),
      offer: REPAIR_SPRINT_OFFER,
      repairSprint: {
        ...eligibility,
        checkoutLive: true
      },
      proposalSummary
    });
  }
  if (!(await claimFixRequestCheckoutLock(env, fixRequest.id))) {
    return checkoutInProgressResponse({ offer: REPAIR_SPRINT_OFFER, proposalSummary });
  }
  let checkout;
  try {
    checkout = await createDodoRepairSprintCheckout(request, env, row, fixRequest, access, checkoutTarget);
  } catch (error) {
    await releaseFixRequestCheckoutLock(env, fixRequest.id);
    return repairSprintCheckoutErrorResponse({
      status: 503,
      code: error?.code || "DODO_REPAIR_SPRINT_CHECKOUT_ERROR",
      error: error?.message || "Dodo Repair Sprint checkout could not be created.",
      repairSprint: eligibility,
      proposalSummary,
      request: fixRequestWithProposalSummary(fixRequest, proposalSummary, now)
    });
  }
  const checkoutCreatedAt = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET status = 'checkout_created',
         checkout_session_id = ?,
         checkout_url = ?,
         checkout_created_at = ?,
         product_id = ?,
         checkout_repair_json = ?,
         expected_amount = NULL,
         expected_currency = NULL,
         checkout_lock_until = NULL,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      checkout.checkoutSessionId,
      checkout.checkoutUrl,
      checkoutCreatedAt,
      dodoRepairSprintProductId(env),
      JSON.stringify(checkoutTarget),
      checkoutCreatedAt,
      fixRequest.id
    )
    .run();
  await attachRepairSprintProposalsToFixRequest(env, fixRequest, proposals, now);

  return jsonNoStore({
    ok: true,
    mode: "checkout",
    checkoutUrl: checkout.checkoutUrl,
    request: {
      ...fixRequestWithProposalSummary(fixRequest, proposalSummary, checkoutCreatedAt),
      status: "checkout_created",
      checkoutSessionId: checkout.checkoutSessionId,
      offer: REPAIR_SPRINT_OFFER,
      checkoutCreatedAt
    },
    offer: REPAIR_SPRINT_OFFER,
    repairSprint: {
      ...eligibility,
      checkoutLive: true
    },
    proposalSummary
  });
}

async function requestMonitoringCheckout(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json(
      { error: "Monitoring storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );

  const parsed = await parseJsonBody(request, MonitoringCheckoutBody);
  if (parsed.error) return json(parsed.error, 400);
  const body = parsed.data;
  const config = dodoMonitoringCheckoutConfigStatus(env);
  if (!hasDodoMonitoringCheckoutConfig(env)) {
    const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, 0);
    return monitoringCheckoutErrorResponse({
      status: 503,
      code: "MONITORING_CHECKOUT_NOT_CONFIGURED",
      error: "Monitoring checkout is not open yet. You have not been charged.",
      missing: dodoConfigMissing(config),
      monitoring,
      target: monitoringCheckoutTargetResponse()
    });
  }
  const monitoringLimited = await checkoutQuotaResponse(env, access, "monitoring");
  if (monitoringLimited) return monitoringLimited;

  const schema = await monitoringEntitlementSchemaStatus(env);
  if (!schema.ok) {
    const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, 0);
    return monitoringCheckoutErrorResponse({
      status: 503,
      code: "MONITORING_ENTITLEMENT_SCHEMA_MISSING",
      error: "Monitoring entitlement storage is being updated. Try again in a few minutes.",
      monitoring,
      target: monitoringCheckoutTargetResponse()
    });
  }

  let context;
  try {
    context = await monitoringCheckoutContext(env, access, body);
  } catch {
    const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, 0);
    return monitoringCheckoutErrorResponse({
      status: 503,
      code: "MONITORING_ELIGIBILITY_UNAVAILABLE",
      error: "Monitoring eligibility could not be checked. Retry after site and schedule storage is ready.",
      monitoring,
      target: monitoringCheckoutTargetResponse()
    });
  }
  const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, context.activeScheduleCount);

  if (monitoring.status === "active") {
    return jsonNoStore({
      ok: true,
      mode: "active",
      checkoutAvailable: false,
      message: "Monitoring is already on for this workspace.",
      monitoring,
      offer: MONITORING_OFFER
    });
  }

  if (!context.targetHost) {
    return monitoringCheckoutErrorResponse({
      status: 409,
      code: "MONITORING_SITE_REQUIRED",
      error: "Verify a site or add a monitor first, then start monitoring checkout.",
      monitoring,
      eligibleSites: context.eligibleSites,
      target: monitoringCheckoutTargetResponse(context)
    });
  }

  const checkoutResponse = (checkoutUrl) =>
    jsonNoStore({
      ok: true,
      mode: "checkout",
      checkoutUrl,
      checkoutAvailable: true,
      message: "Checkout opens on Dodo Payments. Monitoring starts once Dodo confirms your payment.",
      monitoring,
      offer: MONITORING_OFFER,
      target: monitoringCheckoutTargetResponse(context)
    });

  // Reuse the owner's open subscription checkout, and lock while creating one,
  // so repeat clicks cannot start several Dodo subscriptions.
  let lock;
  try {
    lock = await claimMonitoringCheckout(env, access.ownerEmail, context.targetHost);
  } catch {
    return monitoringCheckoutErrorResponse({
      status: 503,
      code: "MONITORING_CHECKOUT_SCHEMA_MISSING",
      error: "Monitoring checkout storage is being updated. Try again in a few minutes.",
      monitoring,
      target: monitoringCheckoutTargetResponse(context)
    });
  }
  if (lock.cachedUrl) return checkoutResponse(lock.cachedUrl);
  if (!lock.claimed) {
    return monitoringCheckoutErrorResponse({
      status: 409,
      code: "CHECKOUT_IN_PROGRESS",
      error: "Monitoring checkout is already being opened. Wait a few seconds and try again.",
      monitoring,
      target: monitoringCheckoutTargetResponse(context)
    });
  }

  let checkout;
  try {
    checkout = await createDodoMonitoringCheckout(request, env, access, context);
  } catch (error) {
    await releaseMonitoringCheckoutLock(env, access.ownerEmail);
    return monitoringCheckoutErrorResponse({
      status: 503,
      code: error?.code || "DODO_MONITORING_CHECKOUT_ERROR",
      error: error?.message || "Dodo monitoring checkout could not be created.",
      monitoring,
      target: monitoringCheckoutTargetResponse(context)
    });
  }
  const createdAt = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE monitoring_checkout_sessions
     SET target_host = ?, checkout_session_id = ?, checkout_url = ?, checkout_created_at = ?,
         lock_until = NULL, updated_at = ?
     WHERE owner_email = ?`
  )
    .bind(context.targetHost, checkout.checkoutSessionId, checkout.checkoutUrl, createdAt, createdAt, access.ownerEmail)
    .run();

  return checkoutResponse(checkout.checkoutUrl);
}

function freshMonitoringCheckoutUrl(row, targetHost) {
  if (!row?.checkout_url || row.target_host !== targetHost || !row.checkout_created_at) return "";
  return row.checkout_created_at > isoSecondsFromNow(-CHECKOUT_URL_TTL_HOURS * 60 * 60) ? row.checkout_url : "";
}

async function monitoringCheckoutRow(env, ownerEmail) {
  return env.WAITLIST_DB.prepare("SELECT * FROM monitoring_checkout_sessions WHERE owner_email = ? LIMIT 1")
    .bind(ownerEmail)
    .first();
}

async function releaseMonitoringCheckoutLock(env, ownerEmail) {
  await env.WAITLIST_DB.prepare("UPDATE monitoring_checkout_sessions SET lock_until = NULL WHERE owner_email = ?")
    .bind(ownerEmail)
    .run();
}

async function claimMonitoringCheckout(env, ownerEmail, targetHost) {
  const cachedUrl = freshMonitoringCheckoutUrl(await monitoringCheckoutRow(env, ownerEmail), targetHost);
  if (cachedUrl) return { claimed: false, cachedUrl };
  const now = new Date().toISOString();
  const result = await env.WAITLIST_DB.prepare(
    `INSERT INTO monitoring_checkout_sessions (owner_email, lock_until, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET
       lock_until = excluded.lock_until,
       updated_at = excluded.updated_at
     WHERE monitoring_checkout_sessions.lock_until IS NULL OR monitoring_checkout_sessions.lock_until <= ?`
  )
    .bind(ownerEmail, isoSecondsFromNow(CHECKOUT_LOCK_SECONDS), now, now)
    .run();
  const claimed = Number(result?.meta?.changes || 0) === 1;
  // Another click may have finished creating a session while this one waited.
  const raced = freshMonitoringCheckoutUrl(await monitoringCheckoutRow(env, ownerEmail), targetHost);
  if (raced) {
    if (claimed) await releaseMonitoringCheckoutLock(env, ownerEmail);
    return { claimed: false, cachedUrl: raced };
  }
  return { claimed, cachedUrl: "" };
}

async function getPublicFixPackPricing(request, env, ctx) {
  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) return json({ ok: false }, 503);
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/public-pricing`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const pricing = await previewDodoFixPackPricing({}, env, null);
    const response = new Response(JSON.stringify({ ok: true, pricing: { displayPrice: pricing.displayPrice || "" } }), {
      headers: secureHeaders({
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=3600"
      })
    });
    ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
    return response;
  } catch {
    return json({ ok: false }, 503);
  }
}

async function getFixPackPricingPreview(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);

  const config = dodoCheckoutConfigStatus(env);
  if (!config.checkoutReady) {
    return jsonNoStore(
      {
        ok: false,
        code: "PRICING_UNAVAILABLE",
        message: "Pricing is not available because checkout is not set up yet. Try again later.",
        pricing: {
          status: "unavailable",
          source: "dodo",
          environment: config.environment || "",
          missing: dodoConfigMissing(config)
        }
      },
      503
    );
  }

  try {
    const pricing = await previewDodoFixPackPricing(request, env, access);
    return jsonNoStore({ ok: true, pricing });
  } catch (error) {
    return jsonNoStore(
      {
        ok: false,
        code: error?.code || "PRICING_UNAVAILABLE",
        message: error?.message || "Dodo Payments did not return a price. Try again in a minute.",
        pricing: {
          status: "unavailable",
          source: "dodo"
        }
      },
      503
    );
  }
}

async function getBillingSummary(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return json({ error: "Billing storage is not set up on this server. Email support@seofixkit.com for help." }, 503);

  const now = new Date().toISOString();
  const dodoConfig = dodoCheckoutConfigStatus(env);
  const monitoringConfig = dodoMonitoringCheckoutConfigStatus(env);
  const repairSprintConfig = dodoRepairSprintCheckoutConfigStatus(env);
  const [monitoringEntitlementSchema, activeMonitorCount, monitoringEligibility] = await Promise.all([
    monitoringEntitlementSchemaStatus(env),
    activeAuditScheduleCount(env, access.ownerEmail),
    monitoringCheckoutEligibilitySummary(env, access.ownerEmail)
  ]);
  const monitoringCheckoutReady = monitoringConfig.checkoutReady && monitoringEntitlementSchema.ok;
  const effectiveMonitoringConfig = {
    ...monitoringConfig,
    checkoutReady: monitoringCheckoutReady
  };
  const monitoring = await monitoringAccessForOwner(env, access.ownerEmail, activeMonitorCount);
  const pricing = await billingPricingState(request, env, access, dodoConfig);
  const offers = await offerCatalogForOwner(env, access.ownerEmail, {
    fixPackCheckoutReady: dodoConfig.checkoutReady,
    monitoringCheckoutReady,
    repairSprintCheckoutReady: repairSprintConfig.checkoutReady
  });
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE owner_email = ?
       AND is_test = 0
     ORDER BY updated_at DESC
     LIMIT 50`
  )
    .bind(access.ownerEmail)
    .all();
  const fixRows = rows.results || [];
  const proposalSummaries = await repairProposalSummariesForFixRequests(
    env,
    fixRows.map((row) => row.id),
    access.ownerEmail
  );
  const requests = fixRows.map((row) => billingFixRequestResponse(row, now, proposalSummaries.get(row.id)));
  const payments = fixRows
    .filter(
      (row) => row.payment_id || row.paid_at || row.refunded_at || row.dispute_event || row.status === "payment_failed"
    )
    .map(billingPaymentResponse);

  return jsonNoStore({
    ok: true,
    owner: {
      email: access.ownerEmail
    },
    provider: {
      name: "Dodo Payments",
      source: "dodo",
      environment: dodoConfig.environment || "",
      checkoutReady: dodoConfig.checkoutReady,
      missing: dodoConfigMissing(dodoConfig),
      monitoringCheckoutReady,
      monitoringMissing: dodoConfigMissing(monitoringConfig),
      repairSprintCheckoutReady: repairSprintConfig.checkoutReady,
      repairSprintMissing: dodoConfigMissing(repairSprintConfig),
      monitoringEntitlementSchemaReady: monitoringEntitlementSchema.ok
    },
    billingLayer: {
      name: "BillingSDK-compatible customer portal",
      mode: "worker-dodo-source-of-truth"
    },
    product: {
      ...FIX_PACK_OFFER,
      mode: "one_time_fix_pack",
      checkoutStartsFrom: "report",
      checkoutNote: "Start checkout from a report with proven fixes so payment stays tied to a repair brief."
    },
    pricing,
    offers,
    monitoring: {
      ...monitoring,
      ...monitoringEligibility,
      checkoutReady: monitoringCheckoutReady,
      checkoutMissing: [
        ...dodoConfigMissing(monitoringConfig),
        ...(monitoringEntitlementSchema.ok ? [] : ["entitlementSchema"])
      ],
      offer: MONITORING_OFFER
    },
    subscriptionState: billingSubscriptionState(monitoring, effectiveMonitoringConfig),
    subscriptions:
      monitoring.status === "active"
        ? [
            {
              offerKey: OFFER_KEYS.MONITORING,
              name: MONITORING_OFFER.name,
              status: "active",
              activeCount: monitoring.activeCount,
              limit: monitoring.limit,
              currentPeriodEnd: monitoring.currentPeriodEnd || ""
            }
          ]
        : [],
    requests,
    payments,
    generatedAt: now
  });
}

async function billingPricingState(request, env, access, config) {
  if (!config.checkoutReady) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: dodoConfigMissing(config),
      message: "Pricing is not available because checkout is not set up yet. Try again later."
    };
  }

  try {
    return await previewDodoFixPackPricing(request, env, access);
  } catch (error) {
    return {
      status: "unavailable",
      source: "dodo",
      environment: config.environment || "",
      missing: [],
      message: error?.message || "Dodo Payments did not return a price. Try again in a minute."
    };
  }
}

async function activeAuditScheduleCount(env, ownerEmail) {
  if (!env.WAITLIST_DB || !ownerEmail) return 0;
  try {
    const row = await env.WAITLIST_DB.prepare(
      `SELECT COUNT(*) AS count
       FROM audit_schedules
       WHERE owner_email = ?
         AND status = 'active'`
    )
      .bind(ownerEmail)
      .first();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function monitoringCheckoutEligibilitySummary(env, ownerEmail) {
  try {
    const context = await monitoringCheckoutContext(env, { ownerEmail }, {});
    return {
      hasEligibleSite: Boolean(context.targetHost),
      eligibleSiteCount: context.eligibleSites.length
    };
  } catch {
    return {
      hasEligibleSite: false,
      eligibleSiteCount: 0
    };
  }
}

function billingSubscriptionState(monitoring = {}, config = {}) {
  if (monitoring.status === "active") {
    return {
      status: "active",
      label: "Proof Monitoring active",
      message: "Weekly monitoring is on for this workspace."
    };
  }
  if (config.checkoutReady) {
    return {
      status: "available",
      label: "Proof Monitoring available",
      message:
        "Paid monitoring is available for verified sites. It starts once Dodo Payments confirms your subscription."
    };
  }
  return {
    status: "not_live",
    label: "No recurring subscription",
    message: "You have no subscription. Paid monitoring is not on sale. The Fix Pack is a one-time payment."
  };
}

async function monitoringCheckoutContext(env, access, body = {}) {
  const requestedHost = requestedMonitoringHost(body);
  const [siteRows, scheduleRows] = await Promise.all([
    env.WAITLIST_DB.prepare(
      `SELECT id, host, status, updated_at
       FROM site_claims
       WHERE owner_email = ?
         AND status = 'verified'
         AND revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all(),
    env.WAITLIST_DB.prepare(
      `SELECT id, target_url, target_host, interval_days, max_pages, updated_at
       FROM audit_schedules
       WHERE owner_email = ?
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 20`
    )
      .bind(access.ownerEmail)
      .all()
  ]);
  const sites = (siteRows.results || [])
    .map((row) => ({ ...row, host: cleanReportDomain(row.host || "") }))
    .filter((row) => row.host);
  const schedules = (scheduleRows.results || [])
    .map((row) => ({
      ...row,
      target_host: cleanReportDomain(row.target_host || "") || safeHostname(row.target_url || "")
    }))
    .filter((row) => row.target_host);

  const eligible = new Map();
  for (const site of sites) {
    eligible.set(site.host, { host: site.host, siteClaimId: site.id || "", auditScheduleId: "" });
  }
  for (const schedule of schedules) {
    const current = eligible.get(schedule.target_host) || {
      host: schedule.target_host,
      siteClaimId: "",
      auditScheduleId: ""
    };
    eligible.set(schedule.target_host, { ...current, auditScheduleId: schedule.id || "" });
  }

  const fallback = schedules[0]?.target_host || sites[0]?.host || "";
  const targetHost = requestedHost ? (eligible.has(requestedHost) ? requestedHost : "") : fallback;
  const target = targetHost ? eligible.get(targetHost) : null;
  return {
    requestedHost,
    targetHost,
    siteClaimId: target?.siteClaimId || "",
    auditScheduleId: target?.auditScheduleId || "",
    activeScheduleCount: schedules.length,
    eligibleSites: [...eligible.values()].slice(0, 20)
  };
}

function requestedMonitoringHost(body = {}) {
  const host = cleanReportDomain(body.targetHost || body.host || "");
  if (host) return host;
  return safeHostname(body.targetUrl || body.url || "");
}

function monitoringCheckoutTargetResponse(context = {}) {
  return {
    targetHost: context.targetHost || "",
    siteClaimId: context.siteClaimId || "",
    auditScheduleId: context.auditScheduleId || ""
  };
}

function monitoringCheckoutErrorResponse({
  status = 503,
  code,
  error,
  message = "",
  monitoring = null,
  target = null,
  missing = undefined,
  eligibleSites = undefined
} = {}) {
  return jsonNoStore(
    {
      ok: false,
      code,
      error,
      message: message || error,
      checkoutAvailable: false,
      monitoring,
      offer: MONITORING_OFFER,
      target,
      ...(missing ? { missing } : {}),
      ...(eligibleSites ? { eligibleSites } : {})
    },
    status
  );
}

async function getOrCreateFixRequest(env, reportRow, access, summary, note, now, options = {}) {
  const existing = await latestFixRequestForReport(env, reportRow.id, access.ownerEmail);
  if (existing?.id) return existing;

  const id = crypto.randomUUID();
  const isTest = options.isTest ? 1 : 0;
  const insert = await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_requests
      (id, report_id, owner_email, target_url, target_host, score, issue_count, status, note, is_test, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
     ON CONFLICT(report_id, owner_email) DO NOTHING`
  )
    .bind(
      id,
      reportRow.id,
      access.ownerEmail,
      reportRow.url,
      reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      reportRow.score,
      Number(summary.totalFindings || 0),
      note,
      isTest,
      now,
      now
    )
    .run();
  if (insert?.meta?.changes === 0) {
    const raced = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_requests
       WHERE report_id = ? AND owner_email = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(reportRow.id, access.ownerEmail)
      .first();
    if (raced?.id) return raced;
  }
  await logFixRequestEvent(env, {
    fixRequestId: id,
    event: "created",
    actorType: "owner",
    actorEmail: access.ownerEmail,
    fromStatus: "",
    toStatus: "new",
    reason: note,
    detail: {
      reportId: reportRow.id,
      isTest: Boolean(isTest),
      selectedRepair: options.selectedRepair || null
    }
  });

  return {
    id,
    report_id: reportRow.id,
    owner_email: access.ownerEmail,
    target_url: reportRow.url,
    target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
    score: reportRow.score,
    issue_count: Number(summary.totalFindings || 0),
    status: "new",
    note,
    is_test: isTest,
    created_at: now,
    updated_at: now
  };
}

async function latestFixRequestForReport(env, reportId, ownerEmail) {
  return env.WAITLIST_DB.prepare(
    `SELECT *
     FROM fix_requests
     WHERE report_id = ? AND owner_email = ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(reportId, ownerEmail)
    .first();
}

async function fixPackRepairContext(env, access, reportId, report = {}, body = {}) {
  const { items, unavailable } = await ensureRepairQueueRows(env, access, reportId, report);
  const selection = selectFixPackRepair(items, body);
  return {
    items,
    unavailable: Boolean(unavailable),
    selectedRepair: selection.selectedRepair,
    selectionConflict: selection.conflict
  };
}

async function fixPackCheckoutSchemaStatus(env) {
  try {
    const statement = env.WAITLIST_DB.prepare(
      "SELECT checkout_repair_json, checkout_lock_until, expected_amount, pre_dispute_status FROM fix_requests LIMIT 1"
    );
    if (typeof statement.first === "function") {
      await statement.first();
    } else {
      await statement.bind().first();
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Fix Pack checkout metadata column is missing."
    };
  }
}

function checkoutRepairTarget(selectedRepair = null) {
  if (!selectedRepair) return { queueItemId: "", issueId: "", status: "" };
  return {
    queueItemId: cleanText(selectedRepair.queueItemId || selectedRepair.queue_item_id || "", 160),
    issueId: cleanText(selectedRepair.issueId || selectedRepair.issue_id || "", 160),
    status: selectedRepair.status ? cleanQueueStatus(selectedRepair.status) : ""
  };
}

function checkoutRepairTargetJson(selectedRepair = null) {
  return JSON.stringify(checkoutRepairTarget(selectedRepair));
}

function checkoutRepairTargetFromJson(value = "") {
  if (!value) return null;
  const parsed = parseJson(value, null);
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.offerKey === OFFER_KEYS.REPAIR_SPRINT) return null;
  return checkoutRepairTarget(parsed);
}

function checkoutRepairTargetMatches(fixRequest = {}, selectedRepair = null) {
  const stored = checkoutRepairTargetFromJson(fixRequest.checkout_repair_json || "");
  if (!stored) return false;
  const current = checkoutRepairTarget(selectedRepair);
  return (
    stored.queueItemId === current.queueItemId && stored.issueId === current.issueId && stored.status === current.status
  );
}

function checkoutRepairSprintTarget(proposals = []) {
  const approved = (proposals || [])
    .filter((proposal) => proposal.approval_status === "approved" && proposal.execution_mode !== "unsupported")
    .slice(0, 25);
  return {
    offerKey: OFFER_KEYS.REPAIR_SPRINT,
    proposalIds: approved
      .map((proposal) => cleanText(proposal.id || "", 160))
      .filter(Boolean)
      .sort(),
    issueIds: approved
      .map((proposal) => cleanText(proposal.issue_id || "", 160))
      .filter(Boolean)
      .sort(),
    approved: approved.length,
    executable: (proposals || []).filter((proposal) => proposal.execution_mode !== "unsupported").length
  };
}

function checkoutRepairSprintTargetFromJson(value = "") {
  if (!value) return null;
  const parsed = parseJson(value, null);
  if (!parsed || typeof parsed !== "object" || parsed.offerKey !== OFFER_KEYS.REPAIR_SPRINT) return null;
  return {
    offerKey: OFFER_KEYS.REPAIR_SPRINT,
    proposalIds: Array.isArray(parsed.proposalIds)
      ? parsed.proposalIds
          .map((id) => cleanText(id, 160))
          .filter(Boolean)
          .sort()
      : [],
    issueIds: Array.isArray(parsed.issueIds)
      ? parsed.issueIds
          .map((id) => cleanText(id, 160))
          .filter(Boolean)
          .sort()
      : [],
    approved: Number(parsed.approved || 0),
    executable: Number(parsed.executable || 0)
  };
}

function checkoutRepairSprintTargetMatches(fixRequest = {}, current = {}) {
  const stored = checkoutRepairSprintTargetFromJson(fixRequest.checkout_repair_json || "");
  if (!stored) return false;
  return (
    stored.approved === current.approved &&
    stored.executable === current.executable &&
    stored.proposalIds.join(",") === (current.proposalIds || []).join(",") &&
    stored.issueIds.join(",") === (current.issueIds || []).join(",")
  );
}

async function repairSprintProposalsForCheckout(env, reportId, ownerEmail) {
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT id, issue_id, approval_status, execution_mode, delivery_status, report_id, owner_email, fix_request_id
     FROM repair_proposals
     WHERE report_id = ?
       AND owner_email = ?
     ORDER BY priority ASC, updated_at DESC
     LIMIT 50`
  )
    .bind(reportId, ownerEmail)
    .all();
  return rows.results || [];
}

function repairSprintProposalSummary(proposals = []) {
  const executable = (proposals || []).filter((proposal) => proposal.execution_mode !== "unsupported");
  const approved = executable.filter((proposal) => proposal.approval_status === "approved");
  const delivered = executable.filter((proposal) => proposal.delivery_status === "delivered");
  return {
    status: "ready",
    total: proposals.length,
    executable: executable.length,
    approved: approved.length,
    approvedExecutable: approved.length,
    delivered: delivered.length
  };
}

async function attachRepairSprintProposalsToFixRequest(
  env,
  fixRequest = {},
  proposals = [],
  now = new Date().toISOString()
) {
  const ids = (proposals || [])
    .filter((proposal) => proposal.approval_status === "approved" && proposal.execution_mode !== "unsupported")
    .map((proposal) => proposal.id)
    .filter(Boolean);
  for (const id of ids) {
    await env.WAITLIST_DB.prepare(
      `UPDATE repair_proposals
       SET fix_request_id = COALESCE(NULLIF(fix_request_id, ''), ?),
           updated_at = ?
       WHERE id = ?
         AND report_id = ?
         AND owner_email = ?
         AND approval_status = 'approved'
         AND execution_mode != 'unsupported'`
    )
      .bind(fixRequest.id, now, id, fixRequest.report_id, fixRequest.owner_email)
      .run();
  }
}

function repairSprintCheckoutErrorResponse({
  status = 400,
  code,
  error,
  message = "",
  repairSprint = null,
  proposalSummary = null,
  request = null,
  missing = undefined
} = {}) {
  return jsonNoStore(
    {
      ok: false,
      code,
      error,
      message: message || error,
      checkoutAvailable: false,
      offer: REPAIR_SPRINT_OFFER,
      repairSprint,
      proposalSummary,
      request,
      ...(missing ? { missing } : {})
    },
    status
  );
}

async function seedRepairProposalsForFixRequest(env, report, fixRequest, reportRow, access, now) {
  if (!env.WAITLIST_DB || !fixRequest?.id || !report?.url) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  const proposals = buildRepairProposalsFromReport(report, {
    fixRequestId: fixRequest.id,
    ownerEmail: access.ownerEmail,
    reportId: reportRow.id,
    targetUrl: reportRow.url,
    targetHost: reportRow.target_host || safeHostname(reportRow.url),
    limit: 25
  });
  if (!proposals.length) return { status: "ready", total: 0, created: 0, executable: 0 };

  try {
    const existing = await env.WAITLIST_DB.prepare(
      `SELECT id, issue_id, fix_request_id
       FROM repair_proposals
       WHERE report_id = ?
         AND owner_email = ?`
    )
      .bind(reportRow.id, access.ownerEmail)
      .all();
    const existingIssueIds = new Set();
    const adoptableProposalIds = new Map();
    for (const row of existing.results || []) {
      if (!row.issue_id) continue;
      if (row.fix_request_id === fixRequest.id) existingIssueIds.add(row.issue_id);
      else if (!row.fix_request_id && !adoptableProposalIds.has(row.issue_id)) {
        adoptableProposalIds.set(row.issue_id, row.id);
      }
    }
    let created = 0;
    let adopted = 0;
    for (const proposal of proposals) {
      if (existingIssueIds.has(proposal.issueId)) continue;
      const adoptableId = adoptableProposalIds.get(proposal.issueId);
      if (adoptableId) {
        const adoptResult = await env.WAITLIST_DB.prepare(
          `UPDATE repair_proposals
           SET fix_request_id = ?,
               updated_at = ?
           WHERE id = ?
             AND report_id = ?
             AND owner_email = ?
             AND COALESCE(fix_request_id, '') = ''`
        )
          .bind(fixRequest.id, now, adoptableId, reportRow.id, access.ownerEmail)
          .run();
        adopted += Number(adoptResult?.meta?.changes || 0);
        continue;
      }
      const result = await env.WAITLIST_DB.prepare(
        `INSERT OR IGNORE INTO repair_proposals
          (id, fix_request_id, report_id, owner_email, issue_id, issue_title, target_url, target_host,
           severity, source, priority, execution_mode, approval_status, delivery_status, generated_title,
           generated_summary, proof_json, proposal_json, acceptance_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          fixRequest.id,
          reportRow.id,
          access.ownerEmail,
          proposal.issueId,
          proposal.issueTitle,
          proposal.targetUrl || reportRow.url,
          proposal.targetHost || reportRow.target_host || safeHostname(reportRow.url),
          proposal.severity,
          proposal.source,
          proposal.priority,
          proposal.executionMode,
          proposal.approvalStatus,
          proposal.deliveryStatus,
          proposal.generatedTitle,
          proposal.generatedSummary,
          jsonForStorage(proposal.proof || {}, 4000, {}),
          jsonForStorage(proposal.proposal || {}, 4000, { truncated: true }),
          jsonForStorage(proposal.acceptance || [], 2000, []),
          now,
          now
        )
        .run();
      created += Number(result?.meta?.changes || 0);
    }
    return {
      status: "ready",
      total: proposals.length,
      created,
      adopted,
      executable: proposals.filter((proposal) => proposal.executionMode !== "unsupported").length
    };
  } catch {
    return { status: "unavailable", total: 0, created: 0, executable: 0 };
  }
}

async function seedRepairProposalsForPaidFixRequest(env, fixRequest, now) {
  if (!env.WAITLIST_DB || !fixRequest?.id || !fixRequest?.report_id || !fixRequest?.owner_email) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  if (!["paid", "in_progress"].includes(fixRequest.status || "")) {
    return { status: "skipped", total: 0, created: 0, executable: 0 };
  }
  try {
    const reportRow = await env.WAITLIST_DB.prepare(
      `SELECT id, url, target_host, report_json
       FROM audit_reports
       WHERE id = ?
       LIMIT 1`
    )
      .bind(fixRequest.report_id)
      .first();
    const report = parseJson(await reportJsonForRow(env, reportRow || {}), {});
    return seedRepairProposalsForFixRequest(
      env,
      report,
      fixRequest,
      reportRow || {
        id: fixRequest.report_id,
        url: fixRequest.target_url || "",
        target_host: fixRequest.target_host || ""
      },
      { ownerEmail: fixRequest.owner_email },
      now
    );
  } catch {
    return { status: "unavailable", total: 0, created: 0, executable: 0 };
  }
}

function fixRequestWithProposalSummary(fixRequest, proposalSeed, now) {
  return {
    ...fixRequestResponse(fixRequest, now),
    repairProposalSummary: proposalSeed
  };
}

function jsonForStorage(value, maxLength, fallback) {
  const initial = JSON.stringify(value ?? fallback);
  if (initial.length <= maxLength) return initial;
  for (const maxStringLength of [3000, 2000, 1000, 500, 200, 80]) {
    const compacted = JSON.stringify(compactJsonStrings(value ?? fallback, maxStringLength));
    if (compacted.length <= maxLength) return compacted;
  }
  return JSON.stringify(fallback);
}

function compactJsonStrings(value, maxStringLength) {
  if (typeof value === "string") return value.slice(0, maxStringLength);
  if (Array.isArray(value)) return value.map((item) => compactJsonStrings(item, maxStringLength));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactJsonStrings(item, maxStringLength)])
  );
}

function billingPaymentResponse(row) {
  const currency = normalizeCurrencyCode(row.payment_currency || row.refund_currency || "");
  const amountMinor = numberOrNull(row.payment_amount);
  const refundCurrency = normalizeCurrencyCode(row.refund_currency || "");
  const refundAmountMinor = numberOrNull(row.refund_amount);
  const type = row.refunded_at
    ? "refund"
    : row.dispute_event
      ? "dispute"
      : row.status === "payment_failed"
        ? "failed_payment"
        : "payment";

  return {
    id: row.id,
    type,
    status: row.status || "",
    statusLabel: fixRequestStatusLabel(row.status || "new"),
    displayReference: billingPaymentDisplayReference(type),
    amountMinor,
    currency,
    displayAmount: currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "",
    refundAmountMinor,
    refundCurrency,
    displayRefundAmount:
      refundCurrency && refundAmountMinor !== null ? formatMinorCurrency(refundAmountMinor, refundCurrency) : "",
    targetHost: row.target_host,
    targetUrl: row.target_url,
    reportPath: `/beta/reports/${row.report_id}`,
    paidAt: row.paid_at || "",
    refundedAt: row.refunded_at || "",
    disputedAt: row.disputed_at || "",
    createdAt: row.paid_at || row.refunded_at || row.disputed_at || row.updated_at || row.created_at || ""
  };
}

function billingPaymentDisplayReference(type = "payment") {
  if (type === "refund") return "Dodo refund record";
  if (type === "dispute") return "Dodo dispute record";
  if (type === "failed_payment") return "Dodo payment attempt";
  return "Dodo payment record";
}

function isAllowedAdminStatusTransition(currentStatus, requestedStatus) {
  const current = normalizeFixRequestStatus(currentStatus, "new");
  const requested = normalizeFixRequestStatus(requestedStatus, current);
  if (current === requested) return ADMIN_EDITABLE_FIX_REQUEST_STATUSES.has(requested) || requested === "paid";
  const allowed = {
    new: new Set(["checkout_created"]),
    checkout_created: new Set(["checkout_created"]),
    payment_failed: new Set(["checkout_created"]),
    paid: new Set(["in_progress", "delivered"]),
    in_progress: new Set(["delivered"]),
    delivered: new Set([]),
    refunded: new Set([]),
    refund_failed: new Set([]),
    disputed: new Set([])
  };
  return Boolean(allowed[current]?.has(requested));
}

async function validateFinalReportForFixRequest(env, fixRequest, finalReportId) {
  if (!isSafeReportId(finalReportId)) return { ok: false, error: "Final rerun report was not found." };
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id, url, target_host, owner_email, score, summary_json, created_at, expires_at
     FROM audit_reports
     WHERE id = ?
     LIMIT 1`
  )
    .bind(finalReportId)
    .first();
  if (!row?.id) return { ok: false, error: "Final rerun report was not found." };
  if (row.expires_at && row.expires_at <= new Date().toISOString()) {
    return { ok: false, error: "The final rerun report expired. Run the audit again first." };
  }
  if (row.owner_email !== fixRequest.owner_email) {
    return { ok: false, error: "Final rerun report belongs to another customer." };
  }
  const finalHost = row.target_host || safeHostname(row.url);
  const originalHost = fixRequest.target_host || safeHostname(fixRequest.target_url);
  if (finalHost !== originalHost) {
    return { ok: false, error: "Final rerun report must be for the same website." };
  }
  if (fixRequest.paid_at && row.created_at && row.created_at < fixRequest.paid_at) {
    return { ok: false, error: "Final rerun report must be created after payment." };
  }
  const summary = parseJson(row.summary_json, {});
  return {
    ok: true,
    beforeAfterSummary: {
      beforeReportId: fixRequest.report_id,
      finalReportId: row.id,
      beforeScore: Number(fixRequest.score || 0),
      afterScore: Number(row.score || 0),
      beforeFindings: Number(fixRequest.issue_count || 0),
      afterFindings: Number(summary.totalFindings || 0),
      generatedAt: new Date().toISOString()
    }
  };
}

async function previewDodoFixPackPricing(request, env, access) {
  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    customer: access?.ownerEmail ? { email: access.ownerEmail } : undefined
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw Object.assign(new Error(payload?.message || "Dodo pricing preview failed."), {
      status: response.status,
      code: payload?.code || "DODO_PRICING_PREVIEW_ERROR"
    });
  }

  const pricing = parseDodoPricingPreview(payload);
  if (!pricing.displayPrice) {
    throw Object.assign(new Error("Dodo did not return a displayable price."), {
      code: "DODO_PRICING_FORMAT_ERROR"
    });
  }
  return {
    ...pricing,
    status: "available",
    source: "dodo",
    country: country || "",
    feesInclusive: dodoAdaptiveCurrencyFeesInclusive(env)
  };
}

async function createDodoFixPackCheckout(request, env, reportRow, fixRequest, access, selectedRepair = null) {
  const returnUrl = new URL(request.url);
  returnUrl.pathname = `/beta/reports/${reportRow.id}`;
  returnUrl.search = "";
  returnUrl.searchParams.set("checkout", "return");
  returnUrl.searchParams.set("fixRequestId", fixRequest.id);

  const body = {
    product_cart: [{ product_id: dodoProductId(env), quantity: 1 }],
    return_url: returnUrl.toString(),
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    // Dodo docs: feature_flags.allow_discount_code shows the discount-code field; keep it off.
    feature_flags: { allow_discount_code: false },
    customer: { email: access.ownerEmail },
    metadata: {
      product_key: FIX_PACK_OFFER.productKey,
      fix_request_id: fixRequest.id,
      report_id: reportRow.id,
      target_host: reportRow.target_host || new URL(reportRow.url).hostname.toLowerCase(),
      test_mode: fixRequest.is_test ? "1" : "0",
      repair_issue_id: selectedRepair?.issueId || "",
      repair_queue_item_id: selectedRepair?.queueItemId || "",
      repair_title: cleanText(selectedRepair?.title || "", 120),
      repair_status: selectedRepair?.status || ""
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message =
      payload?.code === "MERCHANT_NOT_LIVE"
        ? "Dodo live payments are not enabled for this merchant yet."
        : payload?.message || "Dodo checkout could not be created.";
    return Promise.reject(Object.assign(new Error(message), { status: response.status, code: payload?.code || "" }));
  }

  const rawCheckoutUrl = payload.checkout_url || payload.payment_link || "";
  const checkoutUrl = safeDodoCheckoutUrl(rawCheckoutUrl, env);
  if (!checkoutUrl) {
    throw Object.assign(
      new Error(rawCheckoutUrl ? "Dodo returned an invalid checkout URL." : "Dodo did not return a checkout URL."),
      {
        code: "DODO_CHECKOUT_URL_INVALID"
      }
    );
  }
  return {
    checkoutUrl,
    checkoutSessionId: payload.session_id || payload.checkout_session_id || payload.id || ""
  };
}

async function createDodoMonitoringCheckout(request, env, access, context) {
  const returnUrl = new URL(request.url);
  returnUrl.pathname = "/beta/billing";
  returnUrl.search = "";
  returnUrl.searchParams.set("checkout", "monitoring-return");
  returnUrl.searchParams.set("host", context.targetHost || "");

  const body = {
    product_cart: [{ product_id: dodoMonitoringProductId(env), quantity: 1 }],
    return_url: returnUrl.toString(),
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    // Dodo docs: feature_flags.allow_discount_code shows the discount-code field; keep it off.
    feature_flags: { allow_discount_code: false },
    customer: { email: access.ownerEmail },
    metadata: {
      product_key: MONITORING_OFFER.productKey,
      offer_key: OFFER_KEYS.MONITORING,
      owner_email: access.ownerEmail,
      target_host: context.targetHost || "",
      site_claim_id: context.siteClaimId || "",
      audit_schedule_id: context.auditScheduleId || ""
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message =
      payload?.code === "MERCHANT_NOT_LIVE"
        ? "Dodo live payments are not enabled for this merchant yet."
        : payload?.message || "Dodo monitoring checkout could not be created.";
    return Promise.reject(Object.assign(new Error(message), { status: response.status, code: payload?.code || "" }));
  }

  const rawCheckoutUrl = payload.checkout_url || payload.payment_link || "";
  const checkoutUrl = safeDodoCheckoutUrl(rawCheckoutUrl, env);
  if (!checkoutUrl) {
    throw Object.assign(
      new Error(rawCheckoutUrl ? "Dodo returned an invalid checkout URL." : "Dodo did not return a checkout URL."),
      {
        code: "DODO_CHECKOUT_URL_INVALID"
      }
    );
  }
  return {
    checkoutUrl,
    checkoutSessionId: payload.session_id || payload.checkout_session_id || payload.id || ""
  };
}

async function createDodoRepairSprintCheckout(request, env, reportRow, fixRequest, access, sprintTarget = {}) {
  const returnUrl = new URL(request.url);
  returnUrl.pathname = `/beta/reports/${reportRow.id}`;
  returnUrl.search = "";
  returnUrl.searchParams.set("checkout", "repair-sprint-return");
  returnUrl.searchParams.set("fixRequestId", fixRequest.id);

  const body = {
    product_cart: [{ product_id: dodoRepairSprintProductId(env), quantity: 1 }],
    return_url: returnUrl.toString(),
    adaptive_currency_fees_inclusive: dodoAdaptiveCurrencyFeesInclusive(env),
    // Dodo docs: feature_flags.allow_discount_code shows the discount-code field; keep it off.
    feature_flags: { allow_discount_code: false },
    customer: { email: access.ownerEmail },
    metadata: {
      product_key: REPAIR_SPRINT_OFFER.productKey,
      offer_key: OFFER_KEYS.REPAIR_SPRINT,
      fix_request_id: fixRequest.id,
      report_id: reportRow.id,
      owner_email: access.ownerEmail,
      target_host: reportRow.target_host || safeHostname(reportRow.url),
      approved_proposal_count: String(sprintTarget.approved || 0),
      executable_proposal_count: String(sprintTarget.executable || 0)
    }
  };
  const country = dodoCountryFromRequest(request);
  if (country) body.billing_address = { country };

  const { response, payload } = await fetchDodoJson(`${dodoBaseUrl(env)}/checkouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${dodoApiKey(env)}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message =
      payload?.code === "MERCHANT_NOT_LIVE"
        ? "Dodo live payments are not enabled for this merchant yet."
        : payload?.message || "Dodo Repair Sprint checkout could not be created.";
    return Promise.reject(Object.assign(new Error(message), { status: response.status, code: payload?.code || "" }));
  }

  const rawCheckoutUrl = payload.checkout_url || payload.payment_link || "";
  const checkoutUrl = safeDodoCheckoutUrl(rawCheckoutUrl, env);
  if (!checkoutUrl) {
    throw Object.assign(
      new Error(rawCheckoutUrl ? "Dodo returned an invalid checkout URL." : "Dodo did not return a checkout URL."),
      {
        code: "DODO_CHECKOUT_URL_INVALID"
      }
    );
  }
  return {
    checkoutUrl,
    checkoutSessionId: payload.session_id || payload.checkout_session_id || payload.id || ""
  };
}

async function monitoringEntitlementSchemaStatus(env) {
  try {
    const entitlementStatement = env.WAITLIST_DB.prepare(
      "SELECT owner_email, offer_key, subscription_id, limits_json, revoked_at FROM offer_entitlements LIMIT 1"
    );
    if (typeof entitlementStatement.first === "function") {
      await entitlementStatement.first();
    } else {
      await entitlementStatement.bind().first();
    }
    const eventsStatement = env.WAITLIST_DB.prepare(
      "SELECT owner_email, offer_key, event FROM offer_entitlement_events LIMIT 1"
    );
    if (typeof eventsStatement.first === "function") {
      await eventsStatement.first();
    } else {
      await eventsStatement.bind().first();
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Offer entitlement table is missing."
    };
  }
}

async function fetchDodoJson(url, options) {
  if (!url) {
    throw Object.assign(new Error("Dodo environment is not configured."), { code: "DODO_ENVIRONMENT_MISSING" });
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function safeDodoCheckoutUrl(value = "", env = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return "";
    if (host === "dodopayments.com" || host.endsWith(".dodopayments.com")) return url.href;
    const allowed = new Set(
      String(env.DODO_SEOFIXKIT_CHECKOUT_HOST_ALLOWLIST || "")
        .split(",")
        .map((item) => cleanReportDomain(item))
        .filter(Boolean)
    );
    return allowed.has(host) ? url.href : "";
  } catch {
    return "";
  }
}

function parseDodoPricingPreview(payload = {}) {
  const breakup = objectValue(payload.current_breakup) || objectValue(payload.breakup) || {};
  const currency = normalizeCurrencyCode(payload.currency || payload.payment_currency || payload.checkout_currency);
  const amountMinor = numberOrNull(
    breakup.total_amount ??
      payload.total_amount ??
      payload.amount_total ??
      payload.total_price ??
      payload.total ??
      payload.amount
  );
  const displayPrice =
    textValue(payload.display_price) ||
    textValue(payload.displayPrice) ||
    textValue(payload.formatted_total) ||
    textValue(payload.formattedTotal) ||
    (currency && amountMinor !== null ? formatMinorCurrency(amountMinor, currency) : "");

  return {
    displayPrice,
    currency,
    amountMinor,
    subtotalMinor: numberOrNull(breakup.subtotal ?? payload.subtotal),
    taxMinor: numberOrNull(breakup.tax ?? payload.tax),
    discountMinor: numberOrNull(breakup.discount ?? payload.discount)
  };
}

function dodoConfigMissing(config = {}) {
  const missing = [];
  if (!config.apiKey) missing.push("apiKey");
  if (!config.productId) missing.push("productId");
  if (!config.brandId) missing.push("brandId");
  if (!config.environment) missing.push("environment");
  if (!config.webhookSecret) missing.push("webhookSecret");
  return missing;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrencyCode(value) {
  const currency = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function formatMinorCurrency(amountMinor, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(amountMinor / minorCurrencyDivisor(currency));
  } catch {
    return currency ? `${currency} ${amountMinor}` : String(amountMinor);
  }
}

function minorCurrencyDivisor(currency) {
  return new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF"
  ]).has(currency)
    ? 1
    : 100;
}

async function handleDodoWebhook(request, env, ctx) {
  if (!env.WAITLIST_DB || !dodoWebhookSecret(env)) {
    return jsonNoStore({ error: "Dodo webhook is not configured." }, 503);
  }

  const payloadText = await request.text();
  const webhookId = request.headers.get("webhook-id") || request.headers.get("svix-id") || "";
  const webhookTimestamp = request.headers.get("webhook-timestamp") || request.headers.get("svix-timestamp") || "";
  const webhookSignature = request.headers.get("webhook-signature") || request.headers.get("svix-signature") || "";

  const verified = await verifyDodoWebhookSignature({
    payload: payloadText,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    secret: dodoWebhookSecret(env)
  });
  if (!verified) return jsonNoStore({ error: "Invalid signature." }, 400);

  let event;
  try {
    event = JSON.parse(payloadText);
  } catch {
    return jsonNoStore({ error: "Invalid JSON payload." }, 400);
  }

  const eventType = String(event?.type || "");
  const isSubscriptionEvent = DODO_SUBSCRIPTION_EVENTS.has(eventType);
  const payment = isSubscriptionEvent ? {} : extractDodoPayment(event?.data || {});
  const subscription = isSubscriptionEvent ? extractDodoSubscription(event?.data || {}) : null;
  const webhookIdentity = isSubscriptionEvent
    ? { paymentId: subscription?.subscriptionId || "", metadataFixRequestId: "" }
    : payment;
  const payloadHash = await sha256Hex(payloadText);
  const reserved = await reserveDodoWebhookEvent(env, {
    webhookId,
    eventType,
    payment: webhookIdentity,
    payloadHash,
    payloadText
  });
  if (reserved.duplicate) return jsonNoStore({ received: true, duplicate: true });

  try {
    const result = isSubscriptionEvent
      ? await processDodoSubscriptionWebhook(env, eventType, subscription, webhookId)
      : await processDodoPaymentWebhook(env, eventType, payment, webhookId);
    await markDodoWebhookProcessed(
      env,
      webhookId,
      result.status || "processed",
      result.errorText || (result.alertReason ? `payment_identity_rejected: ${result.alertReason}` : ""),
      result.fixRequestId || payment.metadataFixRequestId || ""
    );
    if (result.adminAlert) {
      const alert = notifyAdminBillingAlert(env, { ...result.adminAlert, eventType, webhookId });
      if (ctx?.waitUntil) ctx.waitUntil(alert);
      else await alert;
    }
    if (result.paymentNotification?.fixRequest) {
      const notification = notifyPaymentSucceeded(env, result.paymentNotification.fixRequest, payment, {
        offerKey: result.paymentNotification.offerKey || result.offerKey || OFFER_KEYS.FIX_PACK
      });
      if (ctx?.waitUntil) ctx.waitUntil(notification);
      else await notification;
    }
    return jsonNoStore({ received: true, ...result, adminAlert: result.adminAlert ? true : undefined });
  } catch (error) {
    await markDodoWebhookProcessed(
      env,
      webhookId,
      "error",
      error?.message || "Webhook processing failed.",
      payment.metadataFixRequestId || ""
    );
    return jsonNoStore({ error: "Webhook processing failed." }, 500);
  }
}

async function reserveDodoWebhookEvent(env, { webhookId, eventType, payment, payloadHash, payloadText }) {
  if (!webhookId) throw new Error("Missing Dodo webhook id.");
  const now = new Date().toISOString();
  const providerPaymentId = String(payment?.paymentId || "");
  const fixRequestId = String(payment?.metadataFixRequestId || "");
  const inserted = await env.WAITLIST_DB.prepare(
    `INSERT OR IGNORE INTO dodo_webhook_events
      (webhook_id, event_type, payment_id, fix_request_id, status, error, payload_hash, payload_json,
       received_count, first_received_at, last_received_at, processed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'received', '', ?, ?, 1, ?, ?, '', ?, ?)`
  )
    .bind(
      webhookId,
      eventType,
      providerPaymentId,
      fixRequestId,
      payloadHash,
      payloadText.slice(0, 10000),
      now,
      now,
      now,
      now
    )
    .run();

  if (inserted?.meta?.changes === 1) return { duplicate: false };

  const existing = await env.WAITLIST_DB.prepare(
    "SELECT status, payload_hash FROM dodo_webhook_events WHERE webhook_id = ?"
  )
    .bind(webhookId)
    .first();
  if (existing?.payload_hash && existing.payload_hash !== payloadHash) {
    await markDodoWebhookProcessed(
      env,
      webhookId,
      "error",
      "Webhook id replayed with a different payload.",
      fixRequestId
    );
    throw new Error("Webhook id replayed with a different payload.");
  }
  if (existing?.status === "processed" || existing?.status === "ignored") return { duplicate: true };
  if (existing) {
    await env.WAITLIST_DB.prepare(
      `UPDATE dodo_webhook_events
       SET received_count = received_count + 1, last_received_at = ?, updated_at = ?
       WHERE webhook_id = ?`
    )
      .bind(now, now, webhookId)
      .run();
    return { duplicate: false };
  }
  throw new Error("Webhook receipt could not be reserved.");
}

async function processDodoPaymentWebhook(env, eventType, payment, webhookId = "") {
  const moneyBackEvent = isRefundOrDisputeEvent(eventType);
  if (!payment.paymentId && !payment.checkoutSessionId && !payment.metadataFixRequestId) {
    return {
      ok: false,
      ignored: !moneyBackEvent,
      status: moneyBackEvent ? "error" : "ignored",
      reason: "missing_payment_identity",
      errorText: moneyBackEvent ? "unmatched_refund_or_dispute: missing_payment_identity" : ""
    };
  }

  const fixRequest = await findFixRequestForPayment(env, payment);
  if (!fixRequest?.id) {
    // A refund or dispute we cannot match yet (for example one that arrives before
    // payment.succeeded) stays `error`: it is visible, retried, and replayed once the payment lands.
    return {
      ok: false,
      ignored: !moneyBackEvent,
      status: moneyBackEvent ? "error" : "ignored",
      reason: "fix_request_not_found",
      errorText: moneyBackEvent ? "unmatched_refund_or_dispute: fix_request_not_found" : ""
    };
  }

  const now = new Date().toISOString();
  if (payment.metadataWebhookDrill && Number(fixRequest.is_test || 0) !== 1) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_identity_rejected",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: "webhook_drill_requires_test_request",
      detail: { eventType, paymentId: payment.paymentId, webhookId }
    });
    return {
      ok: false,
      ignored: true,
      status: "ignored",
      reason: "webhook_drill_requires_test_request",
      fixRequestId: fixRequest.id
    };
  }
  const identity = await dodoPaymentIdentityStatus(env, eventType, payment, fixRequest);
  if (!identity.ok) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_identity_rejected",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: identity.reason,
      detail: { eventType, paymentId: payment.paymentId, webhookId }
    });
    const chargedWithoutAccess =
      DODO_PAYMENT_SUCCESS_EVENTS.has(eventType) && UNATTRIBUTABLE_PAYMENT_IDENTITY_REASONS.has(identity.reason);
    const unattributable = chargedWithoutAccess || moneyBackEvent;
    return {
      ok: false,
      ignored: true,
      status: unattributable ? "error" : "ignored",
      alertReason: unattributable ? identity.reason : "",
      reason: identity.reason,
      fixRequestId: fixRequest.id,
      adminAlert: chargedWithoutAccess
        ? { reason: identity.reason, fixRequest, detail: { paymentId: payment.paymentId } }
        : undefined
    };
  }

  if (DODO_PAYMENT_SUCCESS_EVENTS.has(eventType)) {
    if (payment.status && !PAID_STATUSES.has(payment.status)) {
      return { ok: false, ignored: true, status: "ignored", reason: "not_paid", fixRequestId: fixRequest.id };
    }
    if (
      fixRequest.paid_at &&
      fixRequest.payment_id &&
      payment.paymentId &&
      payment.paymentId !== fixRequest.payment_id
    ) {
      return recordDuplicatePayment(env, eventType, payment, fixRequest, webhookId, now);
    }
    const paymentStatusReason =
      identity.repairTargetState && identity.repairTargetState !== "active"
        ? `repair_target_${identity.repairTargetState}`
        : identity.checkoutSessionState === "superseded"
          ? "checkout_session_superseded"
          : "";
    const amountIssue = expectedAmountIssue(fixRequest, payment);
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE
             WHEN status IN ('in_progress', 'delivered', 'refunded', 'disputed') THEN status
             ELSE 'paid'
           END,
           payment_id = ?,
           checkout_session_id = COALESCE(checkout_session_id, ?),
           payment_amount = ?,
           payment_currency = ?,
           payment_customer_email = ?,
           dodo_business_id = ?,
           dodo_brand_id = ?,
           paid_at = COALESCE(paid_at, ?),
           due_at = COALESCE(due_at, ?),
           next_update_at = COALESCE(next_update_at, ?),
           status_reason = COALESCE(NULLIF(?, ''), status_reason),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        payment.paymentId,
        payment.checkoutSessionId,
        payment.amount || null,
        payment.currency || "",
        payment.customerEmail || "",
        payment.businessId || "",
        payment.brandId || "",
        now,
        isoDaysFromNow(FIX_PACK_DUE_DAYS),
        isoDaysFromNow(FIX_PACK_NEXT_UPDATE_DAYS),
        paymentStatusReason,
        now,
        fixRequest.id
      )
      .run();
    await recordFixRequestPayment(env, { fixRequestId: fixRequest.id, payment, role: "primary", webhookId, now });
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: PAID_LIKE_FIX_REQUEST_STATUSES.has(fixRequest.status) ? fixRequest.status : "paid",
      reason: payment.paymentId,
      detail: {
        webhookId,
        amount: payment.amount,
        currency: payment.currency,
        expectedAmount: fixRequest.expected_amount ?? null,
        expectedCurrency: fixRequest.expected_currency || "",
        amountIssue,
        checkoutSessionId: payment.checkoutSessionId,
        repairIssueId: payment.metadataRepairIssueId || "",
        repairQueueItemId: payment.metadataRepairQueueItemId || "",
        repairTitle: payment.metadataRepairTitle || "",
        checkoutSessionState: identity.checkoutSessionState || "current",
        repairTargetState: identity.repairTargetState || "active",
        repairTargetStatus: identity.repairTargetStatus || ""
      }
    });
    await replayPendingMoneyEvents(env, payment.paymentId, webhookId);
    const updated = (await fixRequestById(env, fixRequest.id)) || { ...fixRequest, status: "paid" };
    await seedRepairProposalsForPaidFixRequest(env, updated, now);
    await preserveFixRequestReports(env, updated);
    const refundedAlready = updated.status === "refunded";
    return {
      ok: true,
      // The payment is recorded and access is granted either way; a clearly wrong
      // amount only flags the webhook for the admin.
      status: amountIssue ? "error" : "processed",
      errorText: amountIssue ? `amount_mismatch: ${amountIssue}` : "",
      reason: amountIssue ? "amount_mismatch" : refundedAlready ? "refund_recorded_before_payment" : "",
      paid: !refundedAlready,
      refunded: refundedAlready || undefined,
      fixRequestId: fixRequest.id,
      adminAlert: amountIssue
        ? { reason: "amount_mismatch", fixRequest: updated, detail: { paymentId: payment.paymentId, amountIssue } }
        : undefined,
      paymentNotification: refundedAlready
        ? undefined
        : { fixRequest: updated, offerKey: identity.offerKey || OFFER_KEYS.FIX_PACK }
    };
  }

  if (DODO_PAYMENT_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN paid_at IS NOT NULL THEN status ELSE 'payment_failed' END,
           payment_id = COALESCE(payment_id, ?),
           checkout_session_id = COALESCE(checkout_session_id, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.paymentId, payment.checkoutSessionId, now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.paid_at ? fixRequest.status || "new" : "payment_failed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", paid: false, fixRequestId: fixRequest.id };
  }

  if (DODO_PAYMENT_PROCESSING_EVENTS.has(eventType)) {
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "payment_processing",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status || "new",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", processing: true, fixRequestId: fixRequest.id };
  }

  if (identity.paymentRole === "duplicate") {
    return processDuplicatePaymentMoneyEvent(env, eventType, payment, fixRequest, webhookId, now);
  }

  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType)) {
    if (isPartialRefund(fixRequest, payment)) {
      // A partial refund keeps the Fix Pack: record how much went back and why.
      await env.WAITLIST_DB.prepare(
        `UPDATE fix_requests
         SET refund_id = ?,
             refund_amount = COALESCE(refund_amount, 0) + ?,
             refund_currency = ?,
             refund_reason = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(
          payment.refundId || "",
          payment.amount || 0,
          payment.currency || "",
          payment.refundReason || "",
          now,
          fixRequest.id
        )
        .run();
      await updateFixRequestPaymentRecord(env, payment, "partially_refunded", now);
      await logFixRequestEvent(env, {
        fixRequestId: fixRequest.id,
        event: "partial_refund_succeeded",
        actorType: "dodo",
        fromStatus: fixRequest.status || "new",
        toStatus: fixRequest.status || "new",
        reason: payment.refundReason || payment.refundId || eventType,
        detail: {
          webhookId,
          paymentId: payment.paymentId,
          refundId: payment.refundId,
          amount: payment.amount,
          currency: payment.currency
        }
      });
      return { ok: true, status: "processed", partialRefund: true, fixRequestId: fixRequest.id };
    }
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = 'refunded',
           refund_id = ?,
           refund_amount = ?,
           refund_currency = ?,
           refund_reason = ?,
           refunded_at = COALESCE(refunded_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        payment.refundId || "",
        payment.amount || null,
        payment.currency || "",
        payment.refundReason || "",
        now,
        now,
        fixRequest.id
      )
      .run();
    await updateFixRequestPaymentRecord(env, payment, "refunded", now);
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_succeeded",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: "refunded",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId, amount: payment.amount, currency: payment.currency }
    });
    return { ok: true, status: "processed", refunded: true, fixRequestId: fixRequest.id };
  }

  if (DODO_REFUND_FAILURE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE WHEN status = 'refunded' THEN status ELSE 'refund_failed' END,
           refund_id = COALESCE(refund_id, ?),
           refund_amount = COALESCE(refund_amount, ?),
           refund_currency = COALESCE(refund_currency, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(payment.refundId || "", payment.amount || null, payment.currency || "", now, fixRequest.id)
      .run();
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "refund_failed",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "refunded" ? "refunded" : "refund_failed",
      reason: payment.refundId || eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", refundFailed: true, fixRequestId: fixRequest.id };
  }

  if (DODO_DISPUTE_EVENTS.has(eventType)) {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET pre_dispute_status = CASE WHEN status = 'disputed' THEN pre_dispute_status ELSE status END,
           status = CASE WHEN status = 'delivered' THEN status ELSE 'disputed' END,
           dispute_event = ?,
           disputed_at = COALESCE(disputed_at, ?),
           updated_at = ?
       WHERE id = ?`
    )
      .bind(eventType, now, now, fixRequest.id)
      .run();
    await updateFixRequestPaymentRecord(env, payment, "disputed", now, eventType);
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "dispute_event",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: fixRequest.status === "delivered" ? "delivered" : "disputed",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", disputed: true, fixRequestId: fixRequest.id };
  }

  if (DODO_DISPUTE_RESOLVED_EVENTS.has(eventType)) {
    // Won or withdrawn: the payment stands, so the request goes back to where it was.
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET status = CASE
             WHEN status = 'disputed' THEN COALESCE(
               NULLIF(pre_dispute_status, ''),
               CASE WHEN paid_at IS NOT NULL THEN 'paid' ELSE status END
             )
             ELSE status
           END,
           pre_dispute_status = NULL,
           dispute_event = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(eventType, now, fixRequest.id)
      .run();
    await updateFixRequestPaymentRecord(env, payment, "paid", now, eventType);
    const restored = await fixRequestById(env, fixRequest.id);
    await logFixRequestEvent(env, {
      fixRequestId: fixRequest.id,
      event: "dispute_resolved",
      actorType: "dodo",
      fromStatus: fixRequest.status || "new",
      toStatus: restored?.status || fixRequest.status || "new",
      reason: eventType,
      detail: { webhookId, paymentId: payment.paymentId }
    });
    return { ok: true, status: "processed", disputeResolved: true, fixRequestId: fixRequest.id };
  }

  return { ok: true, ignored: true, status: "ignored", reason: "unsupported_event", fixRequestId: fixRequest.id };
}

function expectedAmountIssue(fixRequest = {}, payment = {}) {
  const expectedAmount = Number(fixRequest.expected_amount || 0);
  const expectedCurrency = normalizeCurrencyCode(fixRequest.expected_currency || "");
  if (!expectedAmount || !expectedCurrency) return "";
  const currency = normalizeCurrencyCode(payment.currency || "");
  if (currency !== expectedCurrency) {
    return `paid ${payment.amount} ${currency || "?"}, checkout expected ${expectedAmount} ${expectedCurrency}`;
  }
  if (Number(payment.amount || 0) < expectedAmount * MIN_EXPECTED_AMOUNT_RATIO) {
    return `paid ${payment.amount} ${currency}, under half of the expected ${expectedAmount} ${expectedCurrency}`;
  }
  return "";
}

function isPartialRefund(fixRequest = {}, payment = {}) {
  if (payment.isPartialRefund) return true;
  const paid = Number(fixRequest.payment_amount || 0);
  const refunded = Number(payment.amount || 0);
  if (!paid || !refunded || refunded >= paid) return false;
  const paidCurrency = normalizeCurrencyCode(fixRequest.payment_currency || "");
  const refundCurrency = normalizeCurrencyCode(payment.currency || "");
  return !paidCurrency || !refundCurrency || paidCurrency === refundCurrency;
}

async function recordFixRequestPayment(env, { fixRequestId, payment, role, webhookId, now }) {
  if (!payment.paymentId) return;
  await env.WAITLIST_DB.prepare(
    `INSERT OR IGNORE INTO fix_request_payments
      (payment_id, fix_request_id, role, status, checkout_session_id, amount, currency, webhook_id, created_at, updated_at)
     VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      payment.paymentId,
      fixRequestId,
      role,
      payment.checkoutSessionId || "",
      payment.amount || null,
      payment.currency || "",
      webhookId,
      now,
      now
    )
    .run();
}

async function updateFixRequestPaymentRecord(env, payment, status, now, disputeEvent = "") {
  if (!payment.paymentId) return;
  const refund = status === "refunded" || status === "partially_refunded";
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_request_payments
     SET status = ?,
         refund_id = CASE WHEN ? THEN ? ELSE refund_id END,
         refund_amount = CASE WHEN ? THEN COALESCE(refund_amount, 0) + ? ELSE refund_amount END,
         refund_currency = CASE WHEN ? THEN ? ELSE refund_currency END,
         refunded_at = CASE WHEN ? = 'refunded' THEN COALESCE(refunded_at, ?) ELSE refunded_at END,
         dispute_event = COALESCE(NULLIF(?, ''), dispute_event),
         updated_at = ?
     WHERE payment_id = ?`
  )
    .bind(
      status,
      refund ? 1 : 0,
      payment.refundId || "",
      refund ? 1 : 0,
      payment.amount || 0,
      refund ? 1 : 0,
      payment.currency || "",
      status,
      now,
      disputeEvent,
      now,
      payment.paymentId
    )
    .run();
}

async function fixRequestPaymentRecord(env, paymentId, fixRequestId = "") {
  if (!paymentId) return null;
  try {
    return await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM fix_request_payments
       WHERE payment_id = ?
         AND (? = '' OR fix_request_id = ?)
       LIMIT 1`
    )
      .bind(paymentId, fixRequestId, fixRequestId)
      .first();
  } catch {
    return null;
  }
}

// A second distinct payment for a request that is already paid: keep the original
// payment, record the extra one, and flag it for a refund.
async function recordDuplicatePayment(env, eventType, payment, fixRequest, webhookId, now) {
  await recordFixRequestPayment(env, { fixRequestId: fixRequest.id, payment, role: "duplicate", webhookId, now });
  await logFixRequestEvent(env, {
    fixRequestId: fixRequest.id,
    event: "duplicate_payment",
    actorType: "dodo",
    fromStatus: fixRequest.status || "new",
    toStatus: fixRequest.status || "new",
    reason: "duplicate_payment_needs_refund",
    detail: {
      webhookId,
      eventType,
      paymentId: payment.paymentId,
      originalPaymentId: fixRequest.payment_id,
      checkoutSessionId: payment.checkoutSessionId,
      amount: payment.amount,
      currency: payment.currency
    }
  });
  await replayPendingMoneyEvents(env, payment.paymentId, webhookId);
  const record = await fixRequestPaymentRecord(env, payment.paymentId, fixRequest.id);
  if (record?.status === "refunded") {
    return {
      ok: true,
      status: "processed",
      duplicatePayment: true,
      reason: "duplicate_payment_already_refunded",
      fixRequestId: fixRequest.id
    };
  }
  return {
    ok: false,
    status: "error",
    duplicatePayment: true,
    reason: "duplicate_payment_needs_refund",
    errorText: `duplicate_payment_needs_refund: ${payment.paymentId} (kept ${fixRequest.payment_id})`,
    fixRequestId: fixRequest.id,
    adminAlert: {
      reason: "duplicate_payment_needs_refund",
      fixRequest,
      detail: { paymentId: payment.paymentId, originalPaymentId: fixRequest.payment_id }
    }
  };
}

// Refunds and disputes of an extra payment touch only that payment's record.
async function processDuplicatePaymentMoneyEvent(env, eventType, payment, fixRequest, webhookId, now) {
  let status = "paid";
  if (DODO_REFUND_SUCCESS_EVENTS.has(eventType)) status = payment.isPartialRefund ? "partially_refunded" : "refunded";
  else if (DODO_REFUND_FAILURE_EVENTS.has(eventType)) status = "refund_failed";
  else if (DODO_DISPUTE_EVENTS.has(eventType)) status = "disputed";
  await updateFixRequestPaymentRecord(
    env,
    payment,
    status,
    now,
    DODO_DISPUTE_EVENTS.has(eventType) || DODO_DISPUTE_RESOLVED_EVENTS.has(eventType) ? eventType : ""
  );
  await logFixRequestEvent(env, {
    fixRequestId: fixRequest.id,
    event: `duplicate_payment_${status}`,
    actorType: "dodo",
    fromStatus: fixRequest.status || "new",
    toStatus: fixRequest.status || "new",
    reason: eventType,
    detail: { webhookId, paymentId: payment.paymentId, refundId: payment.refundId, amount: payment.amount }
  });
  return {
    ok: true,
    status: "processed",
    duplicatePayment: true,
    duplicatePaymentStatus: status,
    fixRequestId: fixRequest.id
  };
}

// Refund or dispute webhooks that arrived before their payment were stored as `error`;
// once the payment is recorded, apply them in arrival order.
async function replayPendingMoneyEvents(env, paymentId, currentWebhookId = "") {
  if (!paymentId) return;
  const rows = await env.WAITLIST_DB.prepare(
    `SELECT webhook_id, event_type, payload_json
     FROM dodo_webhook_events
     WHERE payment_id = ?
       AND status = 'error'
       AND webhook_id != ?
       AND (event_type LIKE 'refund.%' OR event_type LIKE 'dispute.%')
     ORDER BY first_received_at, webhook_id`
  )
    .bind(paymentId, currentWebhookId)
    .all();
  for (const row of rows.results || []) {
    const event = parseJson(row.payload_json, null);
    if (!event?.data) continue;
    const pending = extractDodoPayment(event.data);
    const result = await processDodoPaymentWebhook(env, row.event_type, pending, row.webhook_id);
    if (result.status === "processed") {
      await markDodoWebhookProcessed(env, row.webhook_id, "processed", "", result.fixRequestId || "");
    }
  }
}

async function processDodoSubscriptionWebhook(env, eventType, subscription, webhookId = "") {
  if (!subscription?.subscriptionId) {
    return { ok: false, ignored: true, status: "ignored", reason: "missing_subscription_id" };
  }

  const identity = dodoSubscriptionIdentityStatus(env, eventType, subscription);
  if (!identity.ok) {
    if (shouldRevokeMonitoringOnProductIdentityFailure(identity.reason)) {
      const ownerEmail =
        identity.ownerEmail || normalizeEmail(subscription.metadataOwnerEmail || subscription.customerEmail || "");
      if (ownerEmail) {
        const now = new Date().toISOString();
        const result = await revokeMonitoringEntitlement(env, subscription, ownerEmail, identity.reason, now);
        await logOfferEntitlementEvent(env, {
          ownerEmail,
          entitlementId: result.entitlementId || "",
          event: "subscription_product_identity_rejected",
          fromStatus: result.fromStatus || "",
          toStatus: result.toStatus || identity.reason,
          detail: { eventType, webhookId, reason: identity.reason, subscriptionId: subscription.subscriptionId || "" }
        });
        return {
          ok: true,
          status: "processed",
          ignored: true,
          reason: identity.reason,
          offerKey: OFFER_KEYS.MONITORING,
          entitlementId: result.entitlementId || "",
          entitlementStatus: result.toStatus || identity.reason
        };
      }
    }
    await logOfferEntitlementEvent(env, {
      ownerEmail: identity.ownerEmail || subscription.metadataOwnerEmail || subscription.customerEmail || "",
      entitlementId: "",
      event: "subscription_identity_rejected",
      fromStatus: "",
      toStatus: "ignored",
      detail: { eventType, webhookId, reason: identity.reason, subscriptionId: subscription.subscriptionId || "" }
    });
    return { ok: false, ignored: true, status: "ignored", reason: identity.reason };
  }

  const now = new Date().toISOString();
  const nextStatus = monitoringSubscriptionNextStatus(eventType, subscription.status);
  if (nextStatus === "unchanged") {
    await logOfferEntitlementEvent(env, {
      ownerEmail: identity.ownerEmail,
      entitlementId: "",
      event: "subscription_unchanged",
      fromStatus: "",
      toStatus: "unchanged",
      detail: {
        eventType,
        webhookId,
        subscriptionId: subscription.subscriptionId || "",
        subscriptionStatus: subscription.status || ""
      }
    });
    return {
      ok: true,
      status: "processed",
      ignored: true,
      reason: subscription.status ? `subscription_${subscription.status}` : "subscription_status_missing",
      offerKey: OFFER_KEYS.MONITORING
    };
  }
  const result =
    nextStatus === "active"
      ? await upsertMonitoringEntitlement(env, subscription, identity.ownerEmail, now)
      : await revokeMonitoringEntitlement(env, subscription, identity.ownerEmail, nextStatus, now);

  await logOfferEntitlementEvent(env, {
    ownerEmail: identity.ownerEmail,
    entitlementId: result.entitlementId || "",
    event: result.ignored
      ? "subscription_ignored"
      : nextStatus === "active"
        ? "subscription_active"
        : "subscription_inactive",
    fromStatus: result.fromStatus || "",
    toStatus: result.toStatus || nextStatus,
    detail: {
      eventType,
      webhookId,
      subscriptionId: subscription.subscriptionId || "",
      productId: dodoMonitoringProductId(env),
      targetHost: subscription.metadataTargetHost || "",
      subscriptionStatus: subscription.status || ""
    }
  });

  if (result.reason === "active_entitlement_exists") {
    // A second subscription went live while one is active: the customer is billed twice.
    return {
      ok: false,
      status: "error",
      ignored: true,
      reason: "duplicate_subscription_needs_cancel",
      errorText: `duplicate_subscription_needs_cancel: ${subscription.subscriptionId} (active ${result.activeSubscriptionId || "?"})`,
      offerKey: OFFER_KEYS.MONITORING,
      entitlementId: result.entitlementId || "",
      entitlementStatus: result.toStatus || "active",
      adminAlert: {
        reason: "duplicate_subscription_needs_cancel",
        ownerEmail: identity.ownerEmail,
        detail: { subscriptionId: subscription.subscriptionId, activeSubscriptionId: result.activeSubscriptionId || "" }
      }
    };
  }

  return {
    ok: true,
    status: "processed",
    ignored: Boolean(result.ignored),
    reason: result.reason || "",
    offerKey: OFFER_KEYS.MONITORING,
    entitlementId: result.entitlementId || "",
    entitlementStatus: result.toStatus || nextStatus
  };
}

function shouldRevokeMonitoringOnProductIdentityFailure(reason = "") {
  return new Set(["product_mismatch", "missing_product_cart", "product_quantity_mismatch"]).has(reason);
}

function dodoSubscriptionIdentityStatus(env, eventType, subscription = {}) {
  const ownerEmail = normalizeEmail(subscription.metadataOwnerEmail || subscription.customerEmail || "");
  if (!ownerEmail) return { ok: false, reason: "missing_owner_email", ownerEmail: "" };
  if (subscription.metadataProductKey !== MONITORING_OFFER.productKey) {
    return {
      ok: false,
      reason: subscription.metadataProductKey ? "product_key_mismatch" : "missing_product_key",
      ownerEmail
    };
  }
  if (subscription.metadataOfferKey && subscription.metadataOfferKey !== OFFER_KEYS.MONITORING) {
    return { ok: false, reason: "offer_key_mismatch", ownerEmail };
  }
  const expectedProductId = dodoMonitoringProductId(env);
  if (!expectedProductId) return { ok: false, reason: "monitoring_product_not_configured", ownerEmail };
  if (!dodoProductMatches(subscription, expectedProductId)) {
    return {
      ok: false,
      reason: subscription.productIds.length ? "product_mismatch" : "missing_product_cart",
      ownerEmail
    };
  }
  if (subscription.productQuantity && subscription.productQuantity !== 1) {
    return { ok: false, reason: "product_quantity_mismatch", ownerEmail };
  }
  const expectedBrandId = dodoBrandId(env);
  if (expectedBrandId && subscription.brandId !== expectedBrandId) {
    return { ok: false, reason: "brand_mismatch", ownerEmail };
  }
  const expectedBusinessId = String(env.DODO_SEOFIXKIT_BUSINESS_ID || "");
  if (expectedBusinessId && subscription.businessId !== expectedBusinessId) {
    return { ok: false, reason: "business_mismatch", ownerEmail };
  }
  if (!DODO_SUBSCRIPTION_EVENTS.has(eventType)) {
    return { ok: false, reason: "unsupported_subscription_event", ownerEmail };
  }
  return { ok: true, ownerEmail };
}

function monitoringSubscriptionNextStatus(eventType, subscriptionStatus = "") {
  const inactiveStatuses = new Set(["cancelled", "canceled", "failed", "expired", "on_hold", "paused"]);
  const status = String(subscriptionStatus || "").toLowerCase();
  if (DODO_SUBSCRIPTION_INACTIVE_EVENTS.has(eventType) || inactiveStatuses.has(status)) {
    return status && inactiveStatuses.has(status) ? status : "inactive";
  }
  if (eventType === "subscription.updated" || eventType === "subscription.plan_changed") {
    return status === "active" ? "active" : "unchanged";
  }
  if (DODO_SUBSCRIPTION_ACTIVE_EVENTS.has(eventType)) return "active";
  return "unchanged";
}

async function upsertMonitoringEntitlement(env, subscription, ownerEmail, now) {
  const existing = await findMonitoringEntitlement(env, ownerEmail, subscription.subscriptionId, {
    subscriptionFirst: true,
    subscriptionOnly: true
  });
  const limits = {
    monitoredSites: 1,
    cadenceDays: 7
  };
  if (existing?.id) {
    if (existing.revoked_at && !recoverableMonitoringStatus(existing.status)) {
      return {
        entitlementId: existing.id,
        fromStatus: existing.status || "",
        toStatus: existing.status || "inactive",
        ignored: true,
        reason: "subscription_previously_revoked"
      };
    }
    await env.WAITLIST_DB.prepare(
      `UPDATE offer_entitlements
       SET status = 'active',
           source = 'dodo_subscription',
           provider = 'dodo',
           product_id = ?,
           subscription_id = ?,
           limits_json = ?,
           current_period_start = ?,
           current_period_end = ?,
           revoked_at = NULL,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        dodoMonitoringProductId(env),
        subscription.subscriptionId || existing.subscription_id || "",
        JSON.stringify(limits),
        subscription.currentPeriodStart || "",
        subscription.currentPeriodEnd || "",
        now,
        existing.id
      )
      .run();
    return { entitlementId: existing.id, fromStatus: existing.status || "", toStatus: "active" };
  }

  const active = await findMonitoringEntitlement(env, ownerEmail);
  if (active?.id) {
    if (active.subscription_id && active.subscription_id !== subscription.subscriptionId) {
      return {
        entitlementId: active.id,
        fromStatus: active.status || "",
        toStatus: active.status || "active",
        ignored: true,
        reason: "active_entitlement_exists",
        activeSubscriptionId: active.subscription_id
      };
    }
    await env.WAITLIST_DB.prepare(
      `UPDATE offer_entitlements
       SET status = 'active',
           source = 'dodo_subscription',
           provider = 'dodo',
           product_id = ?,
           subscription_id = ?,
           limits_json = ?,
           current_period_start = ?,
           current_period_end = ?,
           revoked_at = NULL,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        dodoMonitoringProductId(env),
        subscription.subscriptionId,
        JSON.stringify(limits),
        subscription.currentPeriodStart || "",
        subscription.currentPeriodEnd || "",
        now,
        active.id
      )
      .run();
    return { entitlementId: active.id, fromStatus: active.status || "", toStatus: "active" };
  }

  const id = crypto.randomUUID();
  await env.WAITLIST_DB.prepare(
    `INSERT INTO offer_entitlements
      (id, owner_email, offer_key, status, source, provider, product_id, subscription_id, limits_json,
       current_period_start, current_period_end, created_at, updated_at, revoked_at)
     VALUES (?, ?, ?, 'active', 'dodo_subscription', 'dodo', ?, ?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(
      id,
      ownerEmail,
      OFFER_KEYS.MONITORING,
      dodoMonitoringProductId(env),
      subscription.subscriptionId || "",
      JSON.stringify(limits),
      subscription.currentPeriodStart || "",
      subscription.currentPeriodEnd || "",
      now,
      now
    )
    .run();
  return { entitlementId: id, fromStatus: "", toStatus: "active" };
}

function recoverableMonitoringStatus(status = "") {
  return new Set(["failed", "on_hold", "paused"]).has(String(status || "").toLowerCase());
}

async function revokeMonitoringEntitlement(env, subscription, ownerEmail, nextStatus, now) {
  const existing = await findMonitoringEntitlement(env, ownerEmail, subscription.subscriptionId, {
    subscriptionFirst: true,
    requireSubscriptionMatch: Boolean(subscription.subscriptionId)
  });
  if (!existing?.id) {
    return { entitlementId: "", fromStatus: "", toStatus: nextStatus || "inactive" };
  }
  await env.WAITLIST_DB.prepare(
    `UPDATE offer_entitlements
     SET status = ?,
         revoked_at = COALESCE(revoked_at, ?),
         current_period_end = COALESCE(NULLIF(?, ''), current_period_end),
         updated_at = ?
     WHERE id = ?`
  )
    .bind(nextStatus || "inactive", now, subscription.currentPeriodEnd || "", now, existing.id)
    .run();
  return { entitlementId: existing.id, fromStatus: existing.status || "", toStatus: nextStatus || "inactive" };
}

async function findMonitoringEntitlement(env, ownerEmail, subscriptionId = "", options = {}) {
  if (options.subscriptionFirst && subscriptionId) {
    const bySubscription = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM offer_entitlements
       WHERE provider = 'dodo'
         AND subscription_id = ?
         AND offer_key = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
      .bind(subscriptionId, OFFER_KEYS.MONITORING)
      .first();
    if (bySubscription?.id && bySubscription.owner_email === ownerEmail) return bySubscription;
    if (options.requireSubscriptionMatch || options.subscriptionOnly) return null;
  }
  const active = await env.WAITLIST_DB.prepare(
    `SELECT *
     FROM offer_entitlements
     WHERE owner_email = ?
       AND offer_key = ?
       AND revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(ownerEmail, OFFER_KEYS.MONITORING)
    .first();
  if (active?.id) return active;
  if (subscriptionId) {
    const bySubscription = await env.WAITLIST_DB.prepare(
      `SELECT *
       FROM offer_entitlements
       WHERE provider = 'dodo'
         AND subscription_id = ?
         AND offer_key = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    )
      .bind(subscriptionId, OFFER_KEYS.MONITORING)
      .first();
    if (bySubscription?.id && bySubscription.owner_email === ownerEmail) return bySubscription;
  }
  return null;
}

async function logOfferEntitlementEvent(
  env,
  { entitlementId = "", ownerEmail, event, fromStatus = "", toStatus = "", detail = {} }
) {
  if (!env.WAITLIST_DB || !ownerEmail || !event) return;
  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO offer_entitlement_events
        (id, entitlement_id, owner_email, offer_key, event, from_status, to_status, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        entitlementId,
        ownerEmail,
        OFFER_KEYS.MONITORING,
        cleanText(event, 80),
        cleanText(fromStatus, 40),
        cleanText(toStatus, 40),
        JSON.stringify(detail || {}).slice(0, 4000),
        new Date().toISOString()
      )
      .run();
  } catch {}
}

async function findFixRequestForPayment(env, payment) {
  if (payment.metadataFixRequestId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE id = ? LIMIT 1")
      .bind(payment.metadataFixRequestId)
      .first();
    if (row?.id) return row;
  }
  if (payment.checkoutSessionId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE checkout_session_id = ? LIMIT 1")
      .bind(payment.checkoutSessionId)
      .first();
    if (row?.id) return row;
  }
  if (payment.paymentId) {
    const row = await env.WAITLIST_DB.prepare("SELECT * FROM fix_requests WHERE payment_id = ? LIMIT 1")
      .bind(payment.paymentId)
      .first();
    if (row?.id) return row;
    // Extra payments recorded against a request (refunds and disputes of them must still match).
    const record = await fixRequestPaymentRecord(env, payment.paymentId);
    if (record?.fix_request_id) return fixRequestById(env, record.fix_request_id);
  }
  return null;
}

async function dodoPaymentIdentityStatus(env, eventType, payment, fixRequest) {
  if (isRefundOrDisputeEvent(eventType)) {
    if (payment.paymentId && fixRequest.payment_id && payment.paymentId === fixRequest.payment_id) {
      return { ok: true, paymentRole: "primary" };
    }
    const record = await fixRequestPaymentRecord(env, payment.paymentId, fixRequest.id);
    if (record?.payment_id) return { ok: true, paymentRole: record.role === "primary" ? "primary" : "duplicate" };
    return { ok: false, reason: "payment_id_mismatch" };
  }

  const expectedPaymentProduct = dodoPaymentProductForKey(env, payment.metadataProductKey);
  if (!expectedPaymentProduct.productId) {
    return { ok: false, reason: payment.metadataProductKey ? "product_key_mismatch" : "missing_product_key" };
  }
  if (!dodoProductMatches(payment, expectedPaymentProduct.productId)) {
    return { ok: false, reason: payment.productIds.length ? "product_mismatch" : "missing_product_cart" };
  }
  if (fixRequest.product_id && fixRequest.product_id !== expectedPaymentProduct.productId) {
    return { ok: false, reason: "checkout_product_mismatch" };
  }
  if (payment.productQuantity !== 1) {
    return { ok: false, reason: "product_quantity_mismatch" };
  }
  const expectedBrandId = dodoBrandId(env);
  if (expectedBrandId && payment.brandId !== expectedBrandId) {
    return { ok: false, reason: payment.brandId ? "brand_mismatch" : "missing_brand_id" };
  }
  const expectedBusinessId = String(env.DODO_SEOFIXKIT_BUSINESS_ID || "");
  if (expectedBusinessId && payment.businessId !== expectedBusinessId) {
    return { ok: false, reason: payment.businessId ? "business_mismatch" : "missing_business_id" };
  }
  if (payment.metadataReportId && payment.metadataReportId !== fixRequest.report_id) {
    return { ok: false, reason: "report_id_mismatch" };
  }
  let checkoutSessionState = "current";
  if (
    fixRequest.checkout_session_id &&
    payment.checkoutSessionId &&
    payment.checkoutSessionId !== fixRequest.checkout_session_id
  ) {
    if (payment.metadataFixRequestId !== fixRequest.id || payment.metadataReportId !== fixRequest.report_id) {
      return { ok: false, reason: "checkout_session_mismatch" };
    }
    checkoutSessionState = "superseded";
  }
  let repairTargetState = null;
  const sprintTarget = checkoutRepairSprintTargetFromJson(fixRequest.checkout_repair_json || "");
  const repairTarget = sprintTarget ? null : checkoutRepairTargetFromJson(fixRequest.checkout_repair_json || "");
  if (sprintTarget) {
    if (expectedPaymentProduct.offerKey !== OFFER_KEYS.REPAIR_SPRINT) {
      return { ok: false, reason: "checkout_offer_mismatch" };
    }
    const nextRepairTargetState = await checkoutRepairSprintFulfillmentState(env, fixRequest, sprintTarget);
    if (!nextRepairTargetState.ok) return nextRepairTargetState;
    repairTargetState = nextRepairTargetState;
  } else if (repairTarget) {
    if (expectedPaymentProduct.offerKey !== OFFER_KEYS.FIX_PACK) {
      return { ok: false, reason: "checkout_offer_mismatch" };
    }
    if (cleanText(payment.metadataRepairQueueItemId || "", 160) !== repairTarget.queueItemId) {
      return { ok: false, reason: "repair_target_mismatch" };
    }
    if (cleanText(payment.metadataRepairIssueId || "", 160) !== repairTarget.issueId) {
      return { ok: false, reason: "repair_target_mismatch" };
    }
    const nextRepairTargetState = await checkoutRepairTargetFulfillmentState(env, fixRequest, repairTarget);
    if (!nextRepairTargetState.ok) return nextRepairTargetState;
    repairTargetState = nextRepairTargetState;
  } else if (expectedPaymentProduct.offerKey === OFFER_KEYS.REPAIR_SPRINT) {
    return { ok: false, reason: "repair_sprint_checkout_target_missing" };
  }
  if (payment.customerEmail && normalizeEmail(payment.customerEmail) !== fixRequest.owner_email) {
    return { ok: false, reason: "customer_email_mismatch" };
  }
  if (!payment.amount || !payment.currency) {
    return { ok: false, reason: "missing_payment_amount" };
  }
  return {
    ok: true,
    offerKey: expectedPaymentProduct.offerKey,
    checkoutSessionState,
    repairTargetState: repairTargetState?.state || "",
    repairTargetStatus: repairTargetState?.status || ""
  };
}

function dodoPaymentProductForKey(env, productKey = "") {
  if (productKey === FIX_PACK_OFFER.productKey) {
    return {
      offerKey: OFFER_KEYS.FIX_PACK,
      productId: dodoProductId(env)
    };
  }
  if (productKey === REPAIR_SPRINT_OFFER.productKey) {
    return {
      offerKey: OFFER_KEYS.REPAIR_SPRINT,
      productId: dodoRepairSprintProductId(env)
    };
  }
  return { offerKey: "", productId: "" };
}

async function checkoutRepairTargetFulfillmentState(env, fixRequest = {}, repairTarget = {}) {
  if (!repairTarget.queueItemId || !repairTarget.issueId) return { ok: false, reason: "repair_target_mismatch" };
  let row;
  try {
    row = await env.WAITLIST_DB.prepare(
      `SELECT id, issue_id, status
       FROM repair_queue_items
       WHERE id = ?
         AND report_id = ?
         AND owner_email = ?
       LIMIT 1`
    )
      .bind(repairTarget.queueItemId, fixRequest.report_id, fixRequest.owner_email)
      .first();
  } catch (error) {
    if (isRepairTablesMissingError(error)) return { ok: true, state: "unavailable", status: "" };
    throw error;
  }
  if (!row?.id) return { ok: true, state: "missing", status: "" };
  if (row.issue_id !== repairTarget.issueId) return { ok: false, reason: "repair_target_mismatch" };
  const status = cleanQueueStatus(row.status);
  if (["fixed", "ignored"].includes(status)) return { ok: true, state: "closed", status };
  return { ok: true, state: "active", status };
}

async function checkoutRepairSprintFulfillmentState(env, fixRequest = {}, sprintTarget = {}) {
  try {
    const rows = await env.WAITLIST_DB.prepare(
      `SELECT id, issue_id, approval_status, execution_mode
       FROM repair_proposals
       WHERE fix_request_id = ?
         AND report_id = ?
         AND owner_email = ?
       ORDER BY priority ASC, updated_at DESC
       LIMIT 50`
    )
      .bind(fixRequest.id, fixRequest.report_id, fixRequest.owner_email)
      .all();
    const proposals = rows.results || [];
    const approved = proposals.filter(
      (proposal) => proposal.approval_status === "approved" && proposal.execution_mode !== "unsupported"
    );
    const proposalIds = approved
      .map((proposal) => cleanText(proposal.id || "", 160))
      .filter(Boolean)
      .sort();
    if (!approved.length || approved.length < Number(sprintTarget.approved || 0)) {
      return { ok: false, reason: "repair_sprint_approval_missing" };
    }
    if ((sprintTarget.proposalIds || []).some((id) => !proposalIds.includes(id))) {
      return { ok: false, reason: "repair_sprint_approval_mismatch" };
    }
    return { ok: true, state: "active", status: "approved" };
  } catch (error) {
    if (isRepairTablesMissingError(error)) return { ok: true, state: "unavailable", status: "" };
    throw error;
  }
}

async function markDodoWebhookProcessed(env, webhookId, status, error = "", fixRequestId = "") {
  const now = new Date().toISOString();
  await env.WAITLIST_DB.prepare(
    `UPDATE dodo_webhook_events
     SET status = ?, error = ?, fix_request_id = COALESCE(NULLIF(fix_request_id, ''), ?), processed_at = ?, updated_at = ?
     WHERE webhook_id = ?`
  )
    .bind(status, String(error || "").slice(0, 1000), fixRequestId, status === "processed" ? now : "", now, webhookId)
    .run();
}

// Emails the admin about a billing problem that needs a human (refund, cancel, review).
// The webhook row is already `error`, so this is best effort and never throws.
async function notifyAdminBillingAlert(
  env,
  { reason, fixRequest = null, ownerEmail = "", detail = {}, eventType, webhookId }
) {
  const recipientEmail = adminNotificationEmail(env);
  const fixRequestId = fixRequest?.id || "";
  const event = `billing_alert_${cleanText(reason, 60)}`;
  const log = async (status, error = "", providerMessageId = "") => {
    if (!fixRequestId) return;
    await logFixRequestNotification(env, {
      fixRequestId,
      event,
      recipientType: "admin",
      recipientEmail,
      status,
      provider: EMAIL_PROVIDER,
      providerMessageId,
      error
    }).catch(() => {});
  };
  if (!recipientEmail) return log("skipped", "missing_recipient");
  if (!isEmailConfigured(env)) return log("skipped", "missing_email_config");
  const owner = fixRequest?.owner_email || ownerEmail || "";
  const target = fixRequest?.target_host || "";
  const lines = [
    `Billing alert: ${reason}`,
    "",
    `Dodo event: ${eventType} (webhook ${webhookId})`,
    owner ? `Customer: ${owner}` : "",
    target ? `Site: ${target}` : "",
    fixRequestId ? `Fix request: ${fixRequestId}` : "",
    ...Object.entries(detail || {}).map(([key, value]) => `${key}: ${value ?? ""}`),
    "",
    "The webhook is marked error in the admin dashboard. Check Dodo and refund, cancel or reconcile by hand."
  ].filter((line, index, all) => line || all[index - 1]);
  const text = lines.join("\n");
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: `Billing alert: ${reason}${target ? ` for ${target}` : ""}`,
      text,
      html: `<pre style="white-space:pre-wrap">${text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char])}</pre>`,
      tag: "billing-alert"
    });
    await log("sent", "", payload.messageId);
  } catch (error) {
    await log("error", String(error?.message || "Email send failed.").slice(0, 1000));
  }
}

async function notifyPaymentSucceeded(env, fixRequest, payment, options = {}) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const offerKey = options.offerKey || OFFER_KEYS.FIX_PACK;
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackPaymentEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        payment,
        offerKey,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  await env.WAITLIST_DB.prepare(
    `UPDATE fix_requests
     SET last_notification_at = ?,
         notification_error = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(now, errors, now, fixRequest.id)
    .run();
}

async function sendFixPackPaymentEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  payment,
  offerKey = OFFER_KEYS.FIX_PACK,
  recipientType,
  recipientEmail
}) {
  const event = "payment_succeeded";
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildPaymentNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    payment,
    offerKey,
    recipientType
  });
  const tag = offerKey === OFFER_KEYS.REPAIR_SPRINT ? "repair-sprint-payment" : "fix-pack-payment";
  if (shouldSkipOwnedInternalEmail(env, { to: recipientEmail, tag })) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "owned_internal_email"
    });
    return { recipientType, status: "skipped", reason: "owned_internal_email" };
  }
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      preheader: email.preheader,
      tag
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function notifyFixRequestStatus(env, fixRequest, status) {
  const appOrigin = String(env.SEOFIXKIT_APP_ORIGIN || "https://seofixkit.com").replace(/\/+$/, "");
  const report = await reportForNotification(env, fixRequest.report_id);
  const event = status === "delivered" ? "delivery_ready" : "repair_started";
  const beforeAfter = parseJson(fixRequest.before_after_summary_json, null);
  const recipients = [
    { type: "owner", email: normalizeEmail(fixRequest.owner_email) },
    { type: "admin", email: adminNotificationEmail(env) }
  ];
  const results = [];

  for (const recipient of recipients) {
    results.push(
      await sendFixPackStatusEmail({
        env,
        appOrigin,
        fixRequest,
        report,
        status,
        event,
        beforeAfter,
        recipientType: recipient.type,
        recipientEmail: recipient.email
      })
    );
  }

  const now = new Date().toISOString();
  const errors = results
    .filter((result) => result.status !== "sent" && result.status !== "duplicate" && result.error)
    .map((result) => `${result.recipientType}:${result.error}`)
    .join("; ")
    .slice(0, 1000);
  if (status === "delivered") {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET delivery_notified_at = COALESCE(delivery_notified_at, ?),
           delivery_notification_error = ?,
           last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, errors, now, fixRequest.id)
      .run();
  } else {
    await env.WAITLIST_DB.prepare(
      `UPDATE fix_requests
       SET last_notification_at = ?,
           notification_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(now, errors, now, fixRequest.id)
      .run();
  }
}

async function sendFixPackStatusEmail({
  env,
  appOrigin,
  fixRequest,
  report,
  status,
  event,
  beforeAfter,
  recipientType,
  recipientEmail
}) {
  if (await hasSentFixRequestNotification(env, fixRequest.id, event, recipientType)) {
    return { recipientType, status: "duplicate" };
  }
  if (!recipientEmail) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail: "",
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_recipient"
    });
    return { recipientType, status: "skipped", error: "missing_recipient" };
  }

  if (!isEmailConfigured(env)) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "missing_email_config"
    });
    return { recipientType, status: "skipped", error: "missing_email_config" };
  }

  const email = buildStatusNotificationEmail({
    appOrigin,
    fixRequest,
    report,
    status,
    beforeAfter,
    recipientType
  });
  const tag = event === "delivery_ready" ? "fix-pack-delivery" : "fix-pack-status";
  if (shouldSkipOwnedInternalEmail(env, { to: recipientEmail, tag })) {
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "skipped",
      provider: EMAIL_PROVIDER,
      error: "owned_internal_email"
    });
    return { recipientType, status: "skipped", reason: "owned_internal_email" };
  }
  try {
    const payload = await sendWorkerEmail(env, {
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      preheader: email.preheader,
      tag
    });
    const providerMessageId = payload.messageId;
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "sent",
      provider: EMAIL_PROVIDER,
      providerMessageId
    });
    return { recipientType, status: "sent", providerMessageId };
  } catch (error) {
    const message = String(error?.message || "Email send failed.").slice(0, 1000);
    await logFixRequestNotification(env, {
      fixRequestId: fixRequest.id,
      event,
      recipientType,
      recipientEmail,
      status: "error",
      provider: EMAIL_PROVIDER,
      error: message
    });
    return { recipientType, status: "error", error: message };
  }
}

async function hasSentFixRequestNotification(env, fixRequestId, event, recipientType) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT id
     FROM fix_request_notifications
     WHERE fix_request_id = ? AND event = ? AND recipient_type = ?
       AND (status = 'sent' OR (status = 'skipped' AND error = 'owned_internal_email'))
     LIMIT 1`
  )
    .bind(fixRequestId, event, recipientType)
    .first();
  return Boolean(row?.id);
}

async function logFixRequestNotification(
  env,
  { fixRequestId, event, recipientType, recipientEmail, status, provider, providerMessageId = "", error = "" }
) {
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_notifications
      (id, fix_request_id, event, recipient_type, recipient_email, status, provider, provider_message_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      event,
      recipientType,
      recipientEmail,
      status,
      provider,
      providerMessageId,
      error,
      new Date().toISOString()
    )
    .run();
}

async function logFixRequestEvent(
  env,
  { fixRequestId, event, actorType, actorEmail = "", fromStatus = "", toStatus = "", reason = "", detail = {} }
) {
  if (!env.WAITLIST_DB || !fixRequestId) return;
  await env.WAITLIST_DB.prepare(
    `INSERT INTO fix_request_events
      (id, fix_request_id, event, actor_type, actor_email, from_status, to_status, reason, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      fixRequestId,
      cleanText(event, 80),
      cleanText(actorType, 40),
      cleanText(actorEmail, 254),
      cleanText(fromStatus, 40),
      cleanText(toStatus, 40),
      cleanText(reason, 500),
      JSON.stringify(detail || {}).slice(0, 4000),
      new Date().toISOString()
    )
    .run();
}

async function reportForNotification(env, reportId) {
  if (!reportId) return {};
  const row = await env.WAITLIST_DB.prepare("SELECT report_json FROM audit_reports WHERE id = ? LIMIT 1")
    .bind(reportId)
    .first();
  return parseJson(row ? await reportJsonForRow(env, row) : "", {});
}

export {
  CHECKOUT_URL_TTL_HOURS,
  FIX_PACK_DUE_DAYS,
  FIX_PACK_NEXT_UPDATE_DAYS,
  FIX_PACK_OFFER,
  MONITORING_OFFER,
  PAID_LIKE_FIX_REQUEST_STATUSES,
  REBUY_BLOCKED_FIX_REQUEST_STATUSES,
  billingPaymentResponse,
  billingPricingState,
  createDodoFixPackCheckout,
  createDodoMonitoringCheckout,
  dodoConfigMissing,
  dodoPaymentIdentityStatus,
  dodoSubscriptionIdentityStatus,
  fetchDodoJson,
  findFixRequestForPayment,
  findMonitoringEntitlement,
  formatMinorCurrency,
  getBillingSummary,
  getFixPackPricingPreview,
  getOrCreateFixRequest,
  getPublicFixPackPricing,
  handleDodoWebhook,
  hasSentFixRequestNotification,
  isAllowedAdminStatusTransition,
  jsonForStorage,
  logFixRequestEvent,
  logOfferEntitlementEvent,
  logFixRequestNotification,
  markDodoWebhookProcessed,
  minorCurrencyDivisor,
  monitoringCheckoutContext,
  monitoringEntitlementSchemaStatus,
  monitoringSubscriptionNextStatus,
  normalizeCurrencyCode,
  notifyFixRequestStatus,
  notifyPaymentSucceeded,
  numberOrNull,
  objectValue,
  parseDodoPricingPreview,
  previewDodoFixPackPricing,
  processDodoPaymentWebhook,
  processDodoSubscriptionWebhook,
  reportForNotification,
  requestFixPack,
  requestMonitoringCheckout,
  requestRepairSprintCheckout,
  reserveDodoWebhookEvent,
  safeDodoCheckoutUrl,
  sendFixPackPaymentEmail,
  sendFixPackStatusEmail,
  seedRepairProposalsForFixRequest,
  textValue,
  validateFinalReportForFixRequest
};
