import { useEffect, useState } from "react";
import { LogoMark } from "../components/LogoMark.jsx";
import { readOrCreateFunnelKey, sendAccessBeacon } from "../lib/browser.js";
import { postAccessRequest } from "../lib/requests.js";

export function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [accessUrl, setAccessUrl] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [funnelKey] = useState(() => readOrCreateFunnelKey());
  const [inputFired, setInputFired] = useState(false);

  useEffect(() => {
    document.title = "SEO Fix Kit - Proof-Backed SEO Repair Beta";
  }, []);

  useEffect(() => {
    sendAccessBeacon("beta_view", {
      funnelKey,
      source: "homepage-access",
      landingPath: window.location.pathname + window.location.search || "/",
      timeOnPageMs: 0
    });
  }, [funnelKey]);

  function handleEmailChange(event) {
    setEmail(event.target.value);
    if (!inputFired && event.target.value) {
      setInputFired(true);
      sendAccessBeacon("beta_input", {
        funnelKey,
        source: "homepage-access",
        landingPath: window.location.pathname + window.location.search || "/",
        timeOnPageMs: Date.now() - formStartedAt
      });
    }
  }

  async function joinWaitlist(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const payload = await postAccessRequest({
        email,
        company,
        source: "homepage-access",
        formStartedAt,
        funnelKey
      });
      setStatus("success");
      setMessage(payload.message || "Check your email for a secure access link.");
      setAccessUrl(payload.accessUrl || "");
      setEmail("");
      setCompany("");
    } catch (error) {
      setStatus("error");
      setAccessUrl("");
      setMessage(error.message || "Could not send the access link.");
    }
  }

  return (
    <main className="waitlist-shell">
      <img
        alt=""
        aria-hidden="true"
        className="hero-art"
        src="/assets/waitlist-hero.jpg"
      />
      <div className="hero-shade" />

      <header className="site-top">
        <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
          <LogoMark />
          <span>SEO Fix Kit</span>
        </a>
        <span className="launch-status">Private beta</span>
      </header>

      <section className="hero-copy" aria-labelledby="page-title">
        <p className="kicker">Private beta</p>
        <h1 id="page-title">SEO Fix Kit</h1>
        <p className="coming-soon">Private beta access.</p>
        <p className="hero-text">
          Evidence-backed SEO audits for site owners and founders are opening by
          secure email link. Join the private beta, run a proof audit, and only
          pay when the report finds repairs worth doing.
        </p>
        <p className="hero-pricing">
          Audits are free in the beta. The paid SEO Fix Pack shows the Dodo checkout
          price before payment — one proof-backed repair pass plus one rerun, only
          offered when real fixes exist.
        </p>
        <nav className="public-proof-links" aria-label="Public proof pages">
          <a href="/demo">Sample proof report</a>
          <a href="/methodology">Methodology and limits</a>
          <a href="/packages">Package ladder</a>
        </nav>

        <div className="access-entry">
          <form className="waitlist-form" onSubmit={joinWaitlist}>
            <label htmlFor="email">Email address</label>
            <div className="email-row">
              <input
                autoComplete="email"
                id="email"
                inputMode="email"
                onChange={handleEmailChange}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
              <button disabled={status === "submitting"} type="submit">
                {status === "submitting" ? "Sending" : "Email access link"}
              </button>
            </div>
            <label className="honeypot" htmlFor="company">
              Company
              <input
                autoComplete="off"
                id="company"
                onChange={(event) => setCompany(event.target.value)}
                tabIndex="-1"
                type="text"
                value={company}
              />
            </label>
            <p className={`form-message ${status}`} aria-live="polite">
              {message || "We’ll only use this email for SEO Fix Kit access and outreach."}
              {accessUrl && (
                <>
                  <br />
                  <a className="inline-link" href={accessUrl}>
                    Open local access link
                  </a>
                </>
              )}
            </p>
          </form>

          <div className="check-entry" aria-label="Anonymous one-page check">
            <p className="check-entry-note">No account, no email</p>
            <a className="check-entry-cta" href="/check">
              Check one page now
            </a>
            <p className="check-entry-note">
              Live rendered proof for one public page. No report or URL is stored.
            </p>
          </div>
        </div>

        <div className="report-preview" aria-label="SEO Fix Kit report preview">
          <div>
            <strong>Issue</strong>
            <span>Static crawler says the homepage has no H1.</span>
          </div>
          <div>
            <strong>Proof</strong>
            <span>Rendered DOM shows the SEO Fix Kit H1 and private-beta access copy.</span>
          </div>
          <div>
            <strong>Fix</strong>
            <span>Do nothing. The finding is a false positive.</span>
          </div>
        </div>
      </section>

      <section className="homepage-proof-band" aria-labelledby="proof-loop-title">
        <div className="proof-band-copy">
          <p className="kicker">Proof-backed repair agent</p>
          <h2 id="proof-loop-title">The audit is useful only if it leads to a safe fix.</h2>
          <p>
            SEO Fix Kit renders the site like a browser, compares the visible page
            with the raw app shell, and keeps false positives out of the repair
            queue. When a real issue is proven, the report keeps the page, source
            evidence, suggested fix, effort, confidence, and acceptance check in one
            place so a founder, teammate, or developer can act without guessing.
          </p>
        </div>
        <div className="proof-step-grid" aria-label="Proof-backed repair steps">
          <article>
            <strong>1. Prove</strong>
            <p>Run a private audit, verify site ownership for deeper crawls, and see rendered proof before paying for repairs.</p>
          </article>
          <article>
            <strong>2. Approve</strong>
            <p>Review the repair queue, ignore noise, approve safe drafts, or start the paid Fix Pack from a report with real fixes.</p>
          </article>
          <article>
            <strong>3. Re-measure</strong>
            <p>After changes ship, rerun the audit. Fresh proof marks repairs fixed, still open, new, or regressed.</p>
          </article>
        </div>
      </section>

      <section className="homepage-faq" aria-labelledby="homepage-faq-title">
        <p className="kicker">Buyer questions</p>
        <h2 id="homepage-faq-title">What can I trust SEO Fix Kit to do today?</h2>
        <div className="faq-grid">
          <article>
            <h3>What happens after I enter a URL?</h3>
            <p>
              Anyone can check one public page now at{" "}
              <a href="/check">/check</a> with no account. After a secure email
              access link you get a rate-limited private audit: a one-page Lite
              check can run before verification, and verified sites unlock deeper
              self-serve crawls, imports, saved reports, monitoring controls, and
              owner-scoped repair queues.
            </p>
          </article>
          <article>
            <h3>What does the paid Fix Pack include?</h3>
            <p>
              The live paid offer is one proof-backed repair pass tied to one saved
              report, plus one rerun after fixes. Dodo shows the checkout price, and
              the support policy covers refund handling if payment succeeds but the
              repair queue cannot start.
            </p>
          </article>
          <article>
            <h3>How is AI or GEO readiness handled?</h3>
            <p>
              AI Answer Readiness is proof-derived from rendered content, schema,
              canonical and internal-link clarity, sitemap context, question-led
              sections, and optional llms.txt boundaries. When Search Console rows
              are imported, those faults are ranked by the clicks and impressions
              on the affected pages. It is not live answer-engine sampling or AI
              citation monitoring.
            </p>
          </article>
          <article>
            <h3>What is not live yet?</h3>
            <p>
              SEO Fix Kit does not auto-publish content, call CMS admin APIs, open
              GitHub pull requests, sell recurring repair-agent subscriptions, or
              guarantee rankings, traffic, indexing, AI citations, or revenue.
            </p>
          </article>
        </div>
      </section>

      <footer className="site-footer">
        <span>Audit it. Prove it. Fix it.</span>
        <a href="/demo">Demo</a>
        <a href="/methodology">Methodology</a>
        <a href="/packages">Packages</a>
        <a href="/support">Support</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>
      </footer>
    </main>
  );
}
