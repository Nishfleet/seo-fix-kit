import { useEffect, useState } from "react";
import { copyText } from "../lib/browser.js";

// Copies `value` and confirms with "Copied" for a moment.
export function CopyButton({ label = "Copy", value, className = "action-link" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      aria-live="polite"
      className={className}
      onClick={() => {
        copyText(value);
        setCopied(true);
      }}
      type="button"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
