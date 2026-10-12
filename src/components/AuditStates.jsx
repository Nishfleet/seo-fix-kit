export function LoadingAuditState({ message }) {
  return (
    <div className="loading-state">
      <div className="scan-orbit" aria-hidden="true" />
      <div>
        <p className="beta-eyebrow">Running audit</p>
        <h2>{message || "Loading your pages in a browser…"}</h2>
        <p>Small sites finish quickly. Large or JavaScript-heavy sites take longer.</p>
      </div>
    </div>
  );
}

export function ErrorAuditState({
  message,
  title = "Audit didn’t finish",
  hint = "Check the URL and run it again. Some sites block automated browsers.",
  children
}) {
  return (
    <div className="empty-state error-state">
      <p className="beta-eyebrow">{title}</p>
      <h2>{message}</h2>
      <p>{hint}</p>
      {children}
    </div>
  );
}
