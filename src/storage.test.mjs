import assert from "node:assert/strict";
import test from "node:test";
import { storageGet, storageRemove, storageSet } from "./storage.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

function defineStorage(name, getter) {
  Object.defineProperty(globalThis, name, { configurable: true, get: getter });
}

test.afterEach(() => {
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
});

test("reads, writes and removes through the chosen storage area", () => {
  const session = memoryStorage();
  const local = memoryStorage();
  defineStorage("sessionStorage", () => session);
  defineStorage("localStorage", () => local);

  assert.equal(storageSet("k", "1"), true);
  assert.equal(storageGet("k"), "1");
  assert.equal(storageGet("k", "local"), null);
  storageSet("k", "2", "local");
  assert.equal(storageGet("k", "local"), "2");
  storageRemove("k");
  assert.equal(storageGet("k"), null);
});

test("blocked storage access degrades to null/no-op instead of throwing", () => {
  defineStorage("sessionStorage", () => {
    throw new Error("SecurityError: access denied");
  });
  assert.equal(storageGet("k"), null);
  assert.equal(storageSet("k", "1"), false);
  assert.doesNotThrow(() => storageRemove("k"));
});

test("throwing storage methods (quota, disabled) are contained", () => {
  defineStorage("sessionStorage", () => ({
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("denied");
    }
  }));
  assert.equal(storageGet("k"), null);
  assert.equal(storageSet("k", "1"), false);
  assert.doesNotThrow(() => storageRemove("k"));
});

test("missing storage (non-browser) is treated as empty", () => {
  assert.equal(storageGet("k"), null);
  assert.equal(storageSet("k", "1"), false);
});
