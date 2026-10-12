// End-to-end behaviour tests for the login and access flows.
//
// Every request goes through the Worker's real fetch entry point against an
// in-memory D1 with every migration applied. Assertions only look at what a
// client or operator can observe: HTTP status, JSON body, Set-Cookie headers,
// emails handed to the EMAIL binding, and rows in the database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import worker from "../worker/index.js";
import { auditAuthorizationStatus } from "../worker/lib/auth.js";
import { createTestD1 } from "./support/d1.mjs";

const ORIGIN = "https://seofixkit.test";
const FOUNDER_PASSWORD = "founder-override-pass-123";
const ADMIN_TOKEN = "admin-export-token-for-tests";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function makeEnv(overrides = {}) {
  const sent = [];
  const db = createTestD1();
  const env = {
    WAITLIST_DB: db,
    SEOFIXKIT_EMAIL_FROM: "SEO Fix Kit <support@seofixkit.com>",
    BETA_ACCESS_PASSWORD: FOUNDER_PASSWORD,
    ADMIN_EXPORT_TOKEN: ADMIN_TOKEN,
    EMAIL: {
      async send(message) {
        sent.push(message);
        return { messageId: `message-${sent.length}` };
      }
    },
    ...overrides
  };
  return { env, db, sent };
}

function fakeCtx() {
  return { waitUntil() {}, passThroughOnException() {} };
}

async function call(env, path, { method = "GET", body, cookie, ip = "203.0.113.10", headers = {} } = {}) {
  const init = {
    method,
    headers: {
      "cf-connecting-ip": ip,
      "user-agent": "auth-flow-test",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...headers
    }
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env, fakeCtx());
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text };
}

function setCookies(response) {
  return response.headers.getSetCookie();
}

// Returns the "name=value" pair of the beta session cookie, or null.
function sessionCookieFrom(response) {
  const raw = setCookies(response).find((cookie) => cookie.startsWith("sfk_beta_session="));
  if (!raw) return null;
  return raw.split(";")[0];
}

function sessionTokenFrom(cookiePair) {
  return cookiePair.slice("sfk_beta_session=".length);
}

function accessTokenFromEmail(message) {
  const match = String(message.text).match(/[?&]access=([A-Za-z0-9_-]+)/);
  assert.ok(match, "access email should contain an access link");
  return match[1];
}

async function adminCreateInvite(env, body) {
  const response = await call(env, "/admin/invites", {
    method: "POST",
    body,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(response.status, 200, response.text);
  return response.json.invite;
}

async function founderLogin(env, email = "founder@example.com") {
  const response = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email, inviteCode: FOUNDER_PASSWORD }
  });
  assert.equal(response.status, 200, response.text);
  return sessionCookieFrom(response);
}

// --- Waitlist ------------------------------------------------------------------

test("waitlist signup stores a lead and a duplicate signup updates it instead of failing", async () => {
  const { env, db } = makeEnv();

  const first = await call(env, "/api/waitlist", {
    method: "POST",
    body: { email: "Lead@Example.com", source: "homepage", utm: { source: "newsletter" } }
  });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, { ok: true, status: "joined" });

  let leads = db.rows("SELECT email, source, utm_source FROM waitlist_leads");
  assert.deepEqual(leads, [{ email: "lead@example.com", source: "homepage", utm_source: "newsletter" }]);

  const again = await call(env, "/api/waitlist", {
    method: "POST",
    body: { email: "lead@example.com", source: "pricing-page" }
  });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json, { ok: true, status: "joined" });

  leads = db.rows("SELECT email, source FROM waitlist_leads");
  assert.deepEqual(leads, [{ email: "lead@example.com", source: "pricing-page" }]);
});

test("waitlist signup rejects an invalid email and silently drops honeypot submissions", async () => {
  const { env, db } = makeEnv();

  const invalid = await call(env, "/api/waitlist", { method: "POST", body: { email: "not-an-email" } });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.json.error);

  const bot = await call(env, "/api/waitlist", {
    method: "POST",
    body: { email: "bot@example.com", company: "Spam Inc" }
  });
  assert.equal(bot.status, 200);
  assert.equal(bot.json.status, "joined");

  assert.deepEqual(db.rows("SELECT email FROM waitlist_leads"), []);
});

