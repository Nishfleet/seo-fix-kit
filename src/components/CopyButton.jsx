import { useEffect, useState } from "react";
import { copyText } from "../lib/browser.js";

export function CopyButton({ label = "Copy", value, className = "action-link" }) {
  const [result, setResult] = useState("");
  useEffect(() => {
    if (!result) return undefined;
    const timer = window.setTimeout(() => setResult(""), 1600);
    return () => window.clearTimeout(timer);
  }, [result]);
  return (
    <button
      aria-live="polite"
      className={className}
      onClick={async () => {
        setResult((await copyText(value)) ? "Copied" : "Copy failed");
      }}
      type="button"
    >
      {result || label}
    </button>
  );
}
