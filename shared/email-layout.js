// Shared HTML email shell for every SEO Fix Kit transactional email.
//
// sendWorkerEmail (worker/lib/email.js) wraps each message body in
// emailLayout(), so builders only produce the inner body markup and use
// emailButton() for their primary link. Email clients ignore <style> blocks
// and external CSS unevenly, so everything here is table-based with inline
// styles: a 560px white card with 32px padding on a warm off-white canvas,
// the brand app icon and wordmark, and a footer with the support address.
// The palette matches src/design/tokens.css: near-black ink for the button
// (Linear/Vercel-style) and the deep brand green for links.
import { escapeHtml } from "./html.js";

const SUPPORT_EMAIL = "support@seofixkit.com";
const FONT_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#0b0f0d";
const LINK = "#0f7a56";
const MUTED = "#6b6f6c";

// Solid near-black call-to-action link. The raw URL is repeated underneath as a
// plain-text fallback for clients that strip or block styled links.
export function emailButton(href, label) {
  const url = escapeHtml(href);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 12px">',
    "<tr>",
    `<td style="background:${INK};border-radius:10px">`,
    `<a href="${url}" style="background:${INK};border:1px solid ${INK};border-radius:10px;color:#ffffff;display:inline-block;font-family:${FONT_STACK};font-size:15px;font-weight:600;letter-spacing:-0.01em;line-height:20px;padding:12px 22px;text-decoration:none">${escapeHtml(label)}</a>`,
    "</td>",
    "</tr>",
    "</table>",
    `<p style="color:${MUTED};font-size:12px;line-height:18px;margin:0 0 16px;word-break:break-all">Or paste this link into your browser: ${url}</p>`
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
    `<body style="background:#f5f4ef;margin:0;padding:0;-webkit-text-size-adjust:100%">`,
    preview
      ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>`
      : "",
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4ef">',
    "<tr>",
    '<td align="center" style="padding:40px 12px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">',
    "<tr>",
    `<td style="padding:0 4px 20px;font-family:${FONT_STACK};font-size:16px;font-weight:650;color:${INK};letter-spacing:-0.015em">`,
    `<img src="https://seofixkit.com/brand/app-icon-48.png" width="24" height="24" alt="" style="background:${LINK};border:0;border-radius:6px;display:inline-block;margin-right:10px;vertical-align:-6px">SEO Fix Kit`,
    "</td>",
    "</tr>",
    "<tr>",
    `<td style="background:#ffffff;border:1px solid #e6e4dc;border-radius:14px;padding:32px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:#1f2220">`,
    body,
    "</td>",
    "</tr>",
    "<tr>",
    `<td style="padding:20px 4px 0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${MUTED}">`,
    `SEO fixes you can prove. <a href="https://seofixkit.com" style="color:${LINK};text-decoration:none">seofixkit.com</a><br />`,
    `Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${LINK};text-decoration:none">${SUPPORT_EMAIL}</a>.`,
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
