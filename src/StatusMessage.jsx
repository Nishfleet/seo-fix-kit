export default function StatusMessage({ tone = "", children }) {
  if (!children) return null;
  return (
    <p className={`form-message ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
