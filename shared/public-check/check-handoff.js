const MAX_URL_LENGTH = 2000;

export function checkedPageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return "";
  if (!parsed.hostname.includes(".")) return "";
  return parsed.href;
}

export function checkHandoffHref(value) {
  const url = checkedPageUrl(value);
  return url ? `/beta?url=${encodeURIComponent(url)}` : "/beta";
}

export function handoffPageUrl(search, stored) {
  return checkedPageUrl(new URLSearchParams(String(search || "")).get("url")) || checkedPageUrl(stored);
}
