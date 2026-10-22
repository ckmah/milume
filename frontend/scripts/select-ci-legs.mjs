#!/usr/bin/env node
// detect-changes.yml: turns the tiers dorny/paths-filter matched into CI legs.
//   select-ci-legs.mjs --filters             # print the `tiers` block for dorny
//   CHANGES='["landmarks"]' select-ci-legs.mjs
//   IS_DISPATCH=true TIER=all select-ci-legs.mjs
import { appendFileSync } from "node:fs";

import { dispatchLegs, loadCiConfig, selectLegs } from "./lib/ci-legs.mjs";

const config = loadCiConfig();
if (process.argv.includes("--filters")) {
  console.log(JSON.stringify(config.tiers));
  process.exit(0);
}

const legs =
  process.env.IS_DISPATCH === "true"
    ? dispatchLegs(config, process.env.TIER ?? "")
    : selectLegs(config, new Set(JSON.parse(process.env.CHANGES || "[]")));
const lines = Object.entries(legs).map(([k, v]) => `${k}=${v}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
console.log(`Selected: ${lines.join(" ")}`);
