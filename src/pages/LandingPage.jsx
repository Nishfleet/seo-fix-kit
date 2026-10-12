import { useEffect, useState } from "react";
import { readOrCreateFunnelKey, sendAccessBeacon } from "../lib/browser.js";
import { postAccessRequest } from "../lib/requests.js";

const STEPS = [
  {
    title: "Find",
    text: "We open your pages in a real browser, the way Google and your customers see them, and list what is actually broken."
  },
  {
    title: "Fix",
    text: "Each problem comes with the evidence, why it matters, and a ready-to-paste fix your developer can ship."
  },
  {
    title: "Prove",
    text: "After the fix goes live, rerun the audit. Every item is marked fixed, still open, or new, so you know it worked."
  }
];

const FEATURES = [
  {
    title: "No false alarms",
    text: "Most scanners only read raw HTML and flag problems that are not there. We compare it with the real page and drop the noise."
  },
  {
    title: "Ready-to-paste fixes",
    text: "Missing tags, schema, and social previews come with the exact snippet to add, built from your own page."
  },
  {
    title: "A repair queue for your team",
    text: "Assign fixes, add notes, approve changes, and track every item from open to proven fixed."
  },
  {
    title: "Weekly monitoring",
    text: "Verified sites get a weekly rerun, so you hear about a regression early."
  },
  {
    title: "Ready for AI search",
    text: "See whether ChatGPT-style crawlers, which skip JavaScript, can read your content and structure."
  },
  {
    title: "API and webhooks",
    text: "Start audits and pull results from your own tools, and get notified when an audit finishes."
  }
];

const FAQ = [
  {
    q: "What happens after I enter a URL?",
    a: "Anyone can check one public page right now with no account. Sign up with your email to audit your whole site: verify you own it, then run audits of up to 1,000 pages, keep your reports, and work through the repair queue."
  },
  {
    q: "What does the paid Fix Pack include?",
    a: "One repair pass on a saved report with real, proven problems, plus one rerun after the fixes ship to prove they worked. It costs $99 one-time. You only see the offer when a report has something worth fixing."
  },
  {
    q: "How is AI or GEO readiness handled?",
    a: "We check what AI crawlers can read: whether your content is in the raw HTML, whether your schema and structure are clear, and whether you answer real questions. We do not track AI citations or sample AI answers."
  },
  {
    q: "What doesn’t SEO Fix Kit do?",
    a: "It does not auto-publish content or change your site for you, and it does not guarantee rankings, traffic, indexing, AI citations, or revenue. It proves what is broken and proves when it is fixed."
  }
];

