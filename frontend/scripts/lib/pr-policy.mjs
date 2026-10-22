import { readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWidgetIssueBody } from "./widget-issue.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CLOSE_RE = /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#\d+\b/i;

/** Meta/CI tracking issues (not landmarks-ui); skip widget-issue template on linked bodies. */
const WIDGET_ISSUE_TEMPLATE_EXEMPT = new Set([128]);

/** Markdown / HTML / common agent artifact patterns for embedded UI evidence. */
const VISUAL_EVIDENCE_RE =
  /!\[[^\]]*\]\([^)]+\)|<img\s[^>]*src=|\.(?:png|jpe?g|gif|webp|webm|mp4)(?:\?[^)\s]*)?\)|cursor\.com\/agents\/[^/]+\/artifacts\?path=/i;

/** PRs with this label are gated like UI PRs even when no UI path changed. */
export const UI_EVIDENCE_LABEL = "ui-evidence";

const VISUAL_HEADING_RE = /^(#{1,6})\s*visual acceptance\b(.*)$/i;
const HEADING_RE = /^#{1,6}\s/;
const ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const NA_RE = /^\s*(?:\*\*)?N\/A(?:\*\*)?\s*:\s*\S/i;

/**
 * Sections headed "Visual acceptance", with the heading's trailing text (e.g. "(#117)").
 * A section runs to the next heading of any level.
 * @param {string} body
 */
function visualSections(body) {
  const lines = (body ?? "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(VISUAL_HEADING_RE);
    if (h) {
      cur = { suffix: h[2], lines: [] };
      sections.push(cur);
    } else if (HEADING_RE.test(line)) {
      cur = null;
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  return sections;
}

/**
 * Top-level list entries of a section (nested lines fold into their entry); if the
 * section has no list, each paragraph is one entry.
 * @param {string[]} lines
 */
function sectionEntries(lines) {
  const entries = [];
  let indent = null;
  for (const line of lines) {
    const m = line.match(ITEM_RE);
    if (m && (indent === null || m[1].length <= indent)) {
      indent = m[1].length;
      entries.push(m[2]);
    } else if (entries.length && indent !== null && line.trim()) {
      entries[entries.length - 1] += "\n" + line.trim();
    }
  }
  if (entries.length) return entries;
  // A paragraph that is only media (an example shot) belongs to the paragraph before it.
  const paras = [];
  for (const p of lines.join("\n").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    const mediaOnly = !p.replace(/!\[[^\]]*\]\([^)]+\)|<img\s[^>]*>/gi, "").trim();
    if (paras.length && mediaOnly) {
      paras[paras.length - 1] += "\n" + p;
    } else {
      paras.push(p);
    }
  }
  return paras;
}

/**
 * The linked issue's Visual acceptance items. Items that are themselves "N/A" need no evidence.
 * @param {string} issueBody
 */
export function visualAcceptanceItems(issueBody) {
  const [section] = visualSections(issueBody);
  if (!section) return [];
  return sectionEntries(section.lines).filter((t) => !/^\s*N\/A\b/i.test(t));
}

/**
 * PR-body Visual acceptance entries for issue `n`. A heading naming `#n` wins; a heading
 * without an issue number serves every linked issue.
 * @param {string} prBody
 * @param {number} n
 */
export function visualAcceptanceEntries(prBody, n) {
  const sections = visualSections(prBody);
  const named = sections.find((s) => new RegExp(`#${n}\\b`).test(s.suffix));
  const generic = sections.find((s) => !/#\d+/.test(s.suffix));
  const section = named ?? generic;
  return section ? sectionEntries(section.lines) : null;
}

const short = (t) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one.length > 90 ? `${one.slice(0, 87)}...` : one;
};

/**
 * Per-item gate: one PR entry per issue item, same order, each with media or "N/A: <reason>".
 * @param {string} prBody
 * @param {number} n
 * @param {string} issueBody
 */
export function visualAcceptanceErrors(prBody, n, issueBody) {
  const items = visualAcceptanceItems(issueBody);
  if (!items.length) return [];
  const entries = visualAcceptanceEntries(prBody, n);
  if (!entries) {
    return [
      `PR body has no "Visual acceptance" section for #${n}; add one entry per item, in order, ` +
        `each with a screenshot/video or "N/A: <reason>". Missing item 1: "${short(items[0])}"`,
    ];
  }
  const errors = [];
  items.forEach((item, i) => {
    const entry = entries[i];
    if (entry === undefined) {
      errors.push(`#${n} Visual acceptance item ${i + 1} has no entry: "${short(item)}"`);
    } else if (!hasVisualEvidence(entry) && !NA_RE.test(entry)) {
      errors.push(
        `#${n} Visual acceptance item ${i + 1} entry has no screenshot/video or "N/A: <reason>": "${short(item)}"`,
      );
    }
  });
  if (entries.length > items.length) {
    errors.push(
      `#${n} Visual acceptance has ${entries.length} entries for ${items.length} item(s); keep one entry per item, in the issue's order`,
    );
  }
  return errors;
}

export function isUiPullRequest(changedPaths) {
  const { tiers } = JSON.parse(readFileSync(join(root, ".github", "e2e-tiers.json"), "utf8"));
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
  return VISUAL_EVIDENCE_RE.test(text ?? "");
}

/**
 * Closing keywords only fire on the default branch, so PRs into a long-lived
 * branch (e.g. feat/*) say "Part of #N" and skip that rule. `baseRef` defaults to main.
 * Ready PRs also need a per-item "Visual acceptance" section mirroring each linked issue (#262).
 * @param {{ changedPaths: string[], body: string, isDraft: boolean, issueBodies?: Record<number, string>, baseRef?: string, labels?: string[] }}
 */
export function validateUiPullRequest({ changedPaths, body, isDraft, issueBodies = {}, baseRef = "main", labels = [] }) {
  const errors = [];
  if (!isUiPullRequest(changedPaths) && !labels.includes(UI_EVIDENCE_LABEL)) return errors;

  if (baseRef === "main" && !hasClosingKeyword(body)) {
    errors.push(
      'UI pull request body must include "Closes #N" or "Fixes #N" (title-only references do not auto-close issues)',
    );
  }

  const linked = findLinkedIssueNumbers(body);
  for (const n of linked) {
    if (WIDGET_ISSUE_TEMPLATE_EXEMPT.has(n)) continue;
    const issueBody = issueBodies[n];
    if (issueBody === undefined) continue;
    for (const e of validateWidgetIssueBody(issueBody)) {
      errors.push(`linked issue #${n}: ${e}`);
    }
    if (!isDraft) errors.push(...visualAcceptanceErrors(body, n, issueBody));
  }

  if (!isDraft && !hasVisualEvidence(body)) {
    errors.push(
      "ready (non-draft) UI pull request needs embedded screenshots or video in the PR body (markdown image, <img>, .webm/.png link, or Cursor artifact URL) — not only CI artifacts",
    );
  }

  return errors;
}
