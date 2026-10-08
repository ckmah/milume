// Enforces Landmarks/widget UI PR hygiene (see AGENTS.md enforcement table).
// CI: .github/workflows/pr-policy.yml
// Local: node scripts/check-pr-policy.mjs --body-file /tmp/body.md --draft false --changed frontend/src/widgets/landmarks/foo.tsx
// Fixtures: node scripts/check-pr-policy.mjs --fixture pr-58
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateUiPullRequest } from "./lib/pr-policy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "pr-policy-fixtures");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

function loadFixture(name) {
  const path = join(fixturesDir, `${name}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const fixture = arg("--fixture", "");
let payload;
if (fixture) {
  payload = loadFixture(fixture);
} else {
  const bodyFile = arg("--body-file", "");
  const body = bodyFile ? readFileSync(bodyFile, "utf8") : process.env.PR_BODY ?? "";
  const changed = (arg("--changed", process.env.CHANGED_FILES ?? "") || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const isDraft = (arg("--draft", process.env.PR_DRAFT ?? "false") || "false") === "true";
  let issueBodies = {};
  const issueBodiesFile = arg("--issue-bodies-file", "");
  if (issueBodiesFile) issueBodies = JSON.parse(readFileSync(issueBodiesFile, "utf8"));
  payload = { body, changedPaths: changed, isDraft, issueBodies };
}

const errors = validateUiPullRequest(payload);
if (errors.length) {
  console.error("check:pr-policy failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log("check:pr-policy ok");