// --- Email access link -----------------------------------------------------------

test("access link request emails a one-use link that unlocks a self-serve session", async () => {
  const { env, db, sent } = makeEnv();

  const requested = await call(env, "/api/access/request", {
    method: "POST",
    body: { email: "Owner@Example.com" }
  });
  assert.equal(requested.status, 200, requested.text);
  assert.equal(requested.json.ok, true);
  assert.equal(requested.json.status, "sent");
  assert.ok(Date.parse(requested.json.expiresAt) > Date.now());
  assert.equal(sessionCookieFrom(requested), null, "requesting a link must not log anyone in");

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  assert.match(sent[0].text, new RegExp(`^${ORIGIN}/beta\\?access=`, "m"));
  const token = accessTokenFromEmail(sent[0]);

  // The raw token is never stored; only an unused, future-dated row exists.
  const tokens = db.rows("SELECT token_hash, owner_email, used_at, expires_at FROM access_tokens");
  assert.equal(tokens.length, 1);
  assert.notEqual(tokens[0].token_hash, token);
  assert.equal(tokens[0].owner_email, "owner@example.com");
  assert.equal(tokens[0].used_at, null);

  // The request is also captured as a lead.
  assert.deepEqual(db.rows("SELECT email FROM waitlist_leads"), [{ email: "owner@example.com" }]);

  const verified = await call(env, "/api/access/verify", { method: "POST", body: { token } });
  assert.equal(verified.status, 200, verified.text);
  assert.equal(verified.json.status, "unlocked");
  assert.equal(verified.json.ownerEmail, "owner@example.com");
  assert.equal(verified.json.accessMode, "self-serve");

  const cookie = sessionCookieFrom(verified);
  assert.ok(cookie, "verify should set a session cookie");
  const rawCookie = setCookies(verified).find((value) => value.startsWith("sfk_beta_session="));
  assert.match(rawCookie, /HttpOnly/i);
  assert.match(rawCookie, /Secure/i);
  assert.match(rawCookie, /SameSite=Strict/i);

  const session = await call(env, "/api/beta/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.json.status, "active");
  assert.equal(session.json.ownerEmail, "owner@example.com");
  assert.equal(session.json.accessMode, "self-serve");

  assert.notEqual(db.rows("SELECT used_at FROM access_tokens")[0].used_at, null);
});

test("an access link cannot be used twice", async () => {
  const { env, db, sent } = makeEnv();

  await call(env, "/api/access/request", { method: "POST", body: { email: "owner@example.com" } });
  const token = accessTokenFromEmail(sent[0]);

  const first = await call(env, "/api/access/verify", { method: "POST", body: { token } });
  assert.equal(first.status, 200);

  const replay = await call(env, "/api/access/verify", { method: "POST", body: { token } });
  assert.equal(replay.status, 401);
  assert.match(replay.json.error, /expired or was already used/i);
  assert.equal(sessionCookieFrom(replay), null);

  assert.equal(db.rows("SELECT * FROM beta_sessions").length, 1);
});

test("an expired access link is rejected and creates no session", async () => {
  const { env, db, sent } = makeEnv();

  await call(env, "/api/access/request", { method: "POST", body: { email: "owner@example.com" } });
  const token = accessTokenFromEmail(sent[0]);
  await db
    .prepare("UPDATE access_tokens SET expires_at = ?")
    .bind(new Date(Date.now() - 60_000).toISOString())
    .run();

  const verified = await call(env, "/api/access/verify", { method: "POST", body: { token } });
  assert.equal(verified.status, 401);
  assert.match(verified.json.error, /expired or was already used/i);
  assert.equal(sessionCookieFrom(verified), null);
  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

test("unknown or malformed access tokens are rejected", async () => {
  const { env, db } = makeEnv();

  const unknown = await call(env, "/api/access/verify", { method: "POST", body: { token: "a".repeat(64) } });
  assert.equal(unknown.status, 401);

  const malformed = await call(env, "/api/access/verify", { method: "POST", body: { token: "short" } });
  assert.equal(malformed.status, 400);

  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

test("access link request fails closed when email is not configured and leaves no usable token", async () => {
  const { env, db } = makeEnv({ EMAIL: undefined });

  const response = await call(env, "/api/access/request", { method: "POST", body: { email: "owner@example.com" } });
  assert.equal(response.status, 503);
  assert.deepEqual(db.rows("SELECT * FROM access_tokens"), []);
});

test("a failed email send does not leave a live access token behind", async () => {
  const { env, db } = makeEnv({
    EMAIL: {
      async send() {
        throw new Error("Email provider is down.");
      }
    }
  });

  const response = await call(env, "/api/access/request", { method: "POST", body: { email: "owner@example.com" } });
  assert.equal(response.status, 503);
  assert.deepEqual(db.rows("SELECT * FROM access_tokens"), []);
});

// --- Invite code / founder login ---------------------------------------------------

test("an admin-created invite code logs its owner in with an invite session, once", async () => {
  const { env, db } = makeEnv();
  const invite = await adminCreateInvite(env, { email: "guest@example.com", code: "guest-invite-001" });
  assert.equal(invite.ownerEmail, "guest@example.com");

  const stored = db.rows("SELECT owner_email, status, used_count, code_hash FROM beta_invites");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "active");
  assert.notEqual(stored[0].code_hash, "guest-invite-001", "invite codes are stored hashed");

  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "guest@example.com", inviteCode: "guest-invite-001" }
  });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.json.status, "unlocked");
  assert.equal(login.json.accessMode, "invite");
  assert.equal(login.json.inviteId, invite.id);
  const cookie = sessionCookieFrom(login);
  assert.ok(cookie);

  const session = await call(env, "/api/beta/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.json.accessMode, "invite");
  assert.equal(session.json.inviteId, invite.id);
  assert.equal(session.json.ownerEmail, "guest@example.com");

  const used = db.rows("SELECT status, used_count FROM beta_invites")[0];
  assert.deepEqual(used, { status: "used", used_count: 1 });

  // A single-use invite cannot be redeemed again.
  const reuse = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "guest@example.com", inviteCode: "guest-invite-001" }
  });
  assert.equal(reuse.status, 401);
  assert.equal(db.rows("SELECT * FROM beta_sessions").length, 1);
});