export function WaitlistPage() {
  useEffect(() => {
    document.title = "SEO Fix Kit - SEO fixes you can prove";
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-brand" href="/">
          SEO Fix Kit
        </a>
        <nav aria-label="Main">
          <a href="/demo">Demo</a>
          <a href="/pricing">Pricing</a>
          <a href="/methodology">How it works</a>
          <a href="/beta">Sign in</a>
        </nav>
        <a className="landing-btn landing-btn-sm" href="/check">
          Check a page free
        </a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="page-title">
          <div className="landing-hero-copy">
            <p className="landing-pill">Now in private beta · Free to try</p>
            <h1 id="page-title">SEO fixes you can prove.</h1>
            <p className="landing-lead">
              SEO Fix Kit checks your site in a real browser, shows exactly what is
              broken with the evidence, and hands your developer ready-to-paste
              fixes. Then it reruns the check to prove they worked.
            </p>
            <AccessForm />
          </div>
          <ReportPreview />
        </section>

        <section className="landing-facts" aria-label="At a glance">
          <div><strong>1,000</strong><span>pages per audit</span></div>
          <div><strong>Real browser</strong><span>rendering on every page</span></div>
          <div><strong>$0</strong><span>to find the problems</span></div>
          <div><strong>Proof</strong><span>after every fix</span></div>
        </section>

        <section className="landing-section" aria-labelledby="how-title">
          <p className="landing-eyebrow">How it works</p>
          <h2 id="how-title">From “something is wrong” to “proven fixed”.</h2>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="landing-step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <p className="landing-eyebrow">Made for site owners and founders</p>
          <h2 id="features-title">Built for fixing, not for another to-do list.</h2>
          <div className="landing-features">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-proof" aria-labelledby="proof-title">
          <div>
            <p className="landing-eyebrow">Real result</p>
            <h2 id="proof-title">85 to 100, with a receipt.</h2>
            <p>
              Our founder’s own portfolio site went from 7 problems to none across
              two small changes. The same audit ran before and after each one, so every step is
              on the record.
            </p>
            <a className="landing-link" href="/proof">
              See the before and after →
            </a>
          </div>
          <dl className="landing-proof-scores">
            <div><dt>Before</dt><dd>85</dd><span>7 problems</span></div>
            <div><dt>After fix 1</dt><dd>99</dd><span>2 problems</span></div>
            <div><dt>After fix 2</dt><dd>100</dd><span>0 problems</span></div>
          </dl>
        </section>

        <section className="landing-section" aria-labelledby="pricing-title">
          <p className="landing-eyebrow">Pricing</p>
          <h2 id="pricing-title">Free to find it. Pay only to fix it.</h2>
          <div className="landing-plans">
            <article>
              <h3>Page check</h3>
              <p className="landing-price">Free</p>
              <p>One public page, no account.</p>
            </article>
            <article className="featured">
              <h3>Site audit</h3>
              <p className="landing-price">Free</p>
              <p>Up to 1,000 pages, saved reports, and a repair queue. Free during the beta.</p>
            </article>
            <article>
              <h3>Fix Pack</h3>
              <p className="landing-price">$99</p>
              <p>One-time repair pass and a rerun that proves it, only when a report finds real fixes.</p>
            </article>
          </div>
          <a className="landing-link" href="/pricing">
            Compare plans →
          </a>
        </section>

        <section className="landing-section" aria-labelledby="faq-title">
          <p className="landing-eyebrow">Questions</p>
          <h2 id="faq-title">Straight answers.</h2>
          <div className="landing-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <h2 id="final-title">Find out what is really wrong with your site.</h2>
          <p>Start with one page for free. No account, no card.</p>
          <div className="landing-final-actions">
            <a className="landing-btn" href="/check">
              Check a page free
            </a>
            <a className="landing-btn landing-btn-ghost" href="#get-started">
              Create a free account
            </a>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function AccessForm() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [accessUrl, setAccessUrl] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [funnelKey] = useState(() => readOrCreateFunnelKey());
  const [inputFired, setInputFired] = useState(false);

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

  async function requestAccess(event) {
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
      setMessage(payload.message || "Check your inbox for a sign-in link.");
      setAccessUrl(payload.accessUrl || "");
      setEmail("");
      setCompany("");
    } catch (error) {
      setStatus("error");
      setAccessUrl("");
      setMessage(error.message || "We couldn’t send the link. Please try again.");
    }
  }

  return (
    <form className="landing-form" id="get-started" onSubmit={requestAccess}>
      <label htmlFor="email">Work email</label>
      <div className="landing-form-row">
        <input
          autoComplete="email"
          id="email"
          inputMode="email"
          onChange={handleEmailChange}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
        <button disabled={status === "submitting"} type="submit">
          {status === "submitting" ? "Sending…" : "Get started free"}
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
        {message || "We’ll email you a secure sign-in link. No password, no card."}
        {accessUrl && (
          <>
            <br />
            <a className="inline-link" href={accessUrl}>
              Open local access link
            </a>
          </>
        )}
      </p>
      <p className="landing-form-alt">
        Just curious? <a href="/check">Check one page without an account →</a>
      </p>
    </form>
  );
}

// Illustrative report card for the hero. It mirrors the real report's
// structure (score, proven issues, a filtered false alarm, a fix snippet)
// and is labelled as an example.
function ReportPreview() {
  return (
    <figure className="landing-preview" aria-label="Example SEO Fix Kit report">
      <div className="preview-bar">
        <span className="preview-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="preview-url">example.com · 48 pages audited</span>
      </div>
      <div className="preview-body">
        <div className="preview-score">
          <div>
            <span className="preview-label">Site score</span>
            <strong>72</strong>
          </div>
          <div className="preview-delta">
            <span className="preview-label">After fixes</span>
            <strong>96</strong>
          </div>
        </div>
        <ul className="preview-issues">
          <li>
            <span className="chip chip-critical">Critical</span>
            <span>Pricing page is set to noindex</span>
          </li>
          <li>
            <span className="chip chip-warning">Warning</span>
            <span>12 pages share the same title</span>
          </li>
          <li>
            <span className="chip chip-notice">Notice</span>
            <span>Social preview image missing</span>
          </li>
          <li className="preview-filtered">
            <span className="chip chip-ok">Filtered</span>
            <span>“Missing H1” is a false alarm: it appears once the page loads</span>
          </li>
        </ul>
        <pre className="preview-snippet" aria-label="Suggested fix">
          <code>{`<meta property="og:image"\n  content="https://example.com/og.png" />`}</code>
        </pre>
      </div>
      <figcaption>Example report</figcaption>
    </figure>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-brand">
        <a className="landing-brand" href="/">
          SEO Fix Kit
        </a>
        <p>Find the SEO problems that matter, prove them, and fix them.</p>
      </div>
      <nav aria-label="Product">
        <h2>Product</h2>
        <a href="/check">Free page check</a>
        <a href="/demo">Sample report</a>
        <a href="/proof">Customer proof</a>
        <a href="/pricing">Pricing</a>
      </nav>
      <nav aria-label="Use cases">
        <h2>Use cases</h2>
        <a href="/small-business-seo-audit">Small business SEO audit</a>
        <a href="/rendered-vs-static-seo-audit">JavaScript SEO audit</a>
        <a href="/ai-answer-readiness">AI answer readiness</a>
      </nav>
      <nav aria-label="Company">
        <h2>Company</h2>
        <a href="/methodology">How it works</a>
        <a href="/support">Support</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>
      </nav>
    </footer>
  );
}
