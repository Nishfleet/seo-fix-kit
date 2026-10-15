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
    text: "Each page loads in a real browser, the way Google renders it. Problems that disappear once JavaScript runs are dropped."
  },
  {
    icon: "wrench",
    title: "Fix",
    text: "Every problem lists the pages it affects, the evidence, and the code to paste. Send the list to your developer as is."
  },
  {
    icon: "receipt",
    title: "Confirm",
    text: "Ship the fixes, then rerun the audit. Each problem is marked fixed, still open or new."
  }
];

const FEATURES = [
  {
    icon: "queue",
    title: "Repair queue",
    text: "Assign each fix, leave notes, approve changes, and track it until a rerun confirms it."
  },
  {
    icon: "pulse",
    title: "Weekly reruns",
    text: "Verified sites are audited again every week, so a page that breaks shows up within days."
  },
  {
    icon: "sparkle",
    title: "AI search readiness",
    text: "Most AI crawlers don’t run JavaScript. See whether your content and schema are in the HTML they read."
  },
  {
    icon: "plug",
    title: "API and webhooks",
    text: "Start audits from your own tools, pull results as JSON, and get a webhook when an audit finishes."
  }
];

const FAQ = [
  {
    q: "Do I need an account?",
    a: "Not to check one page. To audit a whole site, sign in with your email and verify you own the site. Then you can audit up to 1,000 pages at a time, keep every report, and use the repair queue."
  },
  {
    q: "What does the Fix Pack include?",
    a: "Every fix on a saved report as ready-to-ship files, a guided repair pass, and a rerun after your fixes ship to confirm them. It costs $99 per report, paid once. You only see the offer when a report finds real problems."
  },
  {
    q: "Do you check AI search?",
    a: "We check what AI crawlers can read: whether your content is in the raw HTML, whether your schema and headings are clear, and whether your pages answer real questions. We don’t track AI citations or sample AI answers."
  },
  {
    q: "What doesn’t SEO Fix Kit do?",
    a: "It never changes your site or publishes content for you. It doesn’t guarantee rankings, traffic, indexing, AI citations or revenue. It shows what is broken and confirms when it is fixed."
  }
];

const PLANS = [
  { name: "Page check", price: "Free", text: "One public page. No account." },
  {
    name: "Site audit",
    price: "Free",
    text: "Up to 1,000 pages per audit, saved reports and a repair queue. Free during the beta.",
    featured: true
  },
  {
    name: "Fix Pack",
    price: "$99",
    text: "Every fix as ready-to-ship files, a guided repair pass and a rerun that confirms it. Per report, offered when it finds real problems."
  }
];

