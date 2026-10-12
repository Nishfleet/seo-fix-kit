import { LogoMark } from "./LogoMark.jsx";

export function BetaTop({ onLock, showBilling = false, showOps = false }) {
  return (
    <header className="beta-top">
      <a className="brand-lockup" href="/" aria-label="SEO Fix Kit home">
        <LogoMark />
        <span>SEO Fix Kit</span>
      </a>
      <nav>
        <a href="/">Public page</a>
        {showBilling && <a href="/beta/billing">Billing</a>}
        {showOps && <a href="/beta/admin">Ops</a>}
        {onLock && (
          <button className="text-button" onClick={onLock} type="button">
            Lock
          </button>
        )}
      </nav>
    </header>
  );
}
