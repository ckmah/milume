import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assignShards } from "./lib/e2e-shard-plan.mjs";
import { mergeabilityError } from "./lib/pr-mergeable.mjs";
import { validateUiPullRequest } from "./lib/pr-policy.mjs";
import { validateWidgetIssueBody } from "./lib/widget-issue.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scripts, "..", "..");

function run(script, args) {
  return spawnSync("node", [join(scripts, script), ...args], { encoding: "utf8" });
}

test("mergeabilityError flags conflicting PRs like #121 and #132", () => {
  const msg = mergeabilityError({ mergeable: false, mergeableState: "dirty" });
  assert.match(msg, /conflict/i);
  assert.match(msg, /skip/i);
  assert.equal(mergeabilityError({ mergeable: true, mergeableState: "clean" }), null);
});

test("AGENTS.md documents babysit stop rule and HF fixture policy", () => {
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  assert.match(agents, /gh-ci-watch/);
  assert.match(agents, /check:pr-mergeable/);
  assert.match(agents, /colon_a2/);
  assert.match(agents, /volume-xsmall-if-missing/);
});

test("verify-landmarks skill documents harness-first verification and marimo API scope", () => {
  const skill = readFileSync(join(repoRoot, ".agents/skills/verify-landmarks/SKILL.md"), "utf8");
  assert.match(skill, /gh-ci-watch/);
  assert.match(skill, /ERR_CONNECTION_REFUSED/);
  assert.match(skill, /UI PRs do not require marimo/);
  assert.match(skill, /test:e2e:marimo-api/);
});

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

test("volume e2e LPT sharding spreads the two slowest pans across shards", () => {
  const weights = { defaultWeight: 1, durations: { a: 100, b: 100, c: 1, d: 1, e: 1 } };
  const tests = [
    { title: "a", line: 1 },
    { title: "b", line: 2 },
    { title: "c", line: 3 },
    { title: "d", line: 4 },
    { title: "e", line: 5 },
  ];
  const buckets = assignShards(tests, 3, weights);
  const shardOf = (line) => buckets.findIndex((b) => b.some((t) => t.line === line)) + 1;
  assert.notEqual(shardOf(1), shardOf(2));
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

test("linked CI tracking issue #128 skips widget-issue template", () => {
  const errors = validateUiPullRequest({
    body: "Closes #128\n\n![x](https://example.com/x.png)\n",
    changedPaths: ["frontend/e2e/landmarks/landmarks-volume.spec.ts"],
    isDraft: false,
    issueBodies: {
      128: "## Outcome\n\nCI work.\n\n## Visual acceptance\n\nN/A\n",
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

test("PR into a feat/* base may say Part of #N instead of Closes", () => {
  const pr = {
    body: "Part of #241\n\n![x](https://example.com/x.png)\n",
    changedPaths: ["frontend/src/widgets/landmarks/gene-store.js"],
    isDraft: false,
  };
  assert.deepEqual(validateUiPullRequest({ ...pr, baseRef: "feat/lazy-genes" }), []);
  assert.ok(validateUiPullRequest({ ...pr, baseRef: "main" }).some((e) => e.includes("Closes #N")));
  assert.ok(validateUiPullRequest(pr).some((e) => e.includes("Closes #N")));
});

test("PR into a feat/* base still needs visuals when ready", () => {
  const errors = validateUiPullRequest({
    body: "Part of #241\n",
    changedPaths: ["frontend/src/widgets/landmarks/gene-store.js"],
    isDraft: false,
    baseRef: "feat/lazy-genes",
  });
  assert.ok(errors.some((e) => e.includes("screenshots or video")));
});