export function WaitlistPage() {
  useEffect(() => {
    document.title = "SEO Fix Kit - The SEO audit that checks its own work";
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
              An SEO audit that checks its own work.
            </h1>
            <p className="hero-lede enter" style={{ "--enter-delay": "100ms" }}>
              We load every page in a real browser, list only the problems that are actually there, and rerun after you
              ship to mark each one fixed.
            </p>
            <div className="enter" style={{ "--enter-delay": "140ms" }}>
              <HeroCheckForm />
            </div>
          </div>
        </section>

        <section className="platforms" aria-label="Works with any public site">
          <p>Works on any public website</p>
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
            <strong>Chromium</strong>
            <span>renders every page</span>
          </div>
          <div>
            <strong>$0</strong>
            <span>to audit during the beta</span>
          </div>
          <div>
            <strong>Rerun</strong>
            <span>marks each problem fixed, open or new</span>
          </div>
        </section>

        <ProductTour />

        <section className="landing-section" aria-labelledby="how-title">
          <header className="landing-section-head reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Every audit ends with a rerun.</h2>
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
            <p className="eyebrow">Features</p>
            <h2 id="features-title">Each problem comes with what you need to fix it.</h2>
          </header>
          <div className="landing-bento">
            <article className="card landing-bento-wide reveal">
              <div className="landing-bento-copy">
                <span className="landing-feature-icon">
                  <Icon name="shieldCheck" />
                </span>
                <h3>False alarms filtered out</h3>
                <p>
                  Scanners that only read raw HTML flag headings and text that JavaScript adds later. We check the
                  rendered page too and drop those flags.
                </p>
              </div>
              <FalseAlarmDiff />
            </article>
            <article className="card landing-bento-wide reveal">
              <div className="landing-bento-copy">
                <span className="landing-feature-icon">
                  <Icon name="code" />
                </span>
                <h3>Code you can paste</h3>
                <p>
                  Missing meta tags, schema and social previews come with the exact snippet, filled in from your page.
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
            <p className="eyebrow">Case study</p>
            <h2 id="proof-title">85 to 100 in two fixes.</h2>
            <p>
              Our founder’s portfolio site had 7 problems. Two small changes fixed all of them, and the same audit ran
              before and after each one.
            </p>
            <a className="link-arrow" href="/proof">
              Read the case study <span className="arrow">→</span>
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
            <h2 id="pricing-title">Audits are free. Fixes are $99 per report.</h2>
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
            <h2 id="faq-title">Common questions</h2>
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
            Audit the whole site, free.
          </h2>
          <p>Create a free account to audit up to 1,000 pages, keep every report and track each fix.</p>
          <div className="landing-final-form">
            <AccessForm />
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
    label: "Report",
    title: "Every problem, ranked, with evidence.",
    text: "Problems in fix-first order, with severity, evidence from the rendered page and the snippet to paste.",
    src: "/tour/report.webp",
    alt: "SEO Fix Kit report: a score, problem counts, and a fix-first list"
  },
  {
    key: "pages",
    label: "Pages",
    title: "Each page, checked in a real browser.",
    text: "Score, headings, word count, links and load time for each page the audit opened.",
    src: "/tour/pages.webp",
    alt: "SEO Fix Kit pages table: a score and checks for each page of the site"
  }
];

function ProductTour() {
  const [active, setActive] = useState(TOUR[0].key);
  const current = TOUR.find((item) => item.key === active);

  return (
    <section className="landing-section tour" aria-labelledby="tour-title">
      <header className="landing-section-head reveal">
        <p className="eyebrow">Product</p>
        <h2 id="tour-title">Screens from the real app.</h2>
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
      <span className="hero-ticker-label">Case study</span>
      <span className="hero-ticker-value">
        85 → <strong>{score}</strong>
      </span>
      <span className="hero-ticker-note">7 problems fixed, confirmed by rerun</span>
      <span aria-hidden="true" className="arrow">
        →
      </span>
    </a>
  );
}

function HeroCheckForm() {
  return (
    <form className="landing-form" action="/check" method="get" role="search" aria-label="Check a page">
      <label className="sr-only" htmlFor="hero-url">
        Page to check
      </label>
      <div className="landing-form-row">
        <input
          autoCapitalize="off"
          autoComplete="url"
          id="hero-url"
          inputMode="url"
          name="url"
          placeholder="yoursite.com"
          required
          spellCheck="false"
          type="text"
        />
        <button className="btn btn-primary" type="submit">
          Check it free
        </button>
      </div>
      <p className="form-message">Free for any public page. No account, no card.</p>
      <p className="landing-form-alt">
        Or <a href="#get-started">create a free account to audit the whole site →</a>
      </p>
    </form>
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
      setMessage(error.message || "We couldn’t send the link. Check the address and try again.");
    }
  }

  return (
    <form className="landing-form" id="get-started" onSubmit={requestAccess}>
      <label className="sr-only" htmlFor="email">
        Email
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
          {status === "submitting" ? "Sending…" : "Start free"}
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
        {message || "We’ll email you a sign-in link. No password, no card."}
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
    text: "“Missing H1” filtered: the H1 renders after load",
    pages: "6 pages",
    status: "Ignored"
  }
];

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
