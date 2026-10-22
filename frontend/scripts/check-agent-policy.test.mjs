import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { closedIssues, linkedIssues, overlapReport, stackErrors } from "./lib/pr-hygiene.mjs";
import { ciLegErrors, loadCiConfig, selectLegs, tiersHit } from "./lib/ci-legs.mjs";
import { unconditionalSkips, uiGestures, unlinkedFlakyEntries, unroutedMolabPaths } from "./lib/e2e-scope.mjs";
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

test("verify-landmarks skill documents the babysit cap and webServer readiness", () => {
  const skill = readFileSync(join(repoRoot, ".agents/skills/verify-landmarks/SKILL.md"), "utf8");
  assert.match(skill, /gh-ci-watch/);
  assert.match(skill, /ERR_CONNECTION_REFUSED/);
});

test("molab specs: unconditional skip/fixme is flagged, conditional skip is not", () => {
  assert.deepEqual(
    unconditionalSkips('test.skip("lasso", async () => {});\ntest.fixme();\ntest.describe.skip("x", () => {});').map(
      (s) => s.call,
    ),
    ["test.skip", "test.fixme", "test.skip"],
  );
  assert.deepEqual(unconditionalSkips('test.skip(browserName === "webkit", "no webgl");'), []);
});

test("molab spec in flaky-registry needs an issue link", () => {
  const specs = ["frontend/e2e/landmarks/landmarks-molab-shadow.spec.ts"];
  const entry = { file: "e2e/landmarks/landmarks-molab-shadow.spec.ts", title: "lasso" };
  assert.equal(unlinkedFlakyEntries({ tests: [entry] }, specs).length, 1);
  assert.equal(unlinkedFlakyEntries({ tests: [{ ...entry, issue: "#258" }] }, specs).length, 0);
  assert.equal(unlinkedFlakyEntries({ tests: [{ ...entry, file: "e2e/landmarks/other.spec.ts" }] }, specs).length, 0);
});

test("molab path outside the landmarks run tiers is unrouted", () => {
  const scope = { molab: { paths: ["frontend/src/widgets/landmarks/**"], runLeg: "landmarks" } };
  const files = ["frontend/src/widgets/landmarks/LandmarksView.tsx"];
  const config = (globs) => ({ tiers: { landmarks: globs }, legs: { landmarks: { tiers: ["landmarks"] } } });
  assert.deepEqual(unroutedMolabPaths(files, scope, config(["frontend/src/widgets/**"])), []);
  assert.deepEqual(unroutedMolabPaths(files, scope, config(["milume/**"])), files);
});

test("marimo e2e rejects UI gestures and keeps kernel probes", () => {
  const gestures = uiGestures("a.spec.ts", 'await page.mouse.move(1, 2);\nawait page.getByRole("button").click();\nawait drawLassoStroke(page, box);\nawait page.keyboard.press("Escape");');
  assert.deepEqual(gestures.map((g) => g.gesture), ["page.mouse", ".click(", "drawLasso*", "keyboard input"]);
  assert.deepEqual(uiGestures("a.spec.ts", 'page.on("console", (msg) => msg.type());\nawait getModel(page, "volume");'), []);
  assert.deepEqual(
    uiGestures("a.spec.ts", "await page.keyboard.press('Enter');", [{ file: "a.spec.ts", text: "press('Enter')", reason: "kernel run" }]),
    [],
  );
});

