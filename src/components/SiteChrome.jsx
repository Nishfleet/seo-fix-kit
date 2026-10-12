import { useEffect, useState } from "react";
import { SITE_FOOTER, SITE_NAV, SITE_TAGLINE } from "../../shared/site-nav.js";

// React twins of siteHeader() / siteFooter() in worker/routes/pages.js: same
// links (shared/site-nav.js), markup and classes (src/design/site.css), so the
// landing page and the worker-rendered pages share one header and footer.

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setGroup(null);
      if (!group) setOpen(false);
    };
    const onClick = (event) => {
      if (!event.target.closest("[data-nav-group]")) setGroup(null);
    };
    const wide = window.matchMedia("(min-width: 761px)");
    const onWide = () => {
      setOpen(false);
      setGroup(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      wide.removeEventListener("change", onWide);
    };
  }, [group]);

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
            {SITE_NAV.map((entry) =>
              entry.items ? (
                <div
                  className="site-nav-group"
                  data-nav-group
                  data-open={group === entry.id || undefined}
                  key={entry.id}
                >
                  <button
                    aria-controls={`site-nav-${entry.id}`}
                    aria-expanded={group === entry.id}
                    className="site-nav-trigger"
                    onClick={() => setGroup((value) => (value === entry.id ? null : entry.id))}
                    type="button"
                  >
                    {entry.label}
                    <svg
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 12 12"
                    >
                      <path d="m3 4.5 3 3 3-3" />
                    </svg>
                  </button>
                  <div className="site-nav-menu" id={`site-nav-${entry.id}`}>
                    {entry.items.map(({ href, label, text }) => (
                      <a href={href} key={href}>
                        <strong>{label}</strong>
                        <span>{text}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <a className={entry.kind ? `site-nav-${entry.kind}` : undefined} href={entry.href} key={entry.href}>
                  {entry.label}
                </a>
              )
            )}
          </nav>
          <div className="site-header-actions">
            <a className="btn btn-primary btn-sm header-cta" href="/check">
              Check a page
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
