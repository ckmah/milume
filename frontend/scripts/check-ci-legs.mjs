#!/usr/bin/env node
// Fails when a workflow's job gating or detect-changes outputs disagree with the legs in
// .github/e2e-tiers.json, or a detect-changes caller re-adds its own paths filter.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ciLegErrors, loadCiConfig, repoRoot } from "./lib/ci-legs.mjs";

const dir = join(repoRoot, ".github", "workflows");
const workflows = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
);
const errors = ciLegErrors(loadCiConfig(), workflows);
if (errors.length) {
  for (const e of errors) console.error(`check:ci-legs: ${e}`);
  process.exit(1);
}
console.log(`check:ci-legs: ok (${Object.keys(loadCiConfig().legs).length} legs match the workflows)`);