test("an invite code only works for the email it was issued to", async () => {
  const { env, db } = makeEnv();
  await adminCreateInvite(env, { email: "guest@example.com", code: "guest-invite-002" });

  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "someone-else@example.com", inviteCode: "guest-invite-002" }
  });
  assert.equal(login.status, 401);
  assert.equal(sessionTokenFrom(sessionCookieFrom(login) || "sfk_beta_session="), "", "no session token is issued");
  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
  assert.equal(db.rows("SELECT used_count FROM beta_invites")[0].used_count, 0);
});

test("an expired invite is rejected", async () => {
  const { env, db } = makeEnv();
  await adminCreateInvite(env, {
    email: "guest@example.com",
    code: "guest-invite-003",
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  });

  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "guest@example.com", inviteCode: "guest-invite-003" }
  });
  assert.equal(login.status, 401);
  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

test("invite creation requires the admin token", async () => {
  const { env, db } = makeEnv();
  const response = await call(env, "/admin/invites", {
    method: "POST",
    body: { email: "guest@example.com", code: "guest-invite-004" },
    headers: { authorization: "Bearer wrong-token" }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(db.rows("SELECT * FROM beta_invites"), []);
});

test("the founder password gives a founder-override session", async () => {
  const { env, db } = makeEnv();

  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "founder@example.com", inviteCode: FOUNDER_PASSWORD }
  });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.json.accessMode, "founder-override");
  assert.equal(login.json.inviteId, null);
  const cookie = sessionCookieFrom(login);
  assert.ok(cookie);

  const session = await call(env, "/api/beta/session", { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.json.accessMode, "founder-override");

  const rows = db.rows("SELECT owner_email, access_mode, token_hash FROM beta_sessions");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_email, "founder@example.com");
  assert.equal(rows[0].access_mode, "founder-override");
  assert.equal(rows[0].token_hash, sha256(sessionTokenFrom(cookie)), "only the session token hash is stored");
});

test("a wrong password or missing code is rejected without a session", async () => {
  const { env, db } = makeEnv();

  const wrong = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "founder@example.com", inviteCode: "definitely-wrong-password" }
  });
  assert.equal(wrong.status, 401);
  assert.ok(wrong.json.error);

  const missing = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "founder@example.com" }
  });
  assert.equal(missing.status, 401);

  const noEmail = await call(env, "/api/beta/login", {
    method: "POST",
    body: { inviteCode: FOUNDER_PASSWORD }
  });
  assert.equal(noEmail.status, 400);

  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

