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
  } catch {}
}
