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
  if (!row?.report_json) return null;
  return { report: JSON.parse(row.report_json), createdAt: row.created_at };
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

  const brand = parsed.data.brand || parsed.data.title || host;
  const questions = deriveBuyerQuestions({ brand, title: parsed.data.title, description: parsed.data.description });
  const results = [];
  for (const question of questions.slice(0, CHATGPT_VISIBILITY_QUESTION_COUNT)) {
    const payload = await fetchChatgptLlmScraper({
      keyword: question,
      login: env.DATAFORSEO_LOGIN,
      password: env.DATAFORSEO_PASSWORD
    });
    results.push(summarizeChatgptVisibilityTask({ brand, host, question, payload }));
  }
  const report = buildChatgptVisibilityReport({ brand, host, results });

  try {
    await env.WAITLIST_DB.prepare(
      `INSERT INTO chatgpt_visibility_runs
        (id, owner_email, host, brand, question_count, cost_usd, report_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        access.ownerEmail,
        host,
        report.brand,
        report.questionCount,
        report.totalCost,
        JSON.stringify(report),
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    if (!/UNIQUE/i.test(String(error?.message))) throw error;
    const raced = await storedRun(env, access.ownerEmail, host);
    if (raced) return reportResponse(raced.report, true);
    throw error;
  }
  return reportResponse(report, false);
}
