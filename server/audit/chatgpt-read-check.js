import { auditUrl } from "./engine.js";
import { buildChatgptReadResult } from "../../shared/chatgpt-read/answer-readiness.js";

const DEFAULT_TARGET_URL = process.env.SEOFIXKIT_CHATGPT_READ_URL || "https://seofixkit.com/check";

const targetUrl = process.argv[2] || DEFAULT_TARGET_URL;

const report = await auditUrl(targetUrl, { maxPages: 1, appOrigin: "https://seofixkit.com" });
const result = buildChatgptReadResult(report);

console.log(JSON.stringify(result, null, 2));
