// Open-PR hygiene: duplicate/overlap scan and stacked-PR check (#261).
// A PR is { number, body, base, head, draft, files: string[], commits: string[] }.
import { matchesGlob } from "node:path";

/** Files many PRs legitimately touch; they never count as overlap. */
const SHARED_FILES = [
  "CHANGELOG.md",
  "uv.lock",
  "frontend/package-lock.json",
  "**/*-snapshots/**",
  ".github/public-api.json",
];

const LINK_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of)\s+#(\d+)\b/gi;

export function linkedIssues(body) {
  return [...new Set([...(body ?? "").matchAll(LINK_RE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

const counts = (f) => !SHARED_FILES.some((g) => matchesGlob(f, g));

export function integrationBase(base) {
  return base === "main" || base.startsWith("feat/");
}

/**
 * `failures` share a linked issue and a file; `warnings` share one of the two. A PR into an
 * integration branch is not compared with that branch's own PR (#248 for feat/lazy-genes).
 */
export function overlapReport(pr, others) {
  const issues = new Set(linkedIssues(pr.body));
  const files = new Set(pr.files.filter(counts));
  const failures = [];
  const warnings = [];
  for (const o of others) {
    if (o.number === pr.number || o.head === pr.base || o.base === pr.head) continue;
    const sharedIssues = linkedIssues(o.body).filter((n) => issues.has(n));
    const sharedFiles = o.files.filter((f) => files.has(f));
    if (!sharedIssues.length && !sharedFiles.length) continue;
    const parts = [];
    if (sharedIssues.length) parts.push(`links ${sharedIssues.map((n) => `#${n}`).join(", ")}`);
    if (sharedFiles.length) parts.push(`touches ${sharedFiles.map((f) => `\`${f}\``).join(", ")}`);
    const line = `#${o.number} (\`${o.head}\`) also ${parts.join(" and ")}`;
    (sharedIssues.length && sharedFiles.length ? failures : warnings).push(line);
  }
  return { failures, warnings };
}

/** Stacked-PR errors: a non-integration base, or commits that belong to another open PR. */
export function stackErrors(pr, others) {
  const errors = [];
  if (!integrationBase(pr.base)) {
    const parent = others.find((o) => o.head === pr.base);
    errors.push(
      `base \`${pr.base}\` is not main or a feat/* integration branch` +
        (parent ? `; it is the head of open PR #${parent.number}` : "") +
        ". Merge the parent first, then retarget this PR to main.",
    );
  }
  const mine = new Set(pr.commits);
  for (const o of others) {
    if (o.number === pr.number || o.head === pr.head) continue;
    const shared = o.commits.filter((c) => mine.has(c));
    if (shared.length) {
      errors.push(
        `head carries ${shared.length} commit(s) from open PR #${o.number} (\`${o.head}\`), e.g. ${shared[0].slice(0, 7)}. Rebase onto main after it merges.`,
      );
    }
  }
  return errors;
}
