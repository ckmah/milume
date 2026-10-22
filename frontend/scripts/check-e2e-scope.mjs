#!/usr/bin/env node
// Fails when a simulated-molab spec can't run (skipped, unlinked flaky entry, dropped from the
// e2e-landmarks (default) run, or a registered path not routed to it), or when marimo e2e drives
// UI gestures. Manifest: frontend/e2e/e2e-scope.json.
//   npm run check:e2e-scope
//   npm run check:e2e-scope -- --no-list   # skip the `playwright --list` run
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { scopeErrors } from "./lib/e2e-scope.mjs";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(frontend, "..");
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const scope = readJson("frontend/e2e/e2e-scope.json");

function listedSpecs() {
  const out = execFileSync("npx", ["playwright", "test", "e2e/landmarks", "--list", "--reporter=json"], {
    cwd: frontend,
    encoding: "utf8",
    env: { ...process.env, E2E_HARNESS: "landmarks", E2E_SMOKE: "" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = JSON.parse(out);
  const files = new Set();
  const walk = (s) => {
    if (s.file && s.specs?.length) files.add(relative(root, join(report.config.rootDir, s.file)));
    (s.suites ?? []).forEach(walk);
  };
  report.suites.forEach(walk);
  return files;
}

const errors = scopeErrors({
  scope,
  ciConfig: readJson(".github/e2e-tiers.json"),
  trackedFiles: execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean),
  read: (p) => readFileSync(join(root, p), "utf8"),
  registry: readJson("frontend/e2e/flaky-registry.json"),
  listedSpecs: process.argv.includes("--no-list") ? null : listedSpecs(),
});

if (errors.length) {
  for (const e of errors) console.error(`check:e2e-scope: ${e}`);
  process.exit(1);
}
console.log(`check:e2e-scope: ok (${scope.molab.specs.length} molab specs run; marimo e2e has no UI gestures)`);
