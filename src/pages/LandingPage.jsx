import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { ProofField } from "../components/ProofField.jsx";
import { SiteFooter, SiteHeader } from "../components/SiteChrome.jsx";
import { readOrCreateFunnelKey, sendAccessBeacon } from "../lib/browser.js";
import { postAccessRequest } from "../lib/requests.js";
import "./landing.css";

const PLATFORMS = ["Shopify", "WordPress", "Webflow", "Squarespace", "Wix", "Framer", "Next.js", "Ghost", "HubSpot"];

const STEPS = [
  {
    icon: "search",
    title: "Find",
    text: "We open your pages in a real browser, the way Google and your customers see them, and list what is actually broken."
  },
  {
    icon: "wrench",
    title: "Fix",
    text: "Each problem comes with the evidence, why it matters, and a ready-to-paste fix your developer can ship."
  },
  {
    icon: "receipt",
    title: "Prove",
    text: "After the fix goes live, rerun the audit. Every item is marked fixed, still open, or new, so you know it worked."
  }
];

const FEATURES = [
  {
    icon: "queue",
    title: "A repair queue for your team",
    text: "Assign fixes, add notes, approve changes, and track every item from open to proven fixed."
  },
  {
    icon: "pulse",
    title: "Weekly monitoring",
    text: "Verified sites get a weekly rerun, so you hear about a regression early."
  },
  {
    icon: "sparkle",
    title: "Ready for AI search",
    text: "See whether ChatGPT-style crawlers, which skip JavaScript, can read your content and structure."
  },
  {
    icon: "plug",
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

const PLANS = [
  { name: "Page check", price: "Free", text: "One public page, no account." },
  {
    name: "Site audit",
    price: "Free",
    text: "Up to 1,000 pages, saved reports, and a repair queue. Free during the beta.",
    featured: true
  },
  {
    name: "Fix Pack",
    price: "$99",
    text: "One-time repair pass and a rerun that proves it, only when a report finds real fixes."
  }
];

export function WaitlistPage() {
  useEffect(() => {
    document.title = "SEO Fix Kit - SEO fixes you can prove";
    // The public site is light (prerendered with data-theme="light"); the
    // signed-in app is dark.
    const root = document.documentElement;
    root.dataset.theme = "light";
    return () => {
      delete root.dataset.theme;
    };
  }, []);

  return (
    <div className="landing">
      <SiteHeader />

      <main id="main">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-art">
            <ProofField />
          </div>
          <div className="hero-copy">
            <ProofTicker />
            <h1 className="hero-title enter" id="page-title" style={{ "--enter-delay": "60ms" }}>
              SEO fixes you can prove.{" "}
              <span className="hero-title-soft">
                Find what is really broken, ship the fix, and rerun the check that shows it worked.
              </span>
            </h1>
            <div className="enter" style={{ "--enter-delay": "140ms" }}>
              <AccessForm />
            </div>
          </div>
        </section>

        <section className="platforms" aria-label="Works with any public site">
          <p>Works on any public site, whatever it is built on</p>
          <div className="platforms-track">
            <ul>
              {PLATFORMS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <ul aria-hidden="true">
              {PLATFORMS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </section>

        <div className="stage" data-theme="dark">
          <ProductShot />
        </div>

        <section className="landing-facts reveal" aria-label="At a glance">
          <div>
            <strong>1,000</strong>
            <span>pages per audit</span>
          </div>
          <div>
            <strong>Real browser</strong>
            <span>rendering on every page</span>
          </div>
          <div>
            <strong>$0</strong>
            <span>to find the problems</span>
          </div>
          <div>
            <strong>Proof</strong>
            <span>after every fix</span>
          </div>
        </section>

        <ProductTour />

        <section className="landing-section" aria-labelledby="how-title">
          <header className="landing-section-head reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">From “something is wrong” to “proven fixed”.</h2>
          </header>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li className="card reveal" key={step.title}>
                <span className="landing-step-icon">
                  <Icon name={step.icon} />
                </span>
                <span className="landing-step-number">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <header className="landing-section-head reveal">
            <p className="eyebrow">Made for site owners and founders</p>
            <h2 id="features-title">Built for fixing, not for another to-do list.</h2>
          </header>
          <div className="landing-bento">
            <article className="card landing-bento-wide reveal">
              <div className="landing-bento-copy">
                <span className="landing-feature-icon">
                  <Icon name="shieldCheck" />
                </span>
                <h3>No false alarms</h3>
                <p>
                  Most scanners only read raw HTML and flag problems that are not there. We compare it with the real
                  page and drop the noise.
                </p>
              </div>
              <FalseAlarmDiff />
            </article>
            <article className="card landing-bento-wide reveal">
              <div className="landing-bento-copy">
                <span className="landing-feature-icon">
                  <Icon name="code" />
                </span>
                <h3>Ready-to-paste fixes</h3>
                <p>
                  Missing tags, schema, and social previews come with the exact snippet to add, built from your own
                  page.
                </p>
              </div>
              <pre className="landing-snippet" aria-label="Example fix" data-theme="dark">
                <code>
                  <span className="tok-tag">&lt;meta</span> <span className="tok-attr">property</span>=
                  <span className="tok-str">&quot;og:image&quot;</span>
                  {"\n  "}
                  <span className="tok-attr">content</span>=
                  <span className="tok-str">&quot;https://example.com/og.png&quot;</span>{" "}
                  <span className="tok-tag">/&gt;</span>
                </code>
              </pre>
            </article>
            {FEATURES.map((feature) => (
              <article className="card reveal" key={feature.title}>
                <span className="landing-feature-icon">
                  <Icon name={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-proof reveal" aria-labelledby="proof-title">
          <div className="landing-proof-copy">
            <p className="eyebrow">Real result</p>
            <h2 id="proof-title">85 to 100, with a receipt.</h2>
            <p>
              Our founder’s own portfolio site went from 7 problems to none across two small changes. The same audit ran
              before and after each one, so every step is on the record.
            </p>
            <a className="link-arrow" href="/proof">
              See the before and after <span className="arrow">→</span>
            </a>
          </div>
          <dl className="landing-proof-scores">
            {[
              ["Before", 85, "7 problems"],
              ["After fix 1", 99, "2 problems"],
              ["After fix 2", 100, "0 problems"]
            ].map(([label, score, problems]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{score}</dd>
                <span className="landing-proof-bar" style={{ "--score": score }} aria-hidden="true" />
                <span>{problems}</span>
              </div>
            ))}
          </dl>
        </section>

        <section className="landing-section" aria-labelledby="pricing-title">
          <header className="landing-section-head reveal">
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing-title">Free to find it. Pay only to fix it.</h2>
          </header>
          <div className="landing-plans">
            {PLANS.map((plan) => (
              <article className={`card reveal${plan.featured ? " featured" : ""}`} key={plan.name}>
                <h3>{plan.name}</h3>
                <p className="landing-price">{plan.price}</p>
                <p>{plan.text}</p>
              </article>
            ))}
          </div>
          <a className="link-arrow landing-more" href="/pricing">
            Compare plans <span className="arrow">→</span>
          </a>
        </section>

        <section className="landing-section landing-faq-section" aria-labelledby="faq-title">
          <header className="landing-section-head reveal">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title">Straight answers.</h2>
          </header>
          <div className="landing-faq reveal">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-final hero-light reveal" aria-labelledby="final-title">
          <h2 className="ink-gradient" id="final-title">
            Find out what is really wrong with your site.
          </h2>
          <p>Start with one page for free. No account, no card.</p>
          <div className="landing-final-actions">
            <a className="btn btn-primary btn-lg" href="/check">
              Check a page free <span className="arrow">→</span>
            </a>
            <a className="btn btn-secondary btn-lg" href="#get-started">
              Create a free account
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

const TOUR = [
  {
    key: "report",
    label: "The report",
    title: "Every problem, ranked, with the proof attached.",
    text: "Fix-first order, severity, the evidence from the rendered page, and the exact snippet to paste.",
    src: "/tour/report.webp",
    alt: "SEO Fix Kit report: a score, problem counts, and a fix-first list"
  },
  {
    key: "pages",
    label: "Every page",
    title: "Each page, checked in a real browser.",
    text: "Scores, headings, word counts, links and load times for every page the audit opened.",
    src: "/tour/pages.webp",
    alt: "SEO Fix Kit pages table: a score and checks for each page of the site"
  }
];

// Real screenshots of the signed-in app, showing a sample report for a demo
// site (acme-widgets.example).
function ProductTour() {
  const [active, setActive] = useState(TOUR[0].key);
  const current = TOUR.find((item) => item.key === active);

  return (
    <section className="landing-section tour" aria-labelledby="tour-title">
      <header className="landing-section-head reveal">
        <p className="eyebrow">The product</p>
        <h2 id="tour-title">This is what you get. Not a mockup.</h2>
      </header>
      <div className="tour-tabs" role="tablist" aria-label="Product screens">
        {TOUR.map((item) => (
          <button
            aria-controls="tour-panel"
            aria-selected={item.key === active}
            className="tour-tab"
            id={`tour-tab-${item.key}`}
            key={item.key}
            onClick={() => setActive(item.key)}
            role="tab"
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
      <div aria-labelledby={`tour-tab-${current.key}`} className="tour-panel" id="tour-panel" role="tabpanel">
        <p>{current.text}</p>
        <div className="tour-frame">
          {TOUR.map((item) => (
            <img
              alt={item.alt}
              decoding="async"
              height="1012"
              hidden={item.key !== active}
              key={item.key}
              loading="lazy"
              src={item.src}
              width="1600"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// Live proof line above the headline, the way Stripe leads with a live
// number. It counts up the latest proven result (the case study on /proof);
// the prerendered HTML already shows the final score.
function ProofTicker() {
  const [score, setScore] = useState(100);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const begin = performance.now() + 500;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - begin) / 1600));
      setScore(Math.round(85 + 15 * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <a className="hero-ticker enter" href="/proof">
      <span className="hero-ticker-label">Latest proof</span>
      <span className="hero-ticker-value">
        85 → <strong>{score}</strong>
      </span>
      <span className="hero-ticker-note">7 problems fixed, rerun verified</span>
      <span aria-hidden="true" className="arrow">
        →
      </span>
    </a>
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
      <label className="sr-only" htmlFor="email">
        Work email
      </label>
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
        <button className="btn btn-primary" disabled={status === "submitting"} type="submit">
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

const SHOT_ROWS = [
  {
    severity: "critical",
    label: "Critical",
    text: "Pricing page is set to noindex",
    pages: "1 page",
    status: "Fix ready"
  },
  {
    severity: "warning",
    label: "Warning",
    text: "12 pages share the same title",
    pages: "12 pages",
    status: "Fix ready"
  },
  {
    severity: "notice",
    label: "Notice",
    text: "Social preview image missing",
    pages: "48 pages",
    status: "Proven fixed"
  },
  {
    severity: "ok",
    label: "Filtered",
    text: "“Missing H1” is a false alarm: it appears once the page loads",
    pages: "6 pages",
    status: "Ignored"
  }
];

// Illustrative product shot for the hero, built in HTML so it stays crisp
// and light. It mirrors the real report (score, repair queue, a filtered
// false alarm, a fix snippet, rerun proof) and is labelled as an example.
function ProductShot() {
  return (
    <figure className="shot enter" aria-label="Example SEO Fix Kit report" style={{ "--enter-delay": "220ms" }}>
      <div className="shot-bar">
        <span className="shot-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="shot-url">example.com · 48 pages audited</span>
        <span className="shot-tabs" aria-hidden="true">
          <span className="is-active">Repair queue</span>
          <span>Pages</span>
          <span>Proof</span>
        </span>
      </div>
      <div className="shot-body">
        <aside className="shot-side">
          <ShotRing before={72} after={96} />
          <dl className="shot-counts">
            <div>
              <dt>Critical</dt>
              <dd className="sev-critical">1</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd className="sev-warning">3</dd>
            </div>
            <div>
              <dt>False alarms filtered</dt>
              <dd className="sev-ok">6</dd>
            </div>
          </dl>
        </aside>
        <div className="shot-main">
          <p className="shot-heading">Repair queue</p>
          <ul className="shot-rows">
            {SHOT_ROWS.map((row, index) => (
              <li
                className={`enter${row.severity === "ok" ? " is-filtered" : ""}`}
                key={row.text}
                style={{ "--enter-delay": `${420 + index * 70}ms` }}
              >
                <span className={`chip chip-${row.severity}`}>{row.label}</span>
                <span className="shot-row-text">{row.text}</span>
                <span className="shot-row-pages">{row.pages}</span>
                <span className={`shot-status${row.status === "Proven fixed" ? " is-proven" : ""}`}>{row.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shot-detail">
          <p className="shot-heading">Suggested fix</p>
          <pre className="landing-snippet">
            <code>
              <span className="tok-tag">&lt;meta</span> <span className="tok-attr">property</span>=
              <span className="tok-str">&quot;og:image&quot;</span>
              {"\n  "}
              <span className="tok-attr">content</span>=<span className="tok-str">&quot;/og.png&quot;</span>{" "}
              <span className="tok-tag">/&gt;</span>
            </code>
          </pre>
          <div className="shot-receipt">
            <p className="shot-heading">Rerun proof</p>
            <p>
              <strong>3 fixed</strong> · 0 new · 1 still open
            </p>
          </div>
        </div>
      </div>
      <figcaption>Example report</figcaption>
    </figure>
  );
}

function ShotRing({ before, after }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="shot-ring">
      <svg aria-hidden="true" viewBox="0 0 80 80">
        <circle className="shot-ring-track" cx="40" cy="40" r={radius} />
        <circle
          className="shot-ring-before"
          cx="40"
          cy="40"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - before / 100)}
        />
        <circle
          className="shot-ring-after"
          cx="40"
          cy="40"
          r={radius}
          strokeDasharray={circumference}
          style={{ "--ring-from": circumference * (1 - before / 100), "--ring-to": circumference * (1 - after / 100) }}
        />
      </svg>
      <div className="shot-ring-label">
        <strong>{after}</strong>
        <span>from {before}</span>
      </div>
    </div>
  );
}

// Raw HTML vs rendered page, the comparison behind "no false alarms".
function FalseAlarmDiff() {
  return (
    <div className="landing-diff" aria-label="Raw HTML compared with the rendered page" data-theme="dark">
      <div>
        <p className="landing-diff-head">Raw HTML</p>
        <p className="landing-diff-row is-bad">
          <Icon name="x" size={14} /> No &lt;h1&gt; found
        </p>
        <p className="landing-diff-row is-bad">
          <Icon name="x" size={14} /> 41 words
        </p>
      </div>
      <div>
        <p className="landing-diff-head">Real browser</p>
        <p className="landing-diff-row is-good">
          <Icon name="check" size={14} /> &lt;h1&gt; present
        </p>
        <p className="landing-diff-row is-good">
          <Icon name="check" size={14} /> 1,284 words
        </p>
      </div>
    </div>
  );
}
