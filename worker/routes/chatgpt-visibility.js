import {
  CHATGPT_VISIBILITY_QUESTION_COUNT,
  buildChatgptVisibilityReport,
  chatgptVisibilityReportMarkdown,
  deriveBuyerQuestions,
  fetchChatgptLlmScraper,
  summarizeChatgptVisibilityTask
} from "../../shared/chatgpt-visibility.js";
import { auditAuthorizationStatus, betaAccessResponse, betaAccessStatus } from "../lib/auth.js";
import { jsonNoStore } from "../lib/http.js";
import { claimHostFromInput } from "../lib/text.js";
import { body, parseJsonBody, text } from "../lib/validation.js";

export const CHATGPT_VISIBILITY_API_PATH = "/api/chatgpt-visibility";

const ChatgptVisibilityBody = body({
  host: text(253),
  brand: text(120),
  title: text(300),
  description: text(600)
});

function reportResponse(report, cached) {
  return jsonNoStore({ ok: true, cached, report, markdown: chatgptVisibilityReportMarkdown(report) });
}

async function storedRun(env, ownerEmail, host) {
  const row = await env.WAITLIST_DB.prepare(
    `SELECT report_json, created_at FROM chatgpt_visibility_runs WHERE owner_email = ? AND host = ? LIMIT 1`
  )
    .bind(ownerEmail, host)
    .first();
  if (!row?.report_json || row.report_json === PENDING) return null;
  return { report: JSON.parse(row.report_json), createdAt: row.created_at };
}

const PENDING = '{"pending":true}';
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

async function claimSlot(env, ownerEmail, host) {
  const id = crypto.randomUUID();
  const insert = () =>
    env.WAITLIST_DB.prepare(
      `INSERT INTO chatgpt_visibility_runs
        (id, owner_email, host, brand, question_count, cost_usd, report_json, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
    )
      .bind(id, ownerEmail, host, host, PENDING, new Date().toISOString())
      .run();
  try {
    await insert();
    return id;
  } catch (error) {
    if (!/UNIQUE/i.test(String(error?.message))) throw error;
  }
  // A claim left behind by a crashed run expires, so it cannot block the owner for good.
  const stale = new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString();
  await env.WAITLIST_DB.prepare(
    `DELETE FROM chatgpt_visibility_runs WHERE owner_email = ? AND host = ? AND report_json = ? AND created_at < ?`
  )
    .bind(ownerEmail, host, PENDING, stale)
    .run();
  try {
    await insert();
    return id;
  } catch (error) {
    if (!/UNIQUE/i.test(String(error?.message))) throw error;
    return null;
  }
}

async function releaseSlot(env, ownerEmail, host) {
  await env.WAITLIST_DB.prepare(
    `DELETE FROM chatgpt_visibility_runs WHERE owner_email = ? AND host = ? AND report_json = ?`
  )
    .bind(ownerEmail, host, PENDING)
    .run();
}

export async function runChatgptVisibility(request, env) {
  const access = await betaAccessStatus(request, env);
  if (!access.ok) return betaAccessResponse(access);
  if (!env.WAITLIST_DB)
    return jsonNoStore(
      { error: "Report storage is not set up on this server. Email support@seofixkit.com for help." },
      503
    );
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return jsonNoStore(
      {
        error:
          "The ChatGPT visibility check is not switched on yet. The site owner must add the DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD secrets before any report can run."
      },
      503
    );
  }

  const parsed = await parseJsonBody(request, ChatgptVisibilityBody);
  if (parsed.error) return jsonNoStore(parsed.error, 400);
  const host = claimHostFromInput(parsed.data.host);
  if (!host) return jsonNoStore({ error: "Enter the domain to check, like example.com." }, 400);

  const authorization = await auditAuthorizationStatus(env, access, `https://${host}`);
  if (!authorization.ok) {
    return jsonNoStore(
      { error: authorization.error, code: authorization.code, site: authorization.site },
      authorization.status
    );
  }

  const existing = await storedRun(env, access.ownerEmail, host);
  if (existing) return reportResponse(existing.report, true);

  // Claim the (owner, host) slot before any paid call, so concurrent first requests cannot each spend five calls.
  const claimed = await claimSlot(env, access.ownerEmail, host);
  if (!claimed) {
    return jsonNoStore({ error: "A report for this site is already running. Try again in a minute." }, 409);
  }

  const brand = parsed.data.brand || parsed.data.title || host;
  let report;
  try {
    const questions = deriveBuyerQuestions({ brand, title: parsed.data.title, description: parsed.data.description });
    // Run all calls together; a failed call becomes an unavailable answer and does not discard the paid ones.
    const settled = await Promise.allSettled(
      questions.slice(0, CHATGPT_VISIBILITY_QUESTION_COUNT).map((question) =>
        fetchChatgptLlmScraper({
          keyword: question,
          login: env.DATAFORSEO_LOGIN,
          password: env.DATAFORSEO_PASSWORD
        }).then((payload) => summarizeChatgptVisibilityTask({ brand, host, question, payload }))
          .catch((error) =>
            summarizeChatgptVisibilityTask({
              brand,
              host,
              question,
              payload: { tasks: [{ status_message: String(error?.message || "request failed").slice(0, 200) }] }
            })
          )
      )
    );
    report = buildChatgptVisibilityReport({ brand, host, results: settled.map((entry) => entry.value) });
  } catch (error) {
    await releaseSlot(env, access.ownerEmail, host);
    throw error;
  }

  if (report.unavailableQuestions === report.questionCount) {
    await releaseSlot(env, access.ownerEmail, host);
    return jsonNoStore(
      { error: "ChatGPT answers are unavailable right now, so no report was made and your free report is not used. Try again later." },
      502
    );
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE chatgpt_visibility_runs SET brand = ?, question_count = ?, cost_usd = ?, report_json = ?, created_at = ?
     WHERE owner_email = ? AND host = ? AND id = ?`
  )
    .bind(
      report.brand,
      report.questionCount,
      report.totalCost,
      JSON.stringify(report),
      new Date().toISOString(),
      access.ownerEmail,
      host,
      claimed
    )
    .run();
  return reportResponse(report, false);
}
