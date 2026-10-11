#!/usr/bin/env node
/**
 * Fail loudly when a PR cannot merge (conflicts). Used in CI and locally:
 *   node frontend/scripts/check-pr-mergeable.mjs
 *   gh pr view --json number,mergeable,mergeableState | node frontend/scripts/check-pr-mergeable.mjs --stdin
 */
import { execFileSync } from "node:child_process";

import { mergeabilityError, parsePullRequestPayload } from "./lib/pr-mergeable.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      buf += c;
    });
    process.stdin.on("end", () => resolve(buf));
  });
}

async function loadPullRequest() {
  if (process.argv.includes("--stdin")) {
    const raw = await readStdin();
    return parsePullRequestPayload(JSON.parse(raw));
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER ?? process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER;
  if (!repo || !pr) {
    const local = execFileSync(
      "gh",
      ["pr", "view", "--json", "mergeable,mergeableState"],
      { encoding: "utf8" },
    );
    return parsePullRequestPayload(JSON.parse(local));
  }

  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("check-pr-mergeable: missing GH_TOKEN");
    process.exit(1);
  }
  const raw = execFileSync(
    "gh",
    ["api", `repos/${repo}/pulls/${pr}`, "--jq", "{mergeable,mergeable_state}"],
    { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } },
  );
  return parsePullRequestPayload(JSON.parse(raw));
}

async function main() {
  let pr = await loadPullRequest();
  if (pr.mergeable === null && pr.mergeableState === "unknown") {
    await new Promise((r) => setTimeout(r, 3000));
    pr = await loadPullRequest();
  }
  const err = mergeabilityError(pr);
  if (err) {
    console.error(`check-pr-mergeable failed: ${err}`);
    process.exit(1);
  }
  console.log(`check-pr-mergeable ok (mergeable_state=${pr.mergeableState ?? "clean"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
