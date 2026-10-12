// Shared HTML email shell for every SEO Fix Kit transactional email.
//
// sendWorkerEmail (worker/lib/email.js) wraps each message body in
// emailLayout(), so builders only produce the inner body markup and use
// emailButton() for their primary link. Email clients ignore <style> blocks
// and external CSS unevenly, so everything here is table-based with inline
// styles: a 560px white card with 24px padding on a light grey canvas, a
// text logo, and a footer with the support address.
import { escapeHtml } from "./html.js";

const SUPPORT_EMAIL = "support@seofixkit.com";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";

// Solid-colour call-to-action link. The raw URL is repeated underneath as a
// plain-text fallback for clients that strip or block styled links.
export function emailButton(href, label) {
  const url = escapeHtml(href);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px">',
    "<tr>",
    `<td style="background:#0f7a56;border-radius:8px">`,
    `<a href="${url}" style="background:#0f7a56;border-radius:8px;color:#ffffff;display:inline-block;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:20px;padding:12px 20px;text-decoration:none">${escapeHtml(label)}</a>`,
    "</td>",
    "</tr>",
    "</table>",
    `<p style="color:#6b6f6c;font-size:12px;line-height:18px;margin:0 0 16px;word-break:break-all">Or paste this link into your browser: ${url}</p>`
  ].join("");
}

// Full HTML document around a message body. `preheader` is the hidden inbox
// preview line shown next to the subject; it is optional.
export function emailLayout({ preheader = "", body = "" } = {}) {
  const preview = String(preheader || "").trim();
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="color-scheme" content="light" />',
    "<title>SEO Fix Kit</title>",
    "</head>",
    `<body style="background:#f3f2ee;margin:0;padding:0;-webkit-text-size-adjust:100%">`,
    preview
      ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>`
      : "",
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2ee">',
    "<tr>",
    '<td align="center" style="padding:32px 12px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">',
    "<tr>",
    `<td style="padding:0 4px 16px;font-family:${FONT_STACK};font-size:16px;font-weight:700;color:#171714;letter-spacing:-0.01em">`,
    '<span style="background:#0f7a56;border-radius:5px;color:#ffffff;display:inline-block;font-size:11px;font-weight:700;line-height:20px;margin-right:8px;text-align:center;vertical-align:1px;width:20px">&#10003;</span>SEO Fix Kit',
    "</td>",
    "</tr>",
    "<tr>",
    `<td style="background:#ffffff;border:1px solid #e3e1da;border-radius:8px;padding:24px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:#1f2220">`,
    body,
    "</td>",
    "</tr>",
    "<tr>",
    `<td style="padding:16px 4px 0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:#6b6f6c">`,
    `SEO Fix Kit · <a href="https://seofixkit.com" style="color:#0f7a56;text-decoration:none">seofixkit.com</a><br />`,
    `Questions or issues? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#0f7a56;text-decoration:none">${SUPPORT_EMAIL}</a> or reply to this email.`,
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>"
  ].join("");
}
