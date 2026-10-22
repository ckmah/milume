#!/usr/bin/env node
/**
 * Bounded CI polling for agents. Replaces open-ended `sleep 900; gh pr checks` loops.
 *
 *   node frontend/scripts/gh-ci-watch.mjs --pr 121 --repo ckmah/milume
 *   node frontend/scripts/gh-ci-watch.mjs --pr 121 --check gate --max-wait-sec 1200
 *
 * One session = at most 12 rounds x 90 s (20 min). Each PR head SHA gets 3 sessions
 * (--max-sessions), counted in one marker comment on the PR; the 4th call refuses and
 * prints the hand-off snapshot (#263). Pushing a new head resets the count.
 *
 * Exit 0 when the check passes; 1 on failure or conflicts; 2 when the budget is spent (hand off).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_WATCH_SESSIONS, handoffSnapshot, watchBody, watchSessions } from "./lib/ci-budget.mjs";
import { loadCiConfig } from "./lib/ci-legs.mjs";

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
const maxSessions = Number(flag("--max-sessions", String(MAX_WATCH_SESSIONS)));

if (!pr || !repo) {
  console.error("Usage: gh-ci-watch.mjs --pr N --repo owner/name [--check gate]");
  process.exit(1);
}

const gh = (...a) => spawnSync("gh", a, { encoding: "utf8", env: process.env, maxBuffer: 64 << 20 });
const config = loadCiConfig(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));

function prState() {
  const r = gh("pr", "view", String(pr), "--repo", repo, "--json", "headRefOid,mergeable");
  if (r.status !== 0) return { sha: null, conflicting: null };
  const { headRefOid, mergeable } = JSON.parse(r.stdout);
  return { sha: headRefOid, conflicting: mergeable === "UNKNOWN" ? null : mergeable === "CONFLICTING" };
}

function checks() {
  const r = gh("pr", "checks", String(pr), "--repo", repo, "--json", "name,bucket,link");
  // `gh pr checks` exits 8 while checks are pending; the JSON is still on stdout.
  try {
    return JSON.parse(r.stdout || "[]");
  } catch {
    return [];
  }
}

function snapshot(sha, conflicting) {
  return handoffSnapshot({ sha: sha ?? "unknown", checks: checks(), conflicting, config });
}

// Session budget per head SHA, kept in one marker comment on the PR.
const { sha, conflicting } = prState();
if (conflicting) {
  console.error(`[gh-ci-watch] PR #${pr} is CONFLICTING — stop polling CI. Rebase onto main first.`);
  process.exit(1);
}
if (sha) {
  const listed = gh("api", "--paginate", "--slurp", `repos/${repo}/issues/${pr}/comments?per_page=100`);
  if (listed.status === 0) {
    const { comment, sessions } = watchSessions(JSON.parse(listed.stdout).flat(), sha);
    if (sessions >= maxSessions) {
      console.error(
        `[gh-ci-watch] refusing: ${sessions}/${maxSessions} watch sessions already spent on ${sha.slice(0, 7)}. ` +
          `Hand off with this snapshot (post it in the PR); push a fix to reset.\n\n${snapshot(sha, conflicting)}`,
      );
      process.exit(2);
    }
    const body = watchBody(sha, sessions + 1, maxSessions);
    const w = comment
      ? gh("api", "-X", "PATCH", `repos/${repo}/issues/comments/${comment.id}`, "-f", `body=${body}`)
      : gh("api", "-X", "POST", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`);
    if (w.status !== 0) console.error(`[gh-ci-watch] warning: could not record the session: ${w.stderr.trim()}`);
    console.log(`[gh-ci-watch] session ${sessions + 1}/${maxSessions} on ${sha.slice(0, 7)}`);
  }
}

function checkStatus() {
  const row = checks().find((c) => c.name === checkName);
  if (!row) return { state: "pending", line: `no row for ${checkName}` };
  const line = `${row.name} ${row.bucket}`;
  if (row.bucket === "pass") return { state: "pass", line };
  if (row.bucket === "fail" || row.bucket === "cancel") return { state: "fail", line };
  return { state: "pending", line };
}

const started = Date.now();
let round = 0;

while (round < maxRounds && (Date.now() - started) / 1000 < maxWaitSec) {
  round += 1;
  if (prState().conflicting) {
    console.error(`[gh-ci-watch] PR #${pr} is CONFLICTING — stop polling CI. Rebase onto main first.`);
    process.exit(1);
  }
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

const now = prState();
console.error(
  `[gh-ci-watch] budget exhausted (${maxRounds} rounds or ${maxWaitSec}s). ` +
    `Report status in the PR and hand off — do not start longer sleep loops.\n\n${snapshot(now.sha ?? sha, now.conflicting)}`,
);
process.exit(2);
