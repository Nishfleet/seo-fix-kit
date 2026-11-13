import { sendFirstAuditNudges } from "./activation-emails.js";
import { withD1Retry } from "./d1-retry.js";
import { cleanupExpiredRows } from "./db.js";
import { failStaleRunningAuditJobs, resumeStaleQueuedAuditJobs, runDueAuditSchedules } from "../routes/audits.js";
import { sendDailyOpsDigest, sendUrgentOpsAlerts } from "../routes/admin.js";
import { runDueLargeRenderedCrawlWorkers } from "../routes/large-crawls.js";
import { runUptimeChecks } from "./uptime.js";

function scheduledTasks(env) {
  const tasks = [
    ["cleanupExpiredRows", cleanupExpiredRows],
    [
      "auditJobs",
      async (scheduledEnv) => {
        await failStaleRunningAuditJobs(scheduledEnv);
        await resumeStaleQueuedAuditJobs(scheduledEnv, { appOrigin: "https://seofixkit.com" });
      }
    ],
    ["runDueAuditSchedules", runDueAuditSchedules],
    ["runUptimeChecks", runUptimeChecks]
  ];
  tasks.push(
    ["sendFirstAuditNudges", sendFirstAuditNudges],
    ["sendDailyOpsDigest", sendDailyOpsDigest],
    ["sendUrgentOpsAlerts", sendUrgentOpsAlerts]
  );
  if (String(env.SEOFIXKIT_LARGE_CRAWL_WORKERS_ENABLED || "").toLowerCase() === "true") {
    tasks.push(["runDueLargeRenderedCrawlWorkers", runDueLargeRenderedCrawlWorkers]);
  }
  return tasks;
}

async function runScheduledTasks(env, tasks) {
  const scheduledEnv = { ...env, WAITLIST_DB: withD1Retry(env.WAITLIST_DB) };
  const failures = [];
  for (const [name, task] of tasks) {
    try {
      await task(scheduledEnv);
    } catch (error) {
      console.error(`Scheduled task ${name} failed`, error);
      failures.push(name);
    }
  }
  if (failures.length) throw new Error(`Scheduled tasks failed: ${failures.join(", ")}`);
}

export { runScheduledTasks, scheduledTasks };
