import { readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWidgetIssueBody } from "./widget-issue.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CLOSE_RE = /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#\d+\b/i;

/**
 * Screenshots GitHub actually renders in the PR body.
 * Cursor agent artifact URLs and the Open-in-Cursor footer badges do not count:
 * #78 merged with only the footer, and #80/#82 needed a human re-upload to
 * github.com/user-attachments because the artifact links stayed broken.
 */
const RENDERED_VISUAL_RE =
  /https:\/\/(?:github\.com\/user-attachments\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/|media\.githubusercontent\.com\/)\S+/i;

export function isUiPullRequest(changedPaths) {
  const tiers = JSON.parse(readFileSync(join(root, ".github", "e2e-tiers.json"), "utf8"));
  const uiGlobs = [...(tiers.core ?? []), ...(tiers.landmarks ?? [])];
  return changedPaths.some((f) => uiGlobs.some((g) => matchesGlob(f, g)));
}

/** @param {string} body */
export function findLinkedIssueNumbers(body) {
  const nums = new Set();
  for (const m of body.matchAll(/\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)\b/gi)) {
    nums.add(Number(m[1]));
  }
  return [...nums];
}

/** @param {string} text */
export function hasClosingKeyword(text) {
  return CLOSE_RE.test(text ?? "");
}

/** @param {string} text */
export function hasVisualEvidence(text) {
  return RENDERED_VISUAL_RE.test(text ?? "");
}

/**
 * @param {{ changedPaths: string[], body: string, isDraft: boolean, issueBodies?: Record<number, string> }}
 */
export function validateUiPullRequest({ changedPaths, body, isDraft, issueBodies = {} }) {
  const errors = [];
  if (!isUiPullRequest(changedPaths)) return errors;

  if (!hasClosingKeyword(body)) {
    errors.push(
      'UI pull request body must include "Closes #N" or "Fixes #N" (title-only references do not auto-close issues)',
    );
  }

  const linked = findLinkedIssueNumbers(body);
  for (const n of linked) {
    const issueBody = issueBodies[n];
    if (issueBody === undefined) continue;
    for (const e of validateWidgetIssueBody(issueBody)) {
      errors.push(`linked issue #${n}: ${e}`);
    }
  }

  if (!isDraft && !hasVisualEvidence(body)) {
    errors.push(
      "ready (non-draft) UI pull request needs a screenshot or video in the PR body that GitHub renders (https://github.com/user-attachments/...). Cursor artifact links and the Open in Cursor footer badges do not count",
    );
  }

  return errors;
}
