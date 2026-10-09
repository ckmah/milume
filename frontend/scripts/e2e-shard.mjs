// Runs shard i of n of one Playwright spec. Tests are assigned by duration-weighted
// LPT (longest first to the lightest shard) using e2e-shard-weights.json (#100).
//   node scripts/e2e-shard.mjs 2/3 e2e/landmarks/landmarks-volume.spec.ts [playwright flags]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assignShards, weightFor } from "./lib/e2e-shard-plan.mjs";

const [shard, spec, ...flags] = process.argv.slice(2);
const [index, total] = (shard ?? "").split("/").map(Number);
if (!(index >= 1 && index <= total) || !spec) {
  console.error("usage: e2e-shard.mjs <i>/<n> <spec file> [playwright flags]");
  process.exit(2);
}

const weightsPath = join(dirname(fileURLToPath(import.meta.url)), "e2e-shard-weights.json");
const weightConfig = JSON.parse(readFileSync(weightsPath, "utf8"));

const list = spawnSync("npx", ["playwright", "test", spec, "--list", "--reporter=json"], {
  encoding: "utf8",
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: "" },
  maxBuffer: 64 * 1024 * 1024,
});
if (list.status !== 0) {
  console.error(list.stderr || list.stdout);
  process.exit(list.status ?? 1);
}

const tests = [];
const collect = (suite) => {
  for (const s of suite.specs ?? []) tests.push({ title: s.title, line: s.line, file: s.file });
  for (const child of suite.suites ?? []) collect(child);
};
for (const suite of JSON.parse(list.stdout).suites) collect(suite);

const buckets = assignShards(tests, total, weightConfig);
const mine = buckets[index - 1];
const load = mine.reduce((sum, t) => sum + weightFor(t.title, weightConfig), 0);
console.log(`shard ${index}/${total}: ${mine.length} of ${tests.length} tests (~${load}s estimated)`);
const locations = mine.map((t) => `${spec}:${t.line}`);

const run = spawnSync("npx", ["playwright", "test", ...locations, ...flags], { stdio: "inherit" });
process.exit(run.status ?? 1);
