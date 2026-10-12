const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

// Escapes text for safe interpolation into HTML element content and quoted
// attribute values (single or double quoted). `null`, `undefined` and `false`
// render as nothing; every other value, including 0, renders as its string.
export function escapeHtml(value) {
  if (value === null || value === undefined || value === false) return "";
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}
