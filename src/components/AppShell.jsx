import { Link } from "react-router";
import { APP_SECTIONS } from "../lib/app-sections.js";

// Signed-in app frame: a left sidebar on desktop and a top bar with a
// scrolling tab row on small screens.
export function AppShell({ section, ownerEmail, onSignOut, showOps = false, children }) {
  const active = section === "report" ? "reports" : section;
  const items = showOps ? [...APP_SECTIONS, { key: "admin", label: "Ops", path: "/beta/admin" }] : APP_SECTIONS;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-main">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <Link discover="none" className="app-brand" to="/beta">
          SEO Fix Kit
        </Link>
        <nav aria-label="App">
          {items.map((item) => (
            <Link
              aria-current={active === item.key ? "page" : undefined}
              className={active === item.key ? "active" : ""}
              discover="none"
              key={item.key}
              to={item.path}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-account">
          {ownerEmail && <span className="app-account-email">{ownerEmail}</span>}
          <a href="mailto:support@seofixkit.com">Help</a>
          {onSignOut && (
            <button className="text-button" onClick={onSignOut} type="button">
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="app-main" id="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="app-page-header">
      <div>
        {eyebrow && <p className="app-page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="app-page-actions">{actions}</div>}
    </header>
  );
}
