import { Link } from "react-router";
import { APP_SECTIONS } from "../lib/app-sections.js";
import { Icon } from "./Icon.jsx";

export function AppShell({ section, ownerEmail, onSignOut, showOps = false, children }) {
  const active = section === "report" ? "reports" : section;
  const items = showOps
    ? [...APP_SECTIONS, { key: "admin", icon: "pulse", label: "Ops", path: "/beta/admin" }]
    : APP_SECTIONS;
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
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-account">
          {ownerEmail && (
            <span className="app-account-who">
              <span aria-hidden="true" className="app-avatar">
                {ownerEmail.trim().charAt(0).toUpperCase()}
              </span>
              <span className="app-account-email">{ownerEmail}</span>
            </span>
          )}
          <span className="app-account-actions">
            <a href="mailto:support@seofixkit.com">
              <Icon name="help" size={16} />
              Help
            </a>
            {onSignOut && (
              <button className="text-button" onClick={onSignOut} type="button">
                <Icon name="signOut" size={16} />
                Sign out
              </button>
            )}
          </span>
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
