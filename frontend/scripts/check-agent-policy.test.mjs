import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateUiPullRequest } from "./lib/pr-policy.mjs";
import { validateWidgetIssueBody } from "./lib/widget-issue.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));

function run(script, args) {
  return spawnSync("node", [join(scripts, script), ...args], { encoding: "utf8" });
}

test("thin issue #79 empty fails widget-issue check", () => {
  const r = run("check-widget-issue.mjs", ["--fixture", "issue-79-empty"]);
  assert.notEqual(r.status, 0);
});

test("thin issue #77 bullets fail widget-issue check", () => {
  const r = run("check-widget-issue.mjs", ["--fixture", "issue-77-thin"]);
  assert.notEqual(r.status, 0);
});

test("filled issue #79 passes widget-issue check", () => {
  const r = run("check-widget-issue.mjs", ["--fixture", "issue-79-filled"]);
  assert.equal(r.status, 0);
});

test("PR #58 ready without visuals fails pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-58"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /screenshot|visual/i);
});

test("PR #73 without Closes fails pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-73"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Closes/i);
});

test("draft PR #78 without Closes fails pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-78-draft"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Closes/i);
});

test("PR #80 user-attachments pass pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-80-ok"]);
  assert.equal(r.status, 0, r.stderr);
});

test("PR #80 cursor artifact links fail pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-80-cursor-artifact"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /user-attachments/);
});

test("ready PR #78 with only footer badges fails pr-policy", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-78-footer"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /footer badges/);
});

test("linked thin issue fails when PR closes it", () => {
  const errors = validateUiPullRequest({
    body: "Closes #77\n\n![x](https://github.com/user-attachments/assets/59fac573-c139-4015-9f63-dbaa005a14b6)\n",
    changedPaths: ["frontend/src/widgets/volume-cube/cut-plates.tsx"],
    isDraft: false,
    issueBodies: { 77: "- bullets only\n" },
  });
  assert.ok(errors.some((e) => e.includes("linked issue #77")));
});
