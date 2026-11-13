import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WF = readFileSync(new URL("../.github/workflows/answer.yml", import.meta.url), "utf8");

const REPO = "Nishfleet/seo-fix-kit";

const gate = () => {
  const body = WF.slice(WF.indexOf("\njobs:\n"));
  const block = body.match(/\n {4}if: >-\n((?: {6}[^\n]*\n)+)/);
  assert.ok(block, "the answer job carries an if: gate");
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
};

const context = (event) => ({
  repository: REPO,
  event_name: event.name,
  "event.workflow_run.conclusion": event.workflow_run?.conclusion,
  "event.workflow_run.event": event.workflow_run?.event,
  "event.workflow_run.head_branch": event.workflow_run?.head_branch,
  "event.workflow_run.head_repository.full_name": event.workflow_run?.head_repository?.full_name
});

const operand = (text, event) => {
  const values = context(event);
  const notEqual = text.match(/^github\.event_name != '([^']*)'$/);
  if (notEqual) return event.name !== notEqual[1];
  const equal = text.match(/^github\.(event\.[a-z_.]+) == '([^']*)'$/);
  if (equal) return values[equal[1]] === equal[2];
  const sameRepo = text.match(/^github\.(event\.[a-z_.]+) == github\.repository$/);
  if (sameRepo) return values[sameRepo[1]] === values.repository;
  const startsWith = text.match(/^startsWith\(github\.(event\.[a-z_.]+), '([^']*)'\)$/);
  if (startsWith) return String(values[startsWith[1]] ?? "").startsWith(startsWith[2]);
  assert.fail(`the gate reads an expression this test does not model: ${text}`);
};

const startsTheLane = (event) => {
  const groups = gate()
    .split("||")
    .map((group) => {
      const trimmed = group.trim();
      const bare = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
      return bare.split("&&").map((part) => part.trim());
    });
  return groups.some((group) => group.every((part) => operand(part, event)));
};

const redOnAgentHead = (over = {}) => ({
  name: "workflow_run",
  workflow_run: {
    conclusion: "failure",
    event: "pull_request",
    head_branch: "agent/issue-438",
    head_repository: { full_name: REPO },
    ...over
  }
});

test("the answer job gates the workflow_run trigger on the conditions the fleet-ops hop keeps", () => {
  const text = gate();
  for (const condition of [
    "github.event_name != 'workflow_run'",
    "github.event.workflow_run.conclusion == 'failure'",
    "github.event.workflow_run.event == 'pull_request'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
    "startsWith(github.event.workflow_run.head_branch, 'agent/issue-')"
  ])
    assert.ok(text.includes(condition), `the gate names ${condition}`);
});

test("a red CI run on an agent/issue-* head starts the lane", () => {
  assert.equal(startsTheLane(redOnAgentHead()), true);
});

test("a green CI run starts nothing", () => {
  assert.equal(startsTheLane(redOnAgentHead({ conclusion: "success" })), false);
});

test("a cancelled CI run starts nothing", () => {
  assert.equal(startsTheLane(redOnAgentHead({ conclusion: "cancelled" })), false);
});

test("a red CI run on another branch starts nothing", () => {
  assert.equal(startsTheLane(redOnAgentHead({ head_branch: "main" })), false);
});

test("a red CI run on a fork starts nothing", () => {
  assert.equal(startsTheLane(redOnAgentHead({ head_repository: { full_name: "someone/else" } })), false);
});

test("a red CI run of another trigger on an agent/issue-* head starts nothing", () => {
  assert.equal(startsTheLane(redOnAgentHead({ event: "push" })), false);
});

test("a review round still starts the lane", () => {
  assert.equal(startsTheLane({ name: "pull_request_review" }), true);
});
