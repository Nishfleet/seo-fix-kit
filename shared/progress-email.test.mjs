import assert from "node:assert/strict";
import test from "node:test";
import { buildProgressEmail } from "./progress-email.js";

const ready = (summary, extra = {}) => ({
  status: "ready",
  summary: { scoreBefore: 80, scoreNow: 80, scoreDelta: 0, fixedIssuesCount: 0, newIssuesCount: 0, issuesNow: 2, ...summary },
  fixedIssues: [],
  newIssues: [],
  ...extra
});

test("no email on a first run", () => {
  assert.equal(buildProgressEmail({ delta: { status: "first_run" } }), null);
});

test("celebrates confirmed fixes", () => {
  const mail = buildProgressEmail({
    host: "a.com",
    reportUrl: "https://seofixkit.com/beta/reports/x",
    delta: ready({ scoreNow: 90, scoreDelta: 10, fixedIssuesCount: 2 }, { fixedIssues: [{ title: "Missing <title>" }] })
  });
  assert.match(mail.subject, /2 fixes confirmed, score up 10/);
  assert.match(mail.html, /Missing &lt;title&gt;/);
  assert.match(mail.text, /beta\/reports\/x/);
});

test("flags new problems and clean checks", () => {
  assert.match(buildProgressEmail({ host: "a.com", delta: ready({ newIssuesCount: 1 }) }).subject, /1 new problem/);
  assert.match(buildProgressEmail({ host: "a.com", delta: ready({ issuesNow: 0 }) }).subject, /clean check/);
});
