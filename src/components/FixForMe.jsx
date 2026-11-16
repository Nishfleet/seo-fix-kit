import { useState } from "react";
import { apiFetch } from "../api.js";
import { FIX_FOR_ME_CONSENT_TEXT } from "../../shared/fix-for-me.js";
import { readOrCreateFunnelKey, sendAccessBeacon } from "../lib/browser.js";

// upstream: https://react.dev/learn/passing-props-to-a-component — "Have it fixed for you" (issue #412): one button at the end of every report; the visitor confirms site and email here in SEO Fix Kit and the Worker puts the request on TinyStudio's queue (`tinystudio-requests`); no price on this screen, the fixed-price offer comes from TinyStudio.
export function FixForMe({ site, reportId = "", prefillEmail = "" }) {
  const [open, setOpen] = useState(false);
  const [siteValue, setSiteValue] = useState(site || "");
  const [email, setEmail] = useState(prefillEmail);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");

  function openForm() {
    setOpen(true);
    sendAccessBeacon("fix_request_clicked", { funnelKey: readOrCreateFunnelKey(), source: "report" });
  }

  async function submit(event) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMessage("");
    try {
      const payload = await apiFetch("/api/fix-for-me", {
        method: "POST",
        body: { site: siteValue, email, reportId }
      });
      setConfirmation(
        payload.confirmation ||
          "Request received. The TinyStudio repair desk will reply to you by email within one business day."
      );
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The request didn’t send. Check the details and try again.");
    }
  }

  if (status === "done") {
    return (
      <section aria-labelledby="fix-for-me-title" className="app-card fix-for-me">
        <h2 id="fix-for-me-title">Request received</h2>
        <p>{confirmation}</p>
        <p className="app-footnote">{FIX_FOR_ME_CONSENT_TEXT}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="fix-for-me-title" className="app-card fix-for-me">
      <h2 id="fix-for-me-title">Don’t want to fix it yourself?</h2>
      {!open ? (
        <>
          <p className="app-card-text">
            Send this report to our repair desk and they take it from here — you never have to find a second website.
          </p>
          <button className="app-button" onClick={openForm} type="button">
            Have it fixed for you
          </button>
        </>
      ) : (
        <form className="fix-for-me-form" onSubmit={submit}>
          <label htmlFor="fix-for-me-site">Site</label>
          <input
            autoComplete="url"
            id="fix-for-me-site"
            onChange={(event) => setSiteValue(event.target.value)}
            required
            type="text"
            value={siteValue}
          />
          <label htmlFor="fix-for-me-email">Email</label>
          <input
            autoComplete="email"
            id="fix-for-me-email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <p className="app-footnote">{FIX_FOR_ME_CONSENT_TEXT}</p>
          <button className="app-button" disabled={status === "sending"} type="submit">
            {status === "sending" ? "Sending…" : "Send my request"}
          </button>
          {message && (
            <p className="app-footnote" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