test("check:e2e-scope passes on the repo", () => {
  const r = run("check-e2e-scope.mjs", ["--no-list"]);
  assert.equal(r.status, 0, r.stderr);
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

const config = loadCiConfig(repoRoot);
const legsFor = (files) => selectLegs(config, tiersHit(config, files));
const on = (legs) => Object.keys(legs).filter((k) => legs[k]).sort();

test("milume/landmarks.py alone builds the wheel (no Python-only shortcut)", () => {
  const legs = legsFor(["milume/landmarks.py"]);
  assert.equal(legs.ci_uv_build, true);
  assert.equal(legs.ci_pytest, true);
});

test("docs-only and demos-only diffs select no legs", () => {
  assert.deepEqual(on(legsFor(["docs/publishing.md", "README.md", "website/index.md"])), []);
  assert.deepEqual(on(legsFor(["demos/pyxa.py"])), []);
});

test("infra_core runs core and keeps landmarks path-gated", () => {
  assert.deepEqual(on(legsFor(["frontend/package.json"])), ["ci_frontend", "ci_uv_build", "core", "ui"]);
  assert.equal(legsFor(["frontend/playwright.config.ts"]).landmarks, true);
});

test("check:ci-legs flags a job gated on a leg the config does not list", () => {
  const yaml = "jobs:\n  extra:\n    if: needs.changes.outputs.core == 'true'\n    runs-on: x\n";
  assert.ok(ciLegErrors(config, { "x.yml": yaml }).some((e) => e.includes("x.yml:extra")));
});

test("check:ci-legs passes on the repo", () => {
  const r = run("check-ci-legs.mjs", []);
  assert.equal(r.status, 0, r.stderr);
});

const hygieneFixture = (name) =>
  JSON.parse(readFileSync(join(scripts, "pr-hygiene-fixtures", `${name}.json`), "utf8"));

test("linkedIssues reads Closes/Fixes/Resolves and Part of; closedIssues skips Part of", () => {
  const body = "Closes #261\nPart of #257\nfixes #9, see #1";
  assert.deepEqual(linkedIssues(body), [9, 257, 261]);
  assert.deepEqual(closedIssues(body), [9, 261]);
});

test("pr-overlap only warns when two PRs share a Part of tracker and files (#274 / #279)", () => {
  const { failures, warnings } = overlapReport(...Object.values(hygieneFixture("tracker-only")));
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /#274 .*links #257 and touches `AGENTS.md`/);
});

test("pr-overlap fails a duplicate (same issue and files) like pyxa #7 / #22, naming the other PR", () => {
  const { failures } = overlapReport(...Object.values(hygieneFixture("duplicate")));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /#7 .*links #6 and touches `demo.py`/);
});

test("pr-overlap only warns on file overlap and ignores shared files like CHANGELOG.md", () => {
  const { failures, warnings } = overlapReport(...Object.values(hygieneFixture("files-only")));
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /#149/);
});

test("pr-stack fails a PR based on another PR's branch (#136 on #135)", () => {
  const errors = stackErrors(...Object.values(hygieneFixture("stacked-on-pr")));
  assert.match(errors.join("\n"), /head of open PR #135/);
});

test("pr-stack fails a PR carrying another open PR's commits (#135 carrying #123)", () => {
  const errors = stackErrors(...Object.values(hygieneFixture("carries-commits")));
  assert.match(errors.join("\n"), /open PR #123/);
});

test("the parent of a stacked PR is not flagged for the child's commits", () => {
  const parent = { number: 279, body: "", base: "main", head: "pr-hygiene", files: [], commits: ["p1"] };
  const child = { number: 284, body: "", base: "main", head: "child", files: [], commits: ["p1", "c1"] };
  assert.deepEqual(stackErrors(parent, [child]), []);
  assert.match(stackErrors(child, [parent]).join("\n"), /open PR #279/);
  const pushedAgain = { ...parent, commits: ["p1", "p2"] };
  const staleChild = { ...child, commits: ["p1", "a1", "c1"] };
  assert.deepEqual(stackErrors(pushedAgain, [staleChild]), []);
});

test("PRs into feat/lazy-genes pass pr-stack and aren't compared with the integration PR", () => {
  const f = hygieneFixture("feat-base");
  assert.deepEqual(stackErrors(f.pr, f.others), []);
  assert.deepEqual(overlapReport(f.pr, f.others), { failures: [], warnings: [] });
});
