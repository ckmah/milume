import { readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWidgetIssueBody } from "./widget-issue.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CLOSE_RE = /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#\d+\b/i;

/** Markdown / HTML / common agent artifact patterns for embedded UI evidence. */
const VISUAL_EVIDENCE_RE =
  /!\[[^\]]*\]\([^)]+\)|<img\s[^>]*src=|\.(?:png|jpe?g|gif|webp|webm|mp4)(?:\?[^)\s]*)?\)|cursor\.com\/agents\/[^/]+\/artifacts\?path=/i;

export function isUiPullRequest(changedPaths) {
  const tiers = JSON.parse(readFileSync(join(root, ".github", "e2e-tiers.json"), "utf8"));
  const uiGlobs = [...(tiers.core ?? []), ...(tiers.landmarks ?? [])];
  return changedPaths.some((f) => uiGlobs.some((g) => matchesGlob(f, g)));
}

/** Harness / e2e-only diffs still run the UI tier in CI but do not change widget chrome. */
export function touchesWidgetProduct(changedPaths) {
  const globs = [
    "frontend/src/widgets/**",
    "frontend/src/components/**",
    "frontend/src/styles/**",
    "frontend/src/lib/**",
    "frontend/src/hooks/**",
  ];
  return changedPaths.some((f) => globs.some((g) => matchesGlob(f, g)));
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
  return VISUAL_EVIDENCE_RE.test(text ?? "");
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

  if (touchesWidgetProduct(changedPaths)) {
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
        "ready (non-draft) UI pull request needs embedded screenshots or video in the PR body (markdown image, <img>, .webm/.png link, or Cursor artifact URL) — not only CI artifacts",
      );
    }
  }

  return errors;
}
