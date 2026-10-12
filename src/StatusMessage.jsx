// Async status/error line for dashboard panels. Errors are announced
// assertively (role="alert"); progress and success politely (role="status").
// Renders the same `form-message <tone>` paragraph the panels used before.
export default function StatusMessage({ tone = "", children }) {
  if (!children) return null;
  return (
    <p className={`form-message ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
