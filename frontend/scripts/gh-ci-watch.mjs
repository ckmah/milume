#!/usr/bin/env node
/**
 * Bounded CI polling for agents. Replaces open-ended `sleep 900; gh pr checks` loops.
 *
 *   node frontend/scripts/gh-ci-watch.mjs --pr 121 --repo ckmah/milume
 *   node frontend/scripts/gh-ci-watch.mjs --pr 121 --check gate --max-wait-sec 1200
 *
 * Exit 0 when required checks succeed; exit 2 when the budget is exhausted (hand off).
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const pr = flag("--pr", process.env.PR_NUMBER);
const repo = flag("--repo", process.env.GITHUB_REPOSITORY);
const checkName = flag("--check", "gate");
const intervalSec = Number(flag("--interval-sec", "90"));
const maxWaitSec = Number(flag("--max-wait-sec", "1200"));
const maxRounds = Number(flag("--max-rounds", "12"));

if (!pr || !repo) {
  console.error("Usage: gh-ci-watch.mjs --pr N --repo owner/name [--check gate]");
  process.exit(1);
}

const gh = (...a) =>
  spawnSync("gh", a, { encoding: "utf8", env: process.env });

function mergeableOk() {
  const r = gh("pr", "view", String(pr), "--repo", repo, "--json", "mergeable,mergeableState");
  if (r.status !== 0) return true;
  const { mergeable, mergeableState } = JSON.parse(r.stdout);
  if (mergeable === false || mergeableState === "conflicting" || mergeableState === "dirty") {
    console.error(
      `[gh-ci-watch] PR #${pr} is CONFLICTING — stop polling CI. Rebase onto main first.`,
    );
    process.exit(1);
  }
  return true;
}

function checkStatus() {
  const r = gh("pr", "checks", String(pr), "--repo", repo);
  if (r.status !== 0) {
    return { state: "pending", line: r.stderr.trim() || "no checks yet" };
  }
  const lines = r.stdout.split("\n").filter(Boolean);
  const gate = lines.find((l) => l.startsWith(`${checkName}\t`));
  if (!gate) return { state: "pending", line: `no row for ${checkName}` };
  const cols = gate.split("\t");
  const conclusion = cols[1] ?? "";
  if (conclusion === "pass") return { state: "pass", line: gate };
  if (conclusion === "fail") return { state: "fail", line: gate };
  return { state: "pending", line: gate };
}

const started = Date.now();
let round = 0;

while (round < maxRounds && (Date.now() - started) / 1000 < maxWaitSec) {
  round += 1;
  mergeableOk();
  const { state, line } = checkStatus();
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[gh-ci-watch] round ${round}/${maxRounds} +${elapsed}s — ${line}`);
  if (state === "pass") {
    console.log(`[gh-ci-watch] ${checkName} passed`);
    process.exit(0);
  }
  if (state === "fail") {
    console.error(`[gh-ci-watch] ${checkName} failed — inspect Actions, fix, push; do not sleep-poll`);
    process.exit(1);
  }
  if (round < maxRounds && (Date.now() - started) / 1000 < maxWaitSec) {
    spawnSync("sleep", [String(intervalSec)], { stdio: "inherit" });
  }
}

console.error(
  `[gh-ci-watch] budget exhausted (${maxRounds} rounds or ${maxWaitSec}s). ` +
    `Report status in the PR and hand off — do not start longer sleep loops. ` +
    `Use cursor-subscriptions subscribe_github_ci or wait for a follow-up.`,
);
process.exit(2);
