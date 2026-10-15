import { copyText } from "../lib/browser.js";

export function CodeBlock({ code }) {
  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>Code</span>
        <button type="button" onClick={() => copyText(code)}>
          Copy code
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}
