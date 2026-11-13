import assert from "node:assert/strict";
import test from "node:test";
import { FIX_FOR_ME_CONSENT_TEXT, fixForMeQueueMessage, normalizeFixForMeRequest } from "./fix-for-me.js";

test("the queue message carries site, email, reportId and the consent line", () => {
  const message = fixForMeQueueMessage({ site: "https://example.com/", email: "owner@example.com", reportId: "rep_1" });
  assert.deepEqual(Object.keys(message).sort(), ["consentText", "email", "reportId", "site"]);
  assert.equal(message.site, "https://example.com/");
  assert.equal(message.email, "owner@example.com");
  assert.equal(message.reportId, "rep_1");
  assert.equal(message.consentText, FIX_FOR_ME_CONSENT_TEXT);
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
