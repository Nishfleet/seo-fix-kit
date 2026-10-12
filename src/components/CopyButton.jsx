import { copyText } from "../lib/browser.js";

export function CopyButton({ label, value }) {
  return (
    <button className="action-link" onClick={() => copyText(value)} type="button">
      {label}
    </button>
  );
}
