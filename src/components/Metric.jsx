export function Metric({ label, value, tone }) {
  return (
    <div data-tone={tone}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
