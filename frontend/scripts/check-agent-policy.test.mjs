import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("volume e2e heavy pan tests are pinned to different shards", () => {
  const cwd = join(scripts, "..");
  const env = { ...process.env, E2E_HARNESS: "landmarks-volume" };
  const shardHits = [];
  for (let i = 1; i <= 3; i++) {
    const r = spawnSync("node", ["scripts/e2e-shard.mjs", `${i}/3`, "e2e/landmarks/landmarks-volume.spec.ts", "--list"], {
      encoding: "utf8",
      cwd,
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    if (r.stdout.includes("panning clamps")) shardHits.push(i);
    if (r.stdout.includes("Move tool makes a plain drag pan")) shardHits.push(i);
  }
  assert.deepEqual([...new Set(shardHits)].sort(), [1, 2]);
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
