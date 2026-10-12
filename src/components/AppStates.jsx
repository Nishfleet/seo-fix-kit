import { Icon } from "./Icon.jsx";

// Loading and error placeholders for signed-in app cards. A card shows these
// instead of its empty state until its data has actually loaded, so a slow
// request never reads as "you have nothing here".

export function SkeletonRows({ rows = 3, label = "Loading" }) {
  return (
    <div className="app-skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }) {
  return (
    <div className="app-load-error" role="alert">
      <p>{message || "Something went wrong while loading this page."}</p>
      {onRetry && (
        <button className="app-button-secondary" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  );
}

// Small coloured label. Tones: neutral, good, warn, bad, info.
export function Badge({ tone = "neutral", children }) {
  return <span className={`app-badge ${tone}`}>{children}</span>;
}

// "Nothing here yet" for a card: an icon tile and one line saying what will
// appear and how to get it, so an empty card still points somewhere.
export function EmptyState({ icon = "sparkle", children }) {
  return (
    <div className="app-empty-state">
      <span aria-hidden="true" className="app-empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <p className="app-empty">{children}</p>
    </div>
  );
}
