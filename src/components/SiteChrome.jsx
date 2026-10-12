import { useEffect, useState } from "react";
import { SITE_FOOTER, SITE_NAV, SITE_TAGLINE } from "../../shared/site-nav.js";

// React twins of siteHeader() / siteFooter() in worker/routes/pages.js: same
// links (shared/site-nav.js), markup and classes (src/design/site.css), so the
// landing page and the worker-rendered pages share one header and footer.

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    const wide = window.matchMedia("(min-width: 761px)");
    const onWide = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      <a className="site-skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/">
            SEO Fix Kit
          </a>
          <nav aria-label="Main" className="site-nav" data-open={open || undefined} id="site-nav">
            {SITE_NAV.map(({ href, label }) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="site-header-actions">
            <a className="btn btn-primary btn-sm header-cta" href="/check">
              Check a page free
            </a>
            <button
              aria-controls="site-nav"
              aria-expanded={open}
              className="site-menu-button"
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              Menu
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.6"
                viewBox="0 0 16 16"
              >
                <path d="M2.5 5h11M2.5 11h11" />
              </svg>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot-brand">
        <a className="brand" href="/">
          SEO Fix Kit
        </a>
        <p>{SITE_TAGLINE}</p>
      </div>
      {SITE_FOOTER.map((column) => (
        <nav aria-label={column.title} key={column.title}>
          <h2>{column.title}</h2>
          {column.links.map(({ href, label }) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>
      ))}
    </footer>
  );
}
