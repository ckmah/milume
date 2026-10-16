// Runs the verification this change set needs, chosen from `git diff` against the
// tier map in .github/e2e-tiers.json (the same file CI's path filter reads).
//   npm run verify                 # base = merge-base with origin/main
//   npm run verify -- --base HEAD~3
//   npm run verify -- --dry-run    # print the plan only
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(frontend, "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const lines = (s) => (s ? s.split("\n") : []);
const base = git("merge-base", baseArg, "HEAD");
const changed = new Set([
  ...lines(git("diff", "--name-only", base)),
  ...lines(git("ls-files", "-o", "--exclude-standard")),
]);

const tiers = JSON.parse(readFileSync(join(root, ".github", "e2e-tiers.json"), "utf8"));
const hit = Object.fromEntries(
  Object.entries(tiers).map(([name, globs]) => [
    name,
    [...changed].some((f) => globs.some((g) => matchesGlob(f, g))),
  ]),
);
const frontendChanged = [...changed].some((f) => f.startsWith("frontend/"));

const plan = [];
if (frontendChanged) {
  plan.push(["frontend", "npm run check:chrome"], ["frontend", "npm run typecheck"]);
}
if (hit.python) plan.push([".", "uv run pytest"]);
if (hit.core || hit.infra_full || hit.infra_core) plan.push(["frontend", "npm run test:e2e:core"]);
if (hit.landmarks || hit.infra_full) {
  plan.push(["frontend", "npm run test:unit"]);
  plan.push(["frontend", "npm run test:e2e:landmarks"]);
}

console.log(`base ${base.slice(0, 8)}, ${changed.size} changed file(s)`);
if (!plan.length) console.log("docs / non-runtime only: nothing to run beyond CI.");
for (const [cwd, cmd] of plan) console.log(`  ${cwd}: ${cmd}`);
if (hit.landmarks || hit.infra_full) {
  console.log(
    "landmarks surface touched: also match .agents/skills/verify-landmarks/features/ proof criteria\n" +
      "and update the map when adding coverage.",
  );
}
if (dry) process.exit(0);

for (const [cwd, cmd] of plan) {
  console.log(`\n$ ${cmd}`);
  const r = spawnSync(cmd, { cwd: join(root, cwd), stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
