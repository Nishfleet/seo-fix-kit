import assert from "node:assert/strict";
import test from "node:test";
import { emailButton } from "../../shared/email-layout.js";
import { sendWorkerEmail, shouldSkipOwnedInternalEmail } from "./email.js";

function fakeEmailEnv(overrides = {}) {
  const sent = [];
  return {
    env: {
      INTERNAL_EMAIL_TOKEN: "internal-token",
      SEOFIXKIT_EMAIL_FROM: "support@seofixkit.com",
      EMAIL: {
        async send(payload) {
          sent.push(payload);
          return { messageId: "message-1" };
        }
      },
      ...overrides
    },
    sent
  };
}

test("same-domain fix pack admin emails are skipped at the source", async () => {
  const { env } = fakeEmailEnv();

  assert.equal(
    shouldSkipOwnedInternalEmail(env, {
      to: "support@seofixkit.com",
      tag: "fix-pack-payment"
    }),
    true
  );
});

test("same-domain repair sprint admin emails are skipped at the source", async () => {
  const { env } = fakeEmailEnv();

  assert.equal(
    shouldSkipOwnedInternalEmail(env, {
      to: "support@seofixkit.com",
      tag: "repair-sprint-payment"
    }),
    true
  );
});

test("cross-owned ops emails are skipped at the source", async () => {
  const { env } = fakeEmailEnv({
    INTERNAL_EMAIL_DOMAINS: "seofixkit.com,tinystudio.io"
  });

  assert.equal(
    shouldSkipOwnedInternalEmail(env, {
      to: "hello@tinystudio.io",
      tag: "ops-digest"
    }),
    true
  );
});

test("external fix pack customer emails do not carry the internal inbox marker", async () => {
  const { env, sent } = fakeEmailEnv();

  await sendWorkerEmail(env, {
    to: "customer@example.com",
    subject: "Payment received: Fix Pack for example.com",
    text: "Payment confirmed.",
    html: "<p>Payment confirmed.</p>",
    tag: "fix-pack-payment"
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["X-SEOFIXKIT-Tag"], "fix-pack-payment");
  assert.equal(sent[0].headers["X-Nish-Internal-Email"], undefined);
  assert.equal(
    shouldSkipOwnedInternalEmail(env, {
      to: "customer@example.com",
      tag: "fix-pack-payment"
    }),
    false
  );
});

test("a configured reply-to goes on the binding field, never on a Reply-To header", async () => {
  const { env, sent } = fakeEmailEnv({ SEOFIXKIT_REPLY_TO: "help@seofixkit.com" });

  await sendWorkerEmail(env, {
    to: "customer@example.com",
    subject: "Payment received: Fix Pack for example.com",
    text: "Payment confirmed.",
    html: "<p>Payment confirmed.</p>",
    tag: "fix-pack-payment"
  });

  assert.equal(sent[0].replyTo, "help@seofixkit.com");
  assert.equal(sent[0].headers?.["Reply-To"], undefined);
});

test("sent HTML is wrapped in the shared layout with preheader, button fallback, and footer", async () => {
  const { env, sent } = fakeEmailEnv();

  await sendWorkerEmail(env, {
    to: "customer@example.com",
    subject: "Your SEO Fix Kit access link",
    text: "Open https://seofixkit.com/x",
    html: `<p>Hello</p>${emailButton("https://seofixkit.com/beta/access?t=a&b=1", "Open SEO Fix Kit")}`,
    preheader: "Your one-time sign-in link",
    tag: "access-link"
  });

  const html = sent[0].html;
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /max-width:560px/);
  assert.match(html, /Your one-time sign-in link/);
  assert.match(html, /<p>Hello<\/p>/);
  assert.match(
    html,
    /<a href="https:\/\/seofixkit\.com\/beta\/access\?t=a&amp;b=1" style="background:#0b0f0d[^"]*">Open SEO Fix Kit<\/a>/
  );
  assert.match(html, /Or paste this link into your browser: https:\/\/seofixkit\.com\/beta\/access\?t=a&amp;b=1/);
  assert.match(html, /support@seofixkit\.com/);
  assert.match(sent[0].text, /Open https:\/\/seofixkit\.com\/x\n\n--\nSEO Fix Kit/, "plain-text part keeps its footer");
});
