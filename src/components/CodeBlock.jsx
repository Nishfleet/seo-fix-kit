import { copyText } from "../lib/browser.js";

export function CodeBlock({ code }) {
  return (
    <div className="code-block">
      <button type="button" onClick={() => copyText(code)}>
        Copy code
      </button>
      <pre>{code}</pre>
    </div>
  );
}
