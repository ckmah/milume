#!/usr/bin/env node
// check:pr-overlap and check:pr-stack against the repo's other open PRs (#261).
//   CI:      PR_NUMBER=N GITHUB_REPOSITORY=o/r node scripts/check-pr-hygiene.mjs overlap [--comment]
//   local:   npm run check:pr-overlap -- --branch my-branch [--body-file body.md] [--base main]
//   fixture: node scripts/check-pr-hygiene.mjs stack --fixture stacked-on-pr
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { overlapReport, stackErrors } from "./lib/pr-hygiene.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
const arg = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const repo = arg("--repo") ?? process.env.GITHUB_REPOSITORY ?? "ckmah/milume";
const MARKER = "<!-- pr-overlap -->";

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const ghLines = (path, jq) => gh("api", "--paginate", path, "--jq", jq).split("\n").filter(Boolean);
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

function remotePr(p) {
  return {
    number: p.number,
    body: p.body ?? "",
    base: p.base.ref,
    head: p.head.ref,
    draft: p.draft,
    files: ghLines(`repos/${repo}/pulls/${p.number}/files?per_page=100`, ".[].filename"),
    commits: mode === "stack" ? ghLines(`repos/${repo}/pulls/${p.number}/commits?per_page=100`, ".[].sha") : [],
  };
}

function load() {
  const fixture = arg("--fixture");
  if (fixture) return JSON.parse(readFileSync(join(here, "pr-hygiene-fixtures", `${fixture}.json`), "utf8"));
  const open = JSON.parse(gh("api", "--paginate", `repos/${repo}/pulls?state=open&per_page=100`));
  const branch = arg("--branch");
  let pr;
  if (branch) {
    const base = arg("--base") ?? "main";
    const range = `origin/${base}..${branch}`;
    const bodyFile = arg("--body-file");
    pr = {
      number: open.find((p) => p.head.ref === branch)?.number ?? 0,
      body: bodyFile ? readFileSync(bodyFile, "utf8") : git("log", "--format=%B", range),
      base,
      head: branch,
      draft: false,
      files: git("diff", "--name-only", `origin/${base}...${branch}`).split("\n").filter(Boolean),
      commits: git("rev-list", range).split("\n").filter(Boolean),
    };
  } else {
    const n = Number(process.env.PR_NUMBER);
    pr = remotePr(JSON.parse(gh("api", `repos/${repo}/pulls/${n}`)));
  }
  return { pr, others: open.filter((p) => p.number !== pr.number).map(remotePr) };
}

function upsertComment(prNumber, body) {
  const id = ghLines(
    `repos/${repo}/issues/${prNumber}/comments?per_page=100`,
    `.[] | select(.body | startswith("${MARKER}")) | .id`,
  )[0];
  if (!id && !body) return;
  const text = body ?? `${MARKER}\nNo overlapping open PRs now.`;
  const file = join(process.env.RUNNER_TEMP ?? "/tmp", "pr-overlap-comment.md");
  writeFileSync(file, text);
  if (id) gh("api", "-X", "PATCH", `repos/${repo}/issues/comments/${id}`, "-F", `body=@${file}`);
  else gh("api", `repos/${repo}/issues/${prNumber}/comments`, "-F", `body=@${file}`);
}

const { pr, others } = load();
if (mode === "stack") {
  const errors = stackErrors(pr, others);
  if (errors.length) {
    for (const e of errors) console.error(`check:pr-stack: ${e}`);
    process.exit(1);
  }
  console.log(`check:pr-stack: ok (base ${pr.base}, no commits from ${others.length} other open PR(s))`);
} else if (mode === "overlap") {
  const { failures, warnings } = overlapReport(pr, others);
  for (const w of warnings) console.log(`check:pr-overlap: warning: ${w}`);
  for (const f of failures) console.error(`check:pr-overlap: ${f}. Closes the same issue and touches the same files: likely a duplicate; close one or coordinate.`);
  if (rest.includes("--comment")) {
    const lines = [...failures.map((f) => `- **Duplicate?** ${f}`), ...warnings.map((w) => `- ${w}`)];
    upsertComment(pr.number, lines.length ? `${MARKER}\n### Overlapping open PRs\n\n${lines.join("\n")}\n` : null);
  }
  if (failures.length) process.exit(1);
  console.log(`check:pr-overlap: ok (${warnings.length} warning(s) across ${others.length} other open PR(s))`);
} else {
  console.error("usage: check-pr-hygiene.mjs overlap|stack [--branch B] [--fixture F] [--comment]");
  process.exit(2);
}
