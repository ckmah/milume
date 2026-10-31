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
import { GRANDFATHERED_MANUAL, canonicalTagline, parseShotSpec, shotSpecErrors } from "./lib/shot-spec.mjs";
import { failingTiers, handoffSnapshot, stallVerdict, stalledMarker, watchBody, watchSessions } from "./lib/ci-budget.mjs";
import { runPlan, verifyTimeoutMs } from "./lib/verify-run.mjs";
import { validateUiPullRequest, visualAcceptanceItems } from "./lib/pr-policy.mjs";
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
  assert.match(agents, /stale-prs\.yml/);
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
    body: "Closes #79\n\n## Visual acceptance\n\n- ![points](https://example.com/a.png)\n",
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

test("linked ci-failure-labelled issue with no template sections passes pr-policy", () => {
  const errors = validateUiPullRequest({
    body: "Closes #402\n\n![x](https://example.com/x.png)\n",
    changedPaths: ["frontend/e2e/landmarks/landmarks-volume.spec.ts"],
    isDraft: false,
    issueBodies: { 402: "Nightly run failed: https://github.com/ckmah/milume/actions/runs/1\n" },
    issueLabels: { 402: ["ci-failure"] },
  });
  assert.deepEqual(errors, []);
});

test("linked non-ci-failure issue without template sections still fails pr-policy", () => {
  const errors = validateUiPullRequest({
    body: "Closes #402\n\n![x](https://example.com/x.png)\n",
    changedPaths: ["frontend/e2e/landmarks/landmarks-volume.spec.ts"],
    isDraft: false,
    issueBodies: { 402: "Nightly run failed: https://github.com/ckmah/milume/actions/runs/1\n" },
    issueLabels: { 402: ["bug"] },
  });
  assert.ok(errors.some((e) => e.includes("linked issue #402")));
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

const issue2 =
  "## Outcome\n\nx\n\n## Acceptance\n\n- [ ] y\n\n## Visual acceptance\n\n- Uncut Top matches main\n- Z-cut Side shows rims\n\n## Notes\n\n- not an item\n";
const ready = (body, extra = {}) =>
  validateUiPullRequest({
    body,
    changedPaths: ["frontend/src/widgets/volume-cube/cut-plates.tsx"],
    isDraft: false,
    issueBodies: { 5: issue2 },
    ...extra,
  });

test("replaying #120 against #117 names the unsatisfied Visual acceptance item", () => {
  const r = run("check-pr-policy.mjs", ["--fixture", "pr-120-replay"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /#117/);
  assert.match(r.stderr, /item 1: "Before\/after screenshots on Pyxa small or colon A2/);
});

test("visualAcceptanceItems reads list entries, else paragraphs, and skips N/A", () => {
  assert.deepEqual(visualAcceptanceItems(issue2), ["Uncut Top matches main", "Z-cut Side shows rims"]);
  assert.deepEqual(visualAcceptanceItems("## Visual acceptance\nOne paragraph\nwrapped.\n\nSecond.\n"), [
    "One paragraph\nwrapped.",
    "Second.",
  ]);
  assert.deepEqual(visualAcceptanceItems("## Visual acceptance\n\nN/A\n"), []);
  // #182: an example shot under a paragraph is part of that item, not a second one.
  assert.equal(visualAcceptanceItems("## Visual acceptance\n\nHero shows the h1:\n\n![hero](https://x/h.png)\n").length, 1);
});

test("a ready UI PR missing evidence for one item fails and names it", () => {
  const errors = ready("Closes #5\n\n## Visual acceptance\n\n- ![top](https://x/a.png)\n- rims look right\n");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /item 2 .*"Z-cut Side shows rims"/);
  const short = ready("Closes #5\n\n## Visual acceptance\n\n- ![top](https://x/a.png)\n");
  assert.match(short.join("\n"), /item 2 has no entry: "Z-cut Side shows rims"/);
});

test("per-item entries pass with media or N/A: <reason>, nested lines included", () => {
  const body =
    "Closes #5\n\n## Visual acceptance\n\n1. Uncut Top\n   ![top](https://x/a.png)\n2. N/A: covered by the Playwright Z-cut snapshot\n";
  assert.deepEqual(ready(body), []);
  assert.match(ready(body.replace("N/A: covered by the Playwright Z-cut snapshot", "N/A")).join(), /item 2/);
});

test("a body-wide screenshot no longer satisfies the per-item gate", () => {
  assert.match(ready("Closes #5\n\n![x](https://x/a.png)\n").join(), /no "Visual acceptance" section for #5/);
});

test("per-issue Visual acceptance headings map to their issue", () => {
  const errors = ready(
    "Closes #5, closes #6\n\n### Visual acceptance (#6)\n\n- ![b](https://x/b.png)\n\n### Visual acceptance (#5)\n\n- ![a](https://x/a.png)\n- ![c](https://x/c.png)\n",
    { issueBodies: { 5: issue2, 6: issue2.replace("- Z-cut Side shows rims\n", "") } },
  );
  assert.deepEqual(errors, []);
});

test("drafts and non-UI PRs without ui-evidence are not gated; the label opts in", () => {
  assert.deepEqual(ready("Closes #5\n", { isDraft: true }), []);
  const docs = { changedPaths: ["docs/publishing.md"] };
  assert.deepEqual(ready("Closes #5\n", docs), []);
  assert.match(ready("Closes #5\n", { ...docs, labels: ["ui-evidence"] }).join(), /Visual acceptance/);
});

const config = loadCiConfig(repoRoot);
const legsFor = (files) => selectLegs(config, tiersHit(config, files));
const on = (legs) => Object.keys(legs).filter((k) => legs[k]).sort();

test("milume/landmarks.py alone builds the wheel (no Python-only shortcut)", () => {
  const legs = legsFor(["milume/landmarks.py"]);
  assert.equal(legs.ci_uv_build, true);
  assert.equal(legs.ci_pytest, true);
});

test("docs-only diffs select no legs", () => {
  assert.deepEqual(on(legsFor(["docs/publishing.md", "README.md", "website/index.md"])), []);
});

test("ci_python tier matches pytest inputs and ignores unrelated docs paths", () => {
  const hit = (file) => tiersHit(config, [file]).has("ci_python");
  assert.equal(hit("demos/data/ileum.h5ad"), true);
  assert.equal(hit("demos/loaders/demo_tiers.py"), true);
  assert.equal(hit("demos/recipes/squidpy_color.py"), true);
  assert.equal(hit("demos/landmarks.py"), true);
  assert.equal(hit("scripts/public_api.py"), true);
  assert.equal(hit("milume/landmarks.py"), true);
  assert.equal(hit("tests/test_demo_tiers.py"), true);
  assert.equal(hit("website/content/x.md"), false);

  assert.equal(legsFor(["demos/data/ileum.h5ad"]).ci_pytest, true);
  assert.equal(legsFor(["milume/landmarks.py"]).ci_pytest, true);
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

const shotSpecMd = readFileSync(join(repoRoot, "docs", "montage", "shot-spec.md"), "utf8");
const tagline = canonicalTagline(readFileSync(join(repoRoot, "website", "landing", "index.html"), "utf8"));
const specCtx = { tagline, root: repoRoot };

test("check:shot-spec passes on the repo and covers the shipped montage", () => {
  const r = run("check-shot-spec.mjs", []);
  assert.equal(r.status, 0, r.stderr);
  const ids = parseShotSpec(shotSpecMd).rows.map((x) => x.id);
  assert.deepEqual(ids, ["title", "peek", "spline-buffer", "distances", "probe", "knn", "inspect-zcut", "end"]);
});

test("check:shot-spec fails a tagline caption that drifts from the landing <h1>", () => {
  const drifted = shotSpecMd.replace(
    "| Explore spatial biology in your notebook. | tagline | manual: end card",
    "| Explore spatial data in your notebook. | tagline | manual: end card",
  );
  assert.notEqual(drifted, shotSpecMd);
  const errors = shotSpecErrors(drifted, specCtx);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\(end\): tagline caption "Explore spatial data in your notebook\." doesn't match the landing <h1>/);
});

test("check:shot-spec checks schema and that capture scripts exist", () => {
  const row = (cells) => `## Shots\n\n| id | dataset | setup | duration_s | caption | caption_kind | capture | status | owner |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| ${cells} |\n`;
  assert.deepEqual(shotSpecErrors(row("a | colon_a2 | s | 2 | x | feature | frontend/scripts/hero-record.mjs | planned | Developer"), specCtx), []);
  const bad = shotSpecErrors(row("Bad_Id | mouse | s | 0 | x | feature | scripts/nope.mjs | done | Bob"), specCtx);
  for (const want of [/kebab-case/, /dataset/, /duration_s/, /`scripts\/nope\.mjs` doesn't exist/, /status/, /owner/]) {
    assert.ok(bad.some((e) => want.test(e)), `expected ${want}`);
  }
  assert.match(shotSpecErrors("## Shots\n\n| id | caption |\n| --- | --- |\n| a | b |\n", specCtx).join(), /columns must be/);
});

const HOUR = 3.6e6;
const now = Date.parse("2026-10-22T12:00:00Z");
const stalePr = (over = {}) => ({
  head: "cursor/fix-thing-ab12",
  draft: false,
  sha: "abc1234def",
  lastPushAt: new Date(now - 7 * HOUR).toISOString(),
  checks: [{ name: "e2e-landmarks (default)", bucket: "fail" }],
  comments: [],
  ...over,
});

test("stale-PR verdict flags a red bot PR idle past 6 h, once per head SHA", () => {
  assert.equal(stallVerdict(stalePr(), { now }).stalled, true);
  assert.equal(stallVerdict(stalePr({ checks: [{ name: "gate", bucket: "pending" }] }), { now }).stalled, true);
  const flagged = stalePr({ comments: [{ body: `${stalledMarker("abc1234def")}\nstalled` }] });
  assert.equal(stallVerdict(flagged, { now }).stalled, false);
  assert.equal(stallVerdict({ ...flagged, sha: "new5678" }, { now }).stalled, true);
});

test("stale-PR verdict ignores drafts, human branches, green CI and recent pushes", () => {
  assert.equal(stallVerdict(stalePr({ draft: true }), { now }).reason, "draft");
  assert.equal(stallVerdict(stalePr({ head: "feat/lazy-genes" }), { now }).reason, "human branch");
  assert.equal(stallVerdict(stalePr({ head: "visual-acceptance-gate" }), { now }).reason, "human branch");
  assert.equal(stallVerdict(stalePr({ checks: [{ name: "gate", bucket: "pass" }] }), { now }).reason, "CI green");
  assert.equal(stallVerdict(stalePr({ lastPushAt: new Date(now - 2 * HOUR).toISOString() }), { now }).stalled, false);
});

test("hand-off snapshot names the failing tier and conflict status", () => {
  const checks = [
    { name: "e2e-landmarks (default)", bucket: "fail", link: "https://x/1" },
    { name: "mystery", bucket: "fail" },
    { name: "test", bucket: "pass" },
  ];
  assert.deepEqual(failingTiers(checks, config), ["landmarks", "mystery"]);
  const snap = handoffSnapshot({ sha: "abc1234def", checks, conflicting: false, config });
  assert.match(snap, /CI \*\*fail\*\*; conflicts: none; failing tier: `landmarks`, `mystery`/);
  assert.match(snap, /\| e2e-landmarks \(default\) \| fail \| \[log\]\(https:\/\/x\/1\) \|/);
  assert.doesNotMatch(snap, /\| test \|/);
});

test("gh-ci-watch session budget: 3 per head SHA, a new head resets", () => {
  let comments = [];
  for (let i = 1; i <= 3; i++) {
    const { comment, sessions } = watchSessions(comments, "sha1");
    assert.equal(sessions, i - 1);
    comments = [{ id: 1, body: watchBody("sha1", sessions + 1) }];
    assert.ok(comment === null || comment.id === 1);
  }
  assert.equal(watchSessions(comments, "sha1").sessions, 3); // the 4th call refuses (sessions >= 3)
  assert.equal(watchSessions(comments, "sha2").sessions, 0);
});

test("verify wall-clock cap stops a hanging step and names it", async () => {
  const lines = [];
  const r = await runPlan(
    [
      [repoRoot, "node -e 0", "policy"],
      [repoRoot, "node -e 'setInterval(() => {}, 1000)'", "landmarks"],
      [repoRoot, "node -e 0", "never-runs"],
    ],
    { budgetMs: 1500, stdio: "ignore", log: (s) => lines.push(s) },
  );
  assert.equal(r.status, 124);
  assert.match(r.message, /cap of 0m02s hit while running `node -e 'setInterval/);
  assert.match(r.message, /leg `landmarks`/);
  assert.equal(lines.length, 2); // the third step never starts
  assert.equal((await runPlan([[repoRoot, "node -e 0", "x"]], { budgetMs: 5000, stdio: "ignore", log: () => {} })).status, 0);
  assert.equal(verifyTimeoutMs({}), 15 * 60_000);
  assert.equal(verifyTimeoutMs({ MILUME_VERIFY_TIMEOUT_MIN: "30" }), 30 * 60_000);
  assert.equal(verifyTimeoutMs({ MILUME_VERIFY_TIMEOUT_MIN: "0" }), Infinity);
});

test("check:widget-design-tokens rejects banned slate/cyan literals", () => {
  const r = run("check-widget-design-tokens.mjs", []);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("check:shot-spec: new or re-shot rows need a capture script or N/A: <reason>", () => {
  const row = (cells) =>
    `## Shots\n\n| id | dataset | setup | duration_s | caption | caption_kind | capture | status | owner |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| ${cells} |\n`;
  const errs = (cells) => shotSpecErrors(row(cells), specCtx).join("\n");
  assert.match(errs("new-shot | colon_a2 | s | 2 | x | feature | manual: Cap | planned | Developer"), /need a capture script/);
  assert.match(errs("knn | colon_a2 | s | 2 | x | feature | manual: Cap | spec-done | Designer"), /grandfathered only while status is shipped/);
  assert.equal(errs("knn | colon_a2 | s | 2 | x | feature | manual: Cap | shipped | Developer"), "");
  assert.equal(errs("new-shot | colon_a2 | s | 2 | x | feature | N/A: title card drawn in the editor | planned | Designer"), "");
  assert.match(errs("new-shot | colon_a2 | s | 2 | x | feature | N/A | planned | Designer"), /needs a reason/);
  assert.match(errs("new-shot | colon_a2 | s | 2 | x | feature | frontend/scripts/montage/nope.mjs | planned | Developer"), /`frontend\/scripts\/montage\/nope\.mjs` doesn't exist/);
  assert.match(errs("new-shot | colon_a2 | s | 2 | x | feature | frontend/scripts | planned | Developer"), /doesn't exist/);
  assert.deepEqual([...GRANDFATHERED_MANUAL], parseShotSpec(shotSpecMd).rows.map((r) => r.id));
});
