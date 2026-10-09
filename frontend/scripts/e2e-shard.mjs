// Runs shard i of n of one Playwright spec. Heavy tests (weights in e2e-shard-weights.json)
// are pinned to different shards; the rest are dealt round-robin by title so no runner
// inherits the whole file (#100).
//   node scripts/e2e-shard.mjs 2/3 e2e/landmarks/landmarks-volume.spec.ts [playwright flags]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const [shard, spec, ...flags] = process.argv.slice(2);
const [index, total] = (shard ?? "").split("/").map(Number);
if (!(index >= 1 && index <= total) || !spec) {
  console.error("usage: e2e-shard.mjs <i>/<n> <spec file> [playwright flags]");
  process.exit(2);
}

const weightsPath = join(dirname(fileURLToPath(import.meta.url)), "e2e-shard-weights.json");
const weightConfig = JSON.parse(readFileSync(weightsPath, "utf8"));
const defaultWeight = weightConfig.default ?? 1;
const weightFor = (title) => {
  for (const { match, weight } of weightConfig.patterns ?? []) {
    if (title.includes(match)) return weight;
  }
  return defaultWeight;
};

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

for (const t of tests) t.weight = weightFor(t.title);

const heavy = tests.filter((t) => t.weight > defaultWeight).sort((a, b) => (a.title < b.title ? -1 : 1));
const light = tests.filter((t) => t.weight === defaultWeight).sort((a, b) => (a.title < b.title ? -1 : 1));

const buckets = Array.from({ length: total }, () => ({ tests: [], heavy: 0 }));
for (let i = 0; i < heavy.length; i++) {
  const bucket = buckets[i % total];
  bucket.tests.push(heavy[i]);
  bucket.heavy += 1;
}
for (let i = 0; i < light.length; i++) {
  buckets[i % total].tests.push(light[i]);
}

const mine = buckets[index - 1].tests;
const heavyOnShard = buckets[index - 1].heavy;
console.log(`shard ${index}/${total}: ${mine.length} of ${tests.length} tests (${heavyOnShard} weighted)`);
const locations = mine.map((t) => `${spec}:${t.line}`);

const run = spawnSync("npx", ["playwright", "test", ...locations, ...flags], { stdio: "inherit" });
process.exit(run.status ?? 1);
