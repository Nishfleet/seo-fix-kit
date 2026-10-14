import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { app } from "../worker/index.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.com";
const OWNER = "owner@example.com";
const CTX = { waitUntil() {}, passThroughOnException() {} };

function signIn(db) {
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  db.insert("beta_sessions", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    owner_email: OWNER,
    created_at: now,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_seen_at: now,
    access_mode: "self-serve"
  });
  return token;
}

function fakeSite(t, homepage) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://cloudflare-dns.com/")) return Response.json({ Answer: [] });
    if (href === "https://shop.example/") return new Response(homepage(), { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
}

async function call(db, session, path, body) {
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sfk_beta_session=${session}` },
      body: JSON.stringify(body)
    }),
    { WAITLIST_DB: db },
    CTX
  );
  return response.json();
}

test("pasting the meta tag into the homepage verifies the site", async (t) => {
  const db = createTestD1();
  const session = signIn(db);
  let homepage = "<html><head><title>Shop</title></head><body>Hi</body></html>";
  fakeSite(t, () => homepage);

  const claimed = await call(db, session, "/api/sites/claim", { host: "shop.example" });
  const tag = claimed.site.metaTag;
  assert.match(tag, /^<meta name="seofixkit-site-verification" content="sfk-[^"]+" \/>$/);

  const before = await call(db, session, "/api/sites/verify", { id: claimed.site.id });
  assert.equal(before.verified, false);
  assert.match(before.message, /couldn’t find the tag/);

  // Site builders rewrite tags: attribute order and quoting change.
  const token = tag.match(/content="([^"]+)"/)[1];
  homepage = `<html><head><meta content='${token}' name='seofixkit-site-verification'><title>Shop</title></head></html>`;
  const after = await call(db, session, "/api/sites/verify", { id: claimed.site.id });
  assert.equal(after.verified, true);
  assert.equal(after.site.verificationMethod, "meta-tag");
});

test("a tag with someone else's token does not verify", async (t) => {
  const db = createTestD1();
  const session = signIn(db);
  fakeSite(t, () => '<meta name="seofixkit-site-verification" content="sfk-not-yours">');
  const claimed = await call(db, session, "/api/sites/claim", { host: "shop.example" });
  const result = await call(db, session, "/api/sites/verify", { id: claimed.site.id });
  assert.equal(result.verified, false);
});
