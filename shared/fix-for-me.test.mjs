import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  FIX_FOR_ME_CONSENT_TEXT,
  normalizeFixForMeRequest,
  tinyStudioRequestBody,
  tinyStudioSignatureHeaders,
  TINY_STUDIO_REQUEST_PATH,
  TINY_STUDIO_REQUEST_URL
} from "./fix-for-me.js";

const SECRET = "test-secret";

test("the contract points at TinyStudio's queue endpoint", () => {
  assert.equal(TINY_STUDIO_REQUEST_URL, "https://tinystudio.io/api/requests/from-seofixkit");
  assert.equal(TINY_STUDIO_REQUEST_PATH, "/api/requests/from-seofixkit");
});

test("the request body carries site, email, reportId and the consent line", () => {
  const body = JSON.parse(
    tinyStudioRequestBody({ site: "https://example.com/", email: "owner@example.com", reportId: "rep_1" })
  );
  assert.deepEqual(Object.keys(body).sort(), ["consentText", "email", "reportId", "site"]);
  assert.equal(body.site, "https://example.com/");
  assert.equal(body.email, "owner@example.com");
  assert.equal(body.reportId, "rep_1");
  assert.equal(body.consentText, FIX_FOR_ME_CONSENT_TEXT);
});

test("site and email normalize; reportId is optional", () => {
  assert.deepEqual(normalizeFixForMeRequest({ site: "Example.com/about ", email: "Owner@Example.COM " }), {
    ok: true,
    value: { site: "https://example.com/about", email: "owner@example.com", reportId: "" }
  });
  assert.equal(normalizeFixForMeRequest({ site: "not a url at all", email: "a@b.co" }).ok, false);
  assert.equal(normalizeFixForMeRequest({ site: "", email: "a@b.co" }).ok, false);
  assert.equal(normalizeFixForMeRequest({ site: "ftp://example.com", email: "a@b.co" }).ok, false);
  assert.equal(normalizeFixForMeRequest({ site: "example.com", email: "nope" }).ok, false);
  assert.equal(normalizeFixForMeRequest({ site: "example.com", email: "" }).ok, false);
});

test("signature headers follow the <timestamp>.<raw body> HMAC-SHA256 contract", async () => {
  const timestamp = 1762950000;
  const rawBody = tinyStudioRequestBody({ site: "https://example.com/", email: "a@b.co", reportId: "rep_1" });
  const headers = await tinyStudioSignatureHeaders({ secret: SECRET, timestamp, rawBody });
  assert.equal(headers["X-TinyStudio-Timestamp"], "1762950000");
  assert.match(headers["X-TinyStudio-Signature"], /^sha256=[0-9a-f]{64}$/);

  const expected = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  assert.equal(headers["X-TinyStudio-Signature"], `sha256=${expected}`);
});

test("a different timestamp or body changes the signature", async () => {
  const rawBody = '{"site":"https://example.com/"}';
  const a = await tinyStudioSignatureHeaders({ secret: SECRET, timestamp: 1000, rawBody });
  const b = await tinyStudioSignatureHeaders({ secret: SECRET, timestamp: 1001, rawBody });
  const c = await tinyStudioSignatureHeaders({ secret: SECRET, timestamp: 1000, rawBody: "{}" });
  assert.notEqual(a["X-TinyStudio-Signature"], b["X-TinyStudio-Signature"]);
  assert.notEqual(a["X-TinyStudio-Signature"], c["X-TinyStudio-Signature"]);
});

test("a missing secret fails loud instead of sending unsigned", async () => {
  await assert.rejects(
    () => tinyStudioSignatureHeaders({ secret: "", timestamp: 1000, rawBody: "{}" }),
    /SEOFIXKIT_REQUEST_SECRET/
  );
});
