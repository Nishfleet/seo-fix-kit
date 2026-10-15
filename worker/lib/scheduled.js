import { withD1Retry } from "./d1-retry.js";
import { alreadyReported, reportError } from "./sentry.js";

async function runScheduledTasks(env, tasks) {
  const scheduledEnv = { ...env, WAITLIST_DB: withD1Retry(env.WAITLIST_DB) };
  const failures = [];
  for (const [name, task] of tasks) {
    try {
      await task(scheduledEnv);
    } catch (error) {
      console.error(`Scheduled task ${name} failed`, error);
      reportError(error, { scheduledTask: name });
      failures.push(name);
    }
  }
  // Still thrown so the cron run shows as failed; each task error was already reported above.
  if (failures.length) throw alreadyReported(new Error(`Scheduled tasks failed: ${failures.join(", ")}`));
}

export { runScheduledTasks };
