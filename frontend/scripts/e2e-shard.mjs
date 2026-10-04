// Runs shard i of n of one Playwright spec, dealing tests out round-robin by title.
// `--shard` hands each runner a contiguous slice of the file, and the heavy cube tests
// sit together, so one runner got 3x the work of another. Dealing by title mixes them.
//   node scripts/e2e-shard.mjs 2/3 e2e/landmarks/landmarks-volume.spec.ts [playwright flags]
import { spawnSync } from "node:child_process";

const [shard, spec, ...flags] = process.argv.slice(2);
const [index, total] = (shard ?? "").split("/").map(Number);
if (!(index >= 1 && index <= total) || !spec) {
  console.error("usage: e2e-shard.mjs <i>/<n> <spec file> [playwright flags]");
  process.exit(2);
}

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
  for (const s of suite.specs ?? []) tests.push({ title: `${s.file} ${s.title}`, line: s.line, file: s.file });
  for (const child of suite.suites ?? []) collect(child);
};
for (const suite of JSON.parse(list.stdout).suites) collect(suite);

tests.sort((a, b) => (a.title < b.title ? -1 : 1));
const mine = tests.filter((_, i) => i % total === index - 1);
console.log(`shard ${index}/${total}: ${mine.length} of ${tests.length} tests`);
const locations = mine.map((t) => `${spec}:${t.line}`);

const run = spawnSync("npx", ["playwright", "test", ...locations, ...flags], { stdio: "inherit" });
process.exit(run.status ?? 1);
