// Web Storage access that never throws.
//
// Locked-down browsers (blocked site data, some private modes, sandboxed
// iframes) throw a SecurityError just for touching `window.sessionStorage`,
// and quota errors can throw from setItem. Storage here only holds
// conveniences, so failures degrade to "nothing stored".

function storageArea(kind) {
  try {
    const area = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return area || null;
  } catch {
    return null;
  }
}

export function storageGet(key, kind = "session") {
  try {
    return storageArea(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageSet(key, value, kind = "session") {
  try {
    const area = storageArea(kind);
    if (!area) return false;
    area.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key, kind = "session") {
  try {
    storageArea(kind)?.removeItem(key);
  } catch {
    // Nothing stored is the safe fallback.
  }
}
