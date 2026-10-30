#!/usr/bin/env node
/**
 * Regression proof for #387: landmarks-genes-combobox-filter.spec.ts
 * Run from frontend/: node scripts/verify-gene-filter-regression-387.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const frontend = new URL("..", import.meta.url).pathname;
const target = join(frontend, "src/widgets/landmarks/chrome/genes-legend.tsx");
const backup = join(frontend, ".genes-legend.regression-backup.tsx");
const mainSrc = spawnSync("git", ["show", "main:frontend/src/widgets/landmarks/chrome/genes-legend.tsx"], {
  cwd: join(frontend, ".."),
  encoding: "utf8",
});
if (mainSrc.status !== 0) {
  console.error(mainSrc.stderr);
  process.exit(1);
}

function runSpec(label) {
  const r = spawnSync(
    "npx",
    ["playwright", "test", "e2e/landmarks/landmarks-genes-combobox-filter.spec.ts", "--workers=1", "--retries=0"],
    { cwd: frontend, encoding: "utf8", env: process.env },
  );
  const summary = r.status === 0 ? "PASS" : "FAIL";
  console.log(`${label}: ${summary}`);
  if (r.status !== 0) {
    console.log(r.stdout.split("\n").slice(-15).join("\n"));
  }
  return r.status === 0;
}

copyFileSync(target, backup);
try {
  writeFileSync(target, readFileSync(backup, "utf8"));

  console.log("--- branch wiring (current file) ---");
  const branchPass = runSpec("branch");

  writeFileSync(target, mainSrc.stdout);
  console.log("--- main wiring (genes-legend.tsx @ main) ---");
  const mainPass = runSpec("main unmodified");

  const stuck = mainSrc.stdout.replace(
    'onInputValueChange={(value) => setFilterQuery(String(value ?? ""))}',
    "onInputValueChange={() => undefined}",
  );
  writeFileSync(target, stuck);
  console.log("--- main wiring with filter state frozen (repro) ---");
  const stuckFail = !runSpec("main stuck repro");

  if (!branchPass || !mainPass || !stuckFail) process.exit(1);
  console.log("verify-gene-filter-regression-387: ok");
} finally {
  copyFileSync(backup, target);
}
