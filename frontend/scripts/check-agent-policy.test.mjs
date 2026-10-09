import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assignShards } from "./lib/e2e-shard-plan.mjs";
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

test("volume e2e heavy pan tests are pinned to different shards", () => {
  const weights = JSON.parse(readFileSync(join(scripts, "e2e-shard-weights.json"), "utf8"));
  const tests = [
    { title: "panning clamps the window centre to the volume", line: 1 },
    { title: "the Move tool makes a plain drag pan; the distance scales with the drag", line: 2 },
    { title: "alpha example", line: 3 },
    { title: "beta example", line: 4 },
    { title: "gamma example", line: 5 },
  ];
  const buckets = assignShards(tests, 3, weights);
  const shardOf = (line) => buckets.findIndex((b) => b.some((t) => t.line === line)) + 1;
  assert.notEqual(shardOf(1), shardOf(2));
});

test("e2e-only PR closing a CI issue skips widget-issue and PR visuals", () => {
  const errors = validateUiPullRequest({
    body: "Closes #100\n\nTiming table only.\n",
    changedPaths: ["frontend/e2e/landmarks/landmarks-volume.spec.ts", "frontend/scripts/e2e-shard.mjs"],
    isDraft: false,
    issueBodies: { 100: "### Outcome\n\nx\n\n### Acceptance\n\n- [ ] y\n" },
  });
  assert.deepEqual(errors, []);
});

test("PR #80 with Closes and visuals passes pr-policy", () => {
  const errors = validateUiPullRequest({
    body: "Closes #79\n\n![points](https://example.com/a.png)\n",
    changedPaths: ["frontend/src/widgets/volume-cube/cube-points.ts"],
    isDraft: false,
    issueBodies: {
      79: "## Outcome\n\nx\n\n## Acceptance\n\n- [ ] y\n\n## Visual acceptance\n\nz\n",
    },
  });
  assert.deepEqual(errors, []);
});

test("linked thin issue fails when PR closes it", () => {
  const errors = validateUiPullRequest({
    body: "Closes #77\n\n![x](https://example.com/x.png)\n",
    changedPaths: ["frontend/src/widgets/volume-cube/cut-plates.tsx"],
    isDraft: false,
    issueBodies: { 77: "- bullets only\n" },
  });
  assert.ok(errors.some((e) => e.includes("linked issue #77")));
});