test("the founder password does nothing when it is not configured", async () => {
  const { env, db } = makeEnv({ BETA_ACCESS_PASSWORD: "" });
  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "founder@example.com", inviteCode: FOUNDER_PASSWORD }
  });
  assert.equal(login.status, 401);
  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

// --- Session lifecycle -------------------------------------------------------------

test("logout revokes the session and clears the cookie", async () => {
  const { env, db } = makeEnv();
  const cookie = await founderLogin(env);

  const before = await call(env, "/api/account/summary", { cookie });
  assert.equal(before.status, 200, before.text);

  const logout = await call(env, "/api/beta/logout", { method: "POST", cookie });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.json, { ok: true, status: "locked" });
  const cleared = setCookies(logout).find((value) => value.startsWith("sfk_beta_session="));
  assert.ok(cleared);
  assert.match(cleared, /^sfk_beta_session=;/);
  assert.match(cleared, /Max-Age=0/i);

  assert.notEqual(db.rows("SELECT revoked_at FROM beta_sessions")[0].revoked_at, null);

  // Replaying the old cookie no longer works anywhere.
  const session = await call(env, "/api/beta/session", { cookie });
  assert.equal(session.status, 401);
  const summary = await call(env, "/api/account/summary", { cookie });
  assert.equal(summary.status, 401);
});

test("the x-beta-session header is accepted as an alternative to the cookie", async () => {
  const { env } = makeEnv();
  const cookie = await founderLogin(env);
  const session = await call(env, "/api/beta/session", {
    headers: { "x-beta-session": sessionTokenFrom(cookie) }
  });
  assert.equal(session.status, 200);
  assert.equal(session.json.ownerEmail, "founder@example.com");
});

test("an expired session in beta_sessions is rejected and its cookie cleared", async () => {
  const { env, db } = makeEnv();
  const token = "e".repeat(64);
  const past = new Date(Date.now() - 60_000).toISOString();
  db.insert("beta_sessions", {
    token_hash: sha256(token),
    owner_email: "stale@example.com",
    created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    expires_at: past,
    last_seen_at: past,
    access_mode: "invite"
  });

  const session = await call(env, "/api/beta/session", { cookie: `sfk_beta_session=${token}` });
  assert.equal(session.status, 401);
  assert.match(session.json.error, /expired/i);
  const cleared = setCookies(session).find((value) => value.startsWith("sfk_beta_session="));
  assert.match(cleared, /Max-Age=0/i);

  const summary = await call(env, "/api/account/summary", { cookie: `sfk_beta_session=${token}` });
  assert.equal(summary.status, 401);
});

test("a revoked session in beta_sessions is rejected", async () => {
  const { env, db } = makeEnv();
  const token = "r".repeat(64);
  const now = new Date().toISOString();
  db.insert("beta_sessions", {
    token_hash: sha256(token),
    owner_email: "revoked@example.com",
    created_at: now,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_seen_at: now,
    revoked_at: now,
    access_mode: "invite"
  });

  const session = await call(env, "/api/beta/session", { cookie: `sfk_beta_session=${token}` });
  assert.equal(session.status, 401);
});

test("/api/beta/session without any session is a 401", async () => {
  const { env } = makeEnv();
  const session = await call(env, "/api/beta/session");
  assert.equal(session.status, 401);
  assert.match(session.json.error, /no active session/i);
});

// --- Protected routes --------------------------------------------------------------

test("private routes reject requests without a valid session", async () => {
  const { env } = makeEnv();
  const privateRoutes = [
    ["GET", "/api/account/summary"],
    ["GET", "/api/sites"],
    ["POST", "/api/sites/claim"],
    ["POST", "/api/sites/verify"],
    ["GET", "/api/billing/summary"],
    ["GET", "/api/audit/schedules"],
    ["POST", "/api/audit/schedules"],
    ["GET", "/api/team"],
    ["GET", "/api/developer"]
  ];

  for (const [method, path] of privateRoutes) {
    const body = method === "POST" ? {} : undefined;
    const anonymous = await call(env, path, { method, body });
    assert.equal(anonymous.status, 401, `${method} ${path} without a session`);

    const forged = await call(env, path, { method, body, cookie: `sfk_beta_session=${"f".repeat(64)}` });
    assert.equal(forged.status, 401, `${method} ${path} with an unknown session`);
  }
});

