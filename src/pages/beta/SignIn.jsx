import { useEffect, useState } from "react";
import { inboxFor } from "../../lib/inbox.js";

const RESEND_WAIT_SECONDS = 30;

export function SignIn({
  email,
  inviteCode,
  message,
  onCodeSubmit,
  onEmailChange,
  onInviteCodeChange,
  onLinkRequest,
  returningToReport = false,
  status
}) {
  const [useCode, setUseCode] = useState(() => Boolean(inviteCode));
  const [linkSent, setLinkSent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resent, setResent] = useState(false);
  const busy = status === "submitting";
  const inbox = inboxFor(email);

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const waiting = resendIn > 0;

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  function startResendWait() {
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_WAIT_SECONDS * 1000);
  }

  async function submit(event) {
    if (useCode) {
      onCodeSubmit(event);
      return;
    }
    event.preventDefault();
    const sent = await onLinkRequest();
    if (sent) {
      setLinkSent(true);
      startResendWait();
    }
  }

  async function resend() {
    const sent = await onLinkRequest();
    if (sent) {
      setResent(true);
      startResendWait();
    }
  }

  return (
    <div className="signin-shell">
      <a className="app-brand signin-brand" href="/">
        SEO Fix Kit
      </a>
      <main className="signin-card" aria-labelledby="beta-title">
        {linkSent ? (
          <div className="signin-sent">
            <h1 id="beta-title">Check your inbox</h1>
            <p>
              We sent a sign-in link to <strong>{email}</strong>.{returningToReport ? " It opens this report." : ""} The
              link works once.
            </p>
            {message && (
              <p className={`form-message ${status}`} role="status">
                {message}
              </p>
            )}
            {inbox && (
              <a className="signin-submit signin-inbox" href={inbox.href} rel="noopener noreferrer" target="_blank">
                {inbox.label}
              </a>
            )}
            <p className="signin-hint" role="status">
              {resent ? "We sent a new link." : "Not there? Check spam, or send it again."}
            </p>
            <div className="signin-sent-actions">
              <button className="text-button accent-text" disabled={busy || waiting} onClick={resend} type="button">
                {busy ? "Sending…" : waiting ? `Resend link in ${resendIn}s` : "Resend link"}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setLinkSent(false);
                  setResent(false);
                }}
                type="button"
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 id="beta-title">Sign in to SEO Fix Kit</h1>
            <p className="signin-lead">
              {returningToReport
                ? "Sign in to open this report."
                : "Enter your email. If you’re new, we’ll create a free account."}
            </p>
            <form className="signin-form" onSubmit={submit}>
              <label htmlFor="beta-email">Email</label>
              <input
                autoComplete="email"
                id="beta-email"
                inputMode="email"
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@company.com"
                required
                type="email"
                value={email}
              />
              {useCode && (
                <>
                  <label htmlFor="beta-password">Invite code</label>
                  <input
                    autoComplete="current-password"
                    id="beta-password"
                    onChange={(event) => onInviteCodeChange(event.target.value)}
                    required
                    type="password"
                    value={inviteCode}
                  />
                </>
              )}
              <button className="signin-submit" disabled={busy} type="submit">
                {busy ? (useCode ? "Signing in…" : "Sending link…") : useCode ? "Sign in" : "Email me a sign-in link"}
              </button>
              <p className={`form-message ${status}`} aria-live="polite">
                {message || (useCode ? "" : "No password needed. The link in the email signs you in.")}
              </p>
            </form>
            <div className="signin-alt">
              <button className="text-button accent-text" onClick={() => setUseCode((value) => !value)} type="button">
                {useCode ? "Email me a link instead" : "Use an invite code"}
              </button>
            </div>
          </>
        )}
      </main>
      <p className="signin-legal">
        By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
      </p>
    </div>
  );
}
