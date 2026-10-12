import { Link } from "react-router";
import { LogoMark } from "./LogoMark.jsx";

export function BetaTop({ onLock, showBilling = false, showOps = false }) {
  return (
    <header className="beta-top">
      <Link discover="none" className="brand-lockup" to="/" aria-label="SEO Fix Kit home">
        <LogoMark />
        <span>SEO Fix Kit</span>
      </Link>
      <nav>
        <Link discover="none" to="/">
          Public page
        </Link>
        {showBilling && (
          <Link discover="none" to="/beta/billing">
            Billing
          </Link>
        )}
        {showOps && (
          <Link discover="none" to="/beta/admin">
            Ops
          </Link>
        )}
        {onLock && (
          <button className="text-button" onClick={onLock} type="button">
            Lock
          </button>
        )}
      </nav>
    </header>
  );
}
