#!/usr/bin/env node
// Flags stalled bot PRs (#263): a ready PR from a bot branch (lib/ci-budget.mjs BOT_BRANCH_RE)
// whose CI is red or pending with no push for --hours (default 6) gets one `stalled` comment
// per head SHA, with the hand-off snapshot. CI: .github/workflows/stale-prs.yml (hourly).
//   node frontend/scripts/stale-prs.mjs --repo ckmah/milume            # dry run: print verdicts
//   node frontend/scripts/stale-prs.mjs --repo ckmah/milume --comment  # post comments
//   node frontend/scripts/stale-prs.mjs --repo ckmah/milume --pr 123 --hours 0.1
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STALL_HOURS, handoffSnapshot, stallVerdict, stalledMarker } from "./lib/ci-budget.mjs";
import { loadCiConfig } from "./lib/ci-legs.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const repo = flag("--repo", process.env.GITHUB_REPOSITORY);
const hours = Number(flag("--hours", process.env.STALL_HOURS || STALL_HOURS));
const only = flag("--pr", process.env.PR_NUMBER || "");
const comment = args.includes("--comment");
if (!repo || !(hours >= 0)) {
  console.error("Usage: stale-prs.mjs --repo owner/name [--hours 6] [--pr N] [--comment]");
  process.exit(1);
}

const api = (path, ...extra) =>
  JSON.parse(execFileSync("gh", ["api", ...extra, path], { encoding: "utf8", maxBuffer: 64 << 20 }));
const paged = (path) => api(path, "--paginate", "--slurp").flat();

/** Latest run per check name (reruns and `edited` events add duplicates). */
function checksFor(sha) {
  const runs = paged(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).flatMap((p) => p.check_runs);
  const latest = new Map();
  for (const r of runs) {
    const prev = latest.get(r.name);
    if (!prev || Date.parse(r.started_at) > Date.parse(prev.started_at)) latest.set(r.name, r);
  }
  return [...latest.values()].map((r) => ({
    name: r.name,
    link: r.html_url,
    bucket:
      r.status !== "completed"
        ? "pending"
        : ["success", "neutral"].includes(r.conclusion)
          ? "pass"
          : r.conclusion === "skipped"
            ? "skipping"
            : r.conclusion === "cancelled"
              ? "cancel"
              : "fail",
  }));
}

const config = loadCiConfig(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const pulls = only ? [api(`repos/${repo}/pulls/${only}`)] : paged(`repos/${repo}/pulls?state=open&per_page=100`);
let flagged = 0;
for (const p of pulls) {
  if (p.state !== "open") continue;
  const sha = p.head.sha;
  const committed = api(`repos/${repo}/commits/${sha}`).commit.committer.date;
  const lastPushAt = new Date(Math.max(Date.parse(committed), Date.parse(p.created_at))).toISOString();
  const pr = { head: p.head.ref, draft: p.draft, sha, lastPushAt, checks: [], comments: [] };
  // Cheap filters first; only fetch checks/comments for candidates.
  let verdict = stallVerdict({ ...pr, checks: [{ bucket: "pending" }] }, { hours });
  if (verdict.stalled) {
    pr.checks = checksFor(sha);
    pr.comments = paged(`repos/${repo}/issues/${p.number}/comments?per_page=100`);
    verdict = stallVerdict(pr, { hours });
  }
  console.log(`#${p.number} ${p.head.ref}: ${verdict.stalled ? "STALLED" : "ok"} (${verdict.reason})`);
  if (!verdict.stalled) continue;
  flagged += 1;
  const full = api(`repos/${repo}/pulls/${p.number}`);
  const body =
    `${stalledMarker(sha)}\n**stalled:** ${verdict.reason} (threshold ${hours} h). ` +
    `Fix and push, or hand off to a person; don't start a longer wait loop.\n\n` +
    handoffSnapshot({ sha, checks: pr.checks, conflicting: full.mergeable === null ? null : !full.mergeable, config });
  if (comment) {
    execFileSync("gh", ["api", "-X", "POST", `repos/${repo}/issues/${p.number}/comments`, "-f", `body=${body}`]);
    console.log(`  commented on #${p.number}`);
  } else {
    console.log(body.replace(/^/gm, "  "));
  }
}
console.log(`${flagged} stalled PR(s)${comment ? "" : " (dry run; --comment posts)"}`);
