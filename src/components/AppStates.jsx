import { Icon } from "./Icon.jsx";

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
      <p>{message || "This didn’t load. Check your connection and try again."}</p>
      {onRetry && (
        <button className="app-button-secondary" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  );
}

export function Badge({ tone = "neutral", children }) {
  return <span className={`app-badge ${tone}`}>{children}</span>;
}

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
