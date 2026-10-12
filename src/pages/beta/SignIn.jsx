import { useState } from "react";

// Sign-in screen. The one-use email link is the main way in; an invite code
// is the secondary path for people who were given one.
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
  const busy = status === "submitting";

  async function submit(event) {
    if (useCode) {
      onCodeSubmit(event);
      return;
    }
    event.preventDefault();
    const sent = await onLinkRequest();
    if (sent) setLinkSent(true);
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
              We sent a secure sign-in link to <strong>{email}</strong>.
              {returningToReport ? " It will bring you straight back to this report." : ""} The link works once.
            </p>
            {message && (
              <p className={`form-message ${status}`} role="status">
                {message}
              </p>
            )}
            <button className="text-button accent-text" onClick={() => setLinkSent(false)} type="button">
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 id="beta-title">Sign in to SEO Fix Kit</h1>
            <p className="signin-lead">
              {returningToReport
                ? "Sign in to open this report."
                : "New here? Enter your email and we’ll create your free account."}
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
                {busy ? "One moment…" : useCode ? "Sign in" : "Email me a sign-in link"}
              </button>
              <p className={`form-message ${status}`} aria-live="polite">
                {message || (useCode ? "" : "No password needed. We’ll email you a link that signs you in.")}
              </p>
            </form>
            <div className="signin-alt">
              <button className="text-button accent-text" onClick={() => setUseCode((value) => !value)} type="button">
                {useCode ? "Email me a link instead" : "Have an invite code?"}
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
