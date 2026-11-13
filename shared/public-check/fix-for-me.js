// upstream: https://vitejs.dev/guide/build — the "Have it fixed for you" block on the free one-page check result (issue #412): vanilla DOM because the check page is Worker-rendered and loads one bundled script (/check.js); the browser calls only /api/fix-for-me, and the Worker puts the request on TinyStudio's queue (`tinystudio-requests`).
import { FIX_FOR_ME_CONSENT_TEXT } from "../fix-for-me.js";

const DEFAULT_CONFIRMATION =
  "Request received. We are handing your report to the TinyStudio repair desk — they will reply to you by email within one business day.";

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function sendClickBeacon() {
  try {
    const body = JSON.stringify({ step: "fix_request_clicked", source: "public-check" });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/access/track", blob);
    else
      fetch("/api/access/track", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true
      }).catch(() => {});
  } catch {
    console.warn("Fix-for-me click beacon skipped so it never blocks the request itself");
  }
}

/** @returns {HTMLElement} the block to append to the check result card */
export function fixForMeBlock(checkedUrl) {
  const section = el("section", "", "fix-for-me");
  section.appendChild(el("h3", "Don’t want to fix it yourself?"));
  const description = el("p", "Send this check to our repair desk and they take it from here.");
  section.appendChild(description);

  let form = null;
  const open = el("button", "Have it fixed for you", "btn btn-primary");
  open.type = "button";
  open.addEventListener("click", () => {
    sendClickBeacon();
    form.hidden = false;
    open.disabled = true;
    description.hidden = true;
    form.querySelector("input")?.focus();
  });
  section.appendChild(open);

  form = el("form", "", "fix-for-me-form");
  form.noValidate = true;

  const siteLabel = el("label", "Site");
  siteLabel.htmlFor = "fix-for-me-site";
  const siteInput = el("input", "", "field");
  siteInput.id = "fix-for-me-site";
  siteInput.type = "text";
  siteInput.autocomplete = "url";
  siteInput.value = checkedUrl || "";
  siteInput.required = true;

  const emailLabel = el("label", "Email");
  emailLabel.htmlFor = "fix-for-me-email";
  const emailInput = el("input", "", "field");
  emailInput.id = "fix-for-me-email";
  emailInput.type = "email";
  emailInput.autocomplete = "email";
  emailInput.required = true;

  const consent = el("p", FIX_FOR_ME_CONSENT_TEXT, "fix-for-me-consent");
  const submit = el("button", "Send my request", "btn btn-primary");
  submit.type = "submit";

  const note = el("p", "", "fix-for-me-note");
  note.setAttribute("role", "alert");

  form.append(siteLabel, siteInput, emailLabel, emailInput, consent, submit, note);
  form.hidden = true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const site = siteInput.value.trim();
    const email = emailInput.value.trim();
    if (!site || !email) {
      note.textContent = "Enter your site address and email so the repair desk can reply.";
      return;
    }
    submit.disabled = true;
    note.textContent = "Sending…";
    try {
      const response = await fetch("/api/fix-for-me", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site, email, reportId: "" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        note.textContent = payload.error || "The request didn’t send. Check the details and try again.";
        submit.disabled = false;
        return;
      }
      const confirmation = el("div", "", "fix-for-me-confirmation");
      confirmation.setAttribute("aria-live", "polite");
      confirmation.appendChild(el("h3", "Request received"));
      confirmation.appendChild(el("p", payload.confirmation || DEFAULT_CONFIRMATION));
      confirmation.appendChild(
        el("p", "Your email is used for this request only — never for a marketing list.", "fix-for-me-consent")
      );
      section.replaceChildren(confirmation);
    } catch {
      note.textContent = "Could not reach the request service. Check your connection and try again.";
      submit.disabled = false;
    }
  });

  section.appendChild(form);
  return section;
}
