// Runs the verification this change set needs: `git diff` -> tiers -> legs -> `verify`
// commands, all from .github/e2e-tiers.json (the same file CI's legs come from).
//   npm run verify                 # base = merge-base with origin/main
//   npm run verify -- --base HEAD~3
//   npm run verify -- --dry-run    # print the plan only
//   npm run verify -- --full-volume  # full cube spec on Linux too (or MILUME_E2E_FULL_VOLUME=1)
// Stops after 15 min of wall clock with the step that hung (MILUME_VERIFY_TIMEOUT_MIN overrides; 0 = off).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCiConfig, selectLegs, tiersHit, verifyPlan } from "./lib/ci-legs.mjs";
import { molabPathsHit } from "./lib/e2e-scope.mjs";
import { runPlan, verifyTimeoutMs } from "./lib/verify-run.mjs";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(frontend, "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
// Playwright enables a GPU only on macOS (playwright.config.ts), so Linux renders the cube on
// SwiftShader. There the full cube spec runs on CI's four shards and locally runs as its smoke spec.
const fullVolume =
  args.includes("--full-volume") ||
  process.env.MILUME_E2E_FULL_VOLUME === "1" ||
  process.platform !== "linux";
const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const lines = (s) => (s ? s.split("\n") : []);
const base = git("merge-base", baseArg, "HEAD");
const changed = new Set([
  ...lines(git("diff", "--name-only", base)),
  ...lines(git("ls-files", "-o", "--exclude-standard")),
]);

const config = loadCiConfig(root);
const legs = selectLegs(config, tiersHit(config, [...changed]));
const scope = JSON.parse(readFileSync(join(frontend, "e2e", "e2e-scope.json"), "utf8"));
const molabHit = molabPathsHit([...changed], scope);
const plan = verifyPlan(config, legs, { fullVolume });

console.log(`base ${base.slice(0, 8)}, ${changed.size} changed file(s)`);
if (!plan.length) console.log("docs / non-runtime only: nothing to run beyond CI.");
for (const [cwd, cmd] of plan) console.log(`  ${cwd}: ${cmd}`);
if (molabHit.length) {
  console.log(`molab paths touched (${molabHit.join(", ")}): the landmarks run includes`);
  for (const spec of scope.molab.specs) console.log(`  ${spec}`);
}
if (legs.landmarks) {
  if (!fullVolume) {
    console.log("software GL: cube smoke spec only; --full-volume or the run-volume-full PR label runs all of it.");
  }
  console.log(
    "landmarks surface touched: also match .agents/skills/verify-landmarks/features/ proof criteria\n" +
      "and update the map when adding coverage.",
  );
}
if (dry) process.exit(0);

const r = await runPlan(
  plan.map(([cwd, cmd, leg]) => [join(root, cwd), cmd, leg]),
  { budgetMs: verifyTimeoutMs() },
);
if (r.message) console.error(`\n${r.message}`);
process.exit(r.status);
