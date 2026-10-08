// Posts (or updates) a sticky PR comment linking Playwright artifacts and listing failure screenshots.
// Used from frontend-e2e after landmarks tiers run (permissions: pull-requests: write).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pr = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;
const runUrl = process.env.RUN_URL;
const token = process.env.GH_TOKEN;
const marker = "<!-- milume-playwright-evidence -->";

if (!pr || !repo || !token) {
  console.log("skip post-pr-playwright-comment: missing PR_NUMBER, GITHUB_REPOSITORY, or GH_TOKEN");
  process.exit(0);
}

function walkPng(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkPng(p, out);
    else if (name.endsWith(".png")) out.push(p);
  }
  return out;
}

const roots = ["frontend/test-results", "test-results"].filter((d) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
});
const pngs = roots.flatMap((d) => walkPng(d)).slice(0, 8);

const lines = [
  marker,
  "## Playwright evidence (auto-posted)",
  "",
  "Landmarks e2e uploaded HTML reports and failure screenshots as **workflow artifacts**. Download them from this run:",
  runUrl ? `- ${runUrl}` : "- (workflow run URL unavailable)",
  "",
  "Before marking a UI PR ready, embed the relevant screenshot(s) or a short video in the PR body — `check:pr-policy` fails if only Actions artifacts exist.",
];
if (pngs.length) {
  lines.push("", "Failure screenshots from this run (filenames; download via artifacts):");
  for (const p of pngs) lines.push(`- \`${p}\``);
}

const body = lines.join("\n");

const api = (...args) =>
  execFileSync("gh", ["api", ...args], { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } });

const comments = JSON.parse(api(`repos/${repo}/issues/${pr}/comments`));
const existing = comments.find((c) => (c.body ?? "").includes(marker));

if (existing) {
  api(`repos/${repo}/issues/comments/${existing.id}`, "-X", "PATCH", "-f", `body=${body}`);
  console.log(`updated comment ${existing.id}`);
} else {
  api(`repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`);
  console.log("created playwright evidence comment");
}
