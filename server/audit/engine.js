import { createAuditEngine } from "../../shared/audit-engine.js";
import { launchAuditBrowser } from "./playwright-browser.js";

const engine = createAuditEngine({
  launchBrowser: launchAuditBrowser,
  pagespeedApiKey: process.env.GOOGLE_PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY || "",
  pagespeedDisabled: process.env.SEOFIXKIT_PAGESPEED_DISABLED === "1",
  allowLocalAudits: true
});

export function auditUrl(inputUrl, options = {}) {
  return engine.auditUrl(inputUrl, options);
}
