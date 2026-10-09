/**
 * Merge list-reporter timings from CI into e2e-shard-weights.json.
 * Usage: gh run view <id> --log | node scripts/build-e2e-shard-weights.mjs [more logs...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scripts = dirname(fileURLToPath(import.meta.url));

function parseDur(raw) {
  const t = raw.trim();
  if (t.endsWith("m")) return Math.round(parseFloat(t) * 60);
  if (t.endsWith("s")) return Math.round(parseFloat(t));
  return null;
}

function parseLog(text) {
  const re =
    /landmarks-volume\.spec\.ts:\d+:\d+ › [^›]+ › ([^(]+?) \((\d+(?:\.\d+)?[ms])\)/g;
  const map = new Map();
  for (const m of text.matchAll(re)) {
    const title = m[1].trim();
    const sec = parseDur(m[2]);
    if (sec != null) map.set(title, Math.max(map.get(title) ?? 0, sec));
  }
  return map;
}

const list = spawnSync(
  "npx",
  ["playwright", "test", "e2e/landmarks/landmarks-volume.spec.ts", "--list", "--reporter=json"],
  {
    encoding: "utf8",
    cwd: join(scripts, ".."),
    env: { ...process.env, E2E_HARNESS: "landmarks-volume", PLAYWRIGHT_JSON_OUTPUT_NAME: "" },
    maxBuffer: 64 * 1024 * 1024,
  },
);
if (list.status !== 0) {
  console.error(list.stderr || list.stdout);
  process.exit(1);
}
const titles = [];
const collect = (suite) => {
  for (const s of suite.specs ?? []) titles.push(s.title);
  for (const child of suite.suites ?? []) collect(child);
};
for (const suite of JSON.parse(list.stdout).suites) collect(suite);

const merged = new Map();
for (const path of process.argv.slice(2)) {
  for (const [k, v] of parseLog(readFileSync(path, "utf8"))) merged.set(k, Math.max(merged.get(k) ?? 0, v));
}
if (merged.size === 0 && !process.stdin.isTTY) {
  const stdin = readFileSync(0, "utf8");
  for (const [k, v] of parseLog(stdin)) merged.set(k, Math.max(merged.get(k) ?? 0, v));
}

const durations = {};
for (const title of titles) {
  if (merged.has(title)) durations[title] = merged.get(title);
}
const known = Object.values(durations).sort((a, b) => a - b);
const defaultWeight = known[Math.floor(known.length / 2)] ?? 20;

const out = {
  defaultWeight,
  sources: process.argv.slice(2).length ? process.argv.slice(2) : ["stdin"],
  durations,
};
writeFileSync(join(scripts, "e2e-shard-weights.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${titles.length} tests, ${Object.keys(durations).length} timed, defaultWeight=${defaultWeight}s`);