test("a valid session can read its account summary", async () => {
  const { env } = makeEnv();
  const cookie = await founderLogin(env, "owner@example.com");
  const summary = await call(env, "/api/account/summary", { cookie });
  assert.equal(summary.status, 200, summary.text);
  assert.equal(summary.json.ok, true);
});

// --- Rate limiting -----------------------------------------------------------------

test("access link requests are limited to 3 per email per hour", async () => {
  const { env, db, sent } = makeEnv();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await call(env, "/api/access/request", {
      method: "POST",
      body: { email: "limited@example.com" },
      ip: `198.51.100.${attempt}`
    });
    assert.equal(response.status, 200, `attempt ${attempt}`);
  }

  const blocked = await call(env, "/api/access/request", {
    method: "POST",
    body: { email: "limited@example.com" },
    ip: "198.51.100.99"
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.json.error, /too many/i);
  assert.ok(Date.parse(blocked.json.resetAt) > Date.now());
  assert.equal(sent.length, 3, "no email is sent once the limit is hit");
  assert.equal(db.rows("SELECT * FROM access_tokens").length, 3);

  // A different email is unaffected.
  const other = await call(env, "/api/access/request", {
    method: "POST",
    body: { email: "other@example.com" },
    ip: "198.51.100.100"
  });
  assert.equal(other.status, 200);
});

test("access link requests are limited to 8 per network per hour", async () => {
  const { env, sent } = makeEnv();

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await call(env, "/api/access/request", {
      method: "POST",
      body: { email: `person${attempt}@example.com` },
      ip: "192.0.2.50"
    });
    assert.equal(response.status, 200, `attempt ${attempt}`);
  }

  const blocked = await call(env, "/api/access/request", {
    method: "POST",
    body: { email: "person9@example.com" },
    ip: "192.0.2.50"
  });
  assert.equal(blocked.status, 429);
  assert.equal(sent.length, 8);

  const elsewhere = await call(env, "/api/access/request", {
    method: "POST",
    body: { email: "person9@example.com" },
    ip: "192.0.2.51"
  });
  assert.equal(elsewhere.status, 200);
});

test("login attempts are limited to 10 per email per hour, even with the right password", async () => {
  const { env, db } = makeEnv();

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await call(env, "/api/beta/login", {
      method: "POST",
      body: { email: "target@example.com", inviteCode: `wrong-password-${attempt}` },
      ip: `198.51.100.${attempt}`
    });
    assert.equal(response.status, 401, `attempt ${attempt}`);
  }

  const blocked = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "target@example.com", inviteCode: FOUNDER_PASSWORD },
    ip: "198.51.100.200"
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.json.error, /too many/i);
  assert.equal(sessionCookieFrom(blocked), null);
  assert.deepEqual(db.rows("SELECT * FROM beta_sessions"), []);
});

test("login attempts are limited to 20 per network per hour", async () => {
  const { env } = makeEnv();

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await call(env, "/api/beta/login", {
      method: "POST",
      body: { email: `user${attempt}@example.com`, inviteCode: `wrong-password-${attempt}` },
      ip: "192.0.2.77"
    });
    assert.equal(response.status, 401, `attempt ${attempt}`);
  }

  const blocked = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "user21@example.com", inviteCode: FOUNDER_PASSWORD },
    ip: "192.0.2.77"
  });
  assert.equal(blocked.status, 429);

  const elsewhere = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "user21@example.com", inviteCode: FOUNDER_PASSWORD },
    ip: "192.0.2.78"
  });
  assert.equal(elsewhere.status, 200);
});

// --- Site claims ---------------------------------------------------------------------

function verifiedClaim(ownerEmail, host) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    owner_email: ownerEmail,
    host,
    verification_token: `sfk-${"a".repeat(64)}`,
    status: "verified",
    verification_method: "dns-txt",
    created_at: now,
    updated_at: now,
    verified_at: now,
    last_checked_at: now
  };
}

