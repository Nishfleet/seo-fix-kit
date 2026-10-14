const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function escapeHtml(value) {
  if (value === null || value === undefined || value === false) return "";
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}
