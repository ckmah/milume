import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { findLinkedIssueNumbers } from "./lib/pr-policy.mjs";

const repo = process.env.GITHUB_REPOSITORY;
const body = process.env.PR_BODY ?? "";
const token = process.env.GH_TOKEN;

if (!repo || !token) {
  writeFileSync("issue-bodies.json", "{}");
  process.exit(0);
}

const map = {};
for (const n of findLinkedIssueNumbers(body)) {
  const json = execFileSync(
    "gh",
    ["api", `repos/${repo}/issues/${n}`, "--jq", ".body"],
    { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } },
  );
  map[n] = JSON.parse(json);
}
writeFileSync("issue-bodies.json", JSON.stringify(map));