test("a site claim is created for the session owner and listed back", async () => {
  const { env, db } = makeEnv();
  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "owner@example.com", inviteCode: FOUNDER_PASSWORD }
  });
  const cookie = sessionCookieFrom(login);

  const claim = await call(env, "/api/sites/claim", {
    method: "POST",
    body: { url: "https://Example.org/some/page" },
    cookie
  });
  assert.equal(claim.status, 200, claim.text);
  assert.equal(claim.json.ok, true);

  const rows = db.rows("SELECT owner_email, host, status FROM site_claims");
  assert.deepEqual(rows, [{ owner_email: "owner@example.com", host: "example.org", status: "pending" }]);

  const again = await call(env, "/api/sites/claim", { method: "POST", body: { host: "example.org" }, cookie });
  assert.equal(again.status, 200);
  assert.equal(db.rows("SELECT * FROM site_claims").length, 1, "claiming the same host twice is deduped");

  const list = await call(env, "/api/sites", { cookie });
  assert.equal(list.status, 200);
  assert.equal(list.json.sites.length, 1);
});

test("a verified apex-domain claim also authorizes the www host, and vice versa", async () => {
  const { env, db } = makeEnv();
  db.insert("site_claims", verifiedClaim("owner@example.com", "example.org"));
  db.insert("site_claims", verifiedClaim("owner@example.com", "www.example.net"));
  const access = { ok: true, ownerEmail: "owner@example.com", accessMode: "invite" };

  assert.equal((await auditAuthorizationStatus(env, access, "https://example.org/")).ok, true);
  assert.equal((await auditAuthorizationStatus(env, access, "https://www.example.org/pricing")).ok, true);
  assert.equal((await auditAuthorizationStatus(env, access, "https://example.net/")).ok, true);

  const unrelated = await auditAuthorizationStatus(env, access, "https://shop.example.org/");
  assert.equal(unrelated.ok, false);
  assert.equal(unrelated.status, 403);
  assert.equal(unrelated.code, "SITE_VERIFICATION_REQUIRED");

  const otherOwner = await auditAuthorizationStatus(
    env,
    { ok: true, ownerEmail: "intruder@example.com", accessMode: "invite" },
    "https://www.example.org/"
  );
  assert.equal(otherOwner.ok, false);
  assert.equal(otherOwner.code, "SITE_VERIFICATION_REQUIRED");
});

test("a pending or revoked apex claim does not authorize www", async () => {
  const { env, db } = makeEnv();
  db.insert("site_claims", {
    ...verifiedClaim("owner@example.com", "example.org"),
    status: "pending",
    verified_at: null
  });
  db.insert("site_claims", {
    ...verifiedClaim("owner@example.com", "example.net"),
    revoked_at: new Date().toISOString()
  });
  const access = { ok: true, ownerEmail: "owner@example.com", accessMode: "invite" };

  assert.equal((await auditAuthorizationStatus(env, access, "https://www.example.org/")).ok, false);
  assert.equal((await auditAuthorizationStatus(env, access, "https://www.example.net/")).ok, false);
});

test("through the API, an apex claim lets an invite session schedule audits on www", async () => {
  const { env, db } = makeEnv();
  const invite = await adminCreateInvite(env, { email: "owner@example.com", code: "owner-invite-001" });
  const login = await call(env, "/api/beta/login", {
    method: "POST",
    body: { email: "owner@example.com", inviteCode: invite.code }
  });
  assert.equal(login.status, 200, login.text);
  const cookie = sessionCookieFrom(login);

  const unverified = await call(env, "/api/audit/schedules", {
    method: "POST",
    body: { url: "https://www.example.org/" },
    cookie
  });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.json.code, "SITE_VERIFICATION_REQUIRED");

  db.insert("site_claims", verifiedClaim("owner@example.com", "example.org"));

  const verified = await call(env, "/api/audit/schedules", {
    method: "POST",
    body: { url: "https://www.example.org/" },
    cookie
  });
  assert.equal(verified.status, 200, verified.text);
  assert.equal(verified.json.ok, true);
  assert.deepEqual(db.rows("SELECT owner_email, target_host FROM audit_schedules"), [
    { owner_email: "owner@example.com", target_host: "www.example.org" }
  ]);
});
