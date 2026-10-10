// Captures UI evidence PNGs from test-results, publishes a draft release asset bundle,
// and posts (or updates) a sticky PR comment with embeddable markdown images.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pr = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const token = process.env.GH_TOKEN;
const marker = "<!-- milume-ui-evidence -->";

if (!pr || !repo || !token) {
  console.log("skip post-ui-evidence-comment: missing PR_NUMBER, GITHUB_REPOSITORY, or GH_TOKEN");
  process.exit(0);
}

function walkPng(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkPng(p, out);
    else if (name.endsWith(".png") && name.includes("-")) out.push(p);
  }
  return out.sort();
}

const roots = ["frontend/test-results", "test-results"].filter((d) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
});
const pngs = roots.flatMap((d) => walkPng(d)).filter((p) => /ui-evidence|^\d{2}-/.test(p) || /\d{2}-/.test(p));
const shots = pngs.filter((p) => /\d{2}-/.test(p)).slice(0, 8);
if (!shots.length) {
  console.log("no ui-evidence pngs found under test-results");
  process.exit(0);
}

const api = (...args) =>
  execFileSync("gh", ["api", ...args], { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } });

const tag = `ui-evidence-pr-${pr}-run-${runId}`;
execFileSync(
  "gh",
  ["release", "create", tag, "--draft", "--title", `UI evidence PR #${pr}`, "--notes", "Auto-generated Playwright captures for PR review.", ...shots],
  { stdio: "inherit", env: { ...process.env, GH_TOKEN: token } },
);

const release = JSON.parse(api(`repos/${repo}/releases/tags/${tag}`));
const assets = release.assets ?? [];
const lines = [
  marker,
  "## UI evidence (auto-posted)",
  "",
  "Embed these in the PR body before marking ready (or copy into your description). `check:pr-policy` still requires visuals on the PR itself.",
  "",
];
for (const shot of shots) {
  const base = shot.split("/").pop()!;
  const asset = assets.find((a) => a.name === base);
  const url = asset?.browser_download_url;
  if (url) lines.push(`### ${base}`, "", `![${base}](${url})`, "");
}
lines.push(`Draft release: ${release.html_url}`);

const body = lines.join("\n");
const comments = JSON.parse(api(`repos/${repo}/issues/${pr}/comments`));
const existing = comments.find((c) => (c.body ?? "").includes(marker));
if (existing) {
  api(`repos/${repo}/issues/comments/${existing.id}`, "-X", "PATCH", "-f", `body=${body}`);
  console.log(`updated comment ${existing.id}`);
} else {
  api(`repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`);
  console.log("created ui-evidence comment");
}
