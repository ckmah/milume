// Validates Landmarks UI issue bodies (paired with .github/ISSUE_TEMPLATE/landmarks-ui.yml).
// CI uses this when a UI PR links an issue; local: node scripts/check-widget-issue.mjs --fixture issue-79-empty
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWidgetIssueBody } from "./lib/widget-issue.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "widget-issue-fixtures");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

let body;
const fixture = arg("--fixture", "");
if (fixture) {
  body = readFileSync(join(fixturesDir, `${fixture}.md`), "utf8");
} else {
  const bodyFile = arg("--body-file", "");
  body = bodyFile ? readFileSync(bodyFile, "utf8") : process.env.ISSUE_BODY ?? "";
}

const errors = validateWidgetIssueBody(body);
if (errors.length) {
  console.error("check:widget-issue failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log("check:widget-issue ok");
