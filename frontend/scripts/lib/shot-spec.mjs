// Montage shot-spec contract (#264): docs/montage/shot-spec.md is one table row per shot.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const COLUMNS = ["id", "dataset", "setup", "duration_s", "caption", "caption_kind", "capture", "status", "owner"];
const DATASETS = new Set(["colon_a2", "pyxa_small", "pyxa_xsmall", "none"]);
const KINDS = new Set(["tagline", "feature", "none"]);
const STATUSES = new Set(["planned", "spec-done", "clip-done", "shipped"]);
const OWNERS = new Set(["Designer", "Developer", "PM"]);

/**
 * Shots captured by hand before capture scripts were required. They keep `manual: <how>` only
 * while `status` is `shipped`; re-shooting one (any other status) needs a script or `N/A:`.
 * Don't add ids here: new shots need a script.
 */
export const GRANDFATHERED_MANUAL = new Set(["title", "peek", "spline-buffer", "distances", "probe", "knn", "inspect-zcut", "end"]);

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Rows of the first table under "## Shots", keyed by column name, with their line numbers. */
export function parseShotSpec(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s+Shots\b/.test(l));
  if (start < 0) return { header: null, rows: [] };
  let header = null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,2}\s/.test(l)) break;
    if (!l.trim().startsWith("|")) {
      if (header) break;
      continue;
    }
    if (!header) {
      header = cells(l);
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(l.trim())) continue;
    const c = cells(l);
    rows.push({ line: i + 1, ...Object.fromEntries(header.map((h, j) => [h, c[j] ?? ""])) });
  }
  return { header, rows };
}

/** The landing `<h1>` text: the one canonical tagline. */
export function canonicalTagline(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
}

/**
 * @param {string} md shot-spec.md
 * @param {{ tagline: string | null, root: string }} ctx
 */
export function shotSpecErrors(md, { tagline, root }) {
  const { header, rows } = parseShotSpec(md);
  if (!header) return ['no "## Shots" table'];
  const errors = [];
  if (header.join("|") !== COLUMNS.join("|")) {
    errors.push(`columns must be: ${COLUMNS.join(" | ")} (got ${header.join(" | ")})`);
    return errors;
  }
  if (!rows.length) errors.push("the Shots table has no rows");
  if (!tagline) errors.push("no <h1> tagline found in website/landing/index.html");
  const seen = new Set();
  for (const r of rows) {
    const at = `line ${r.line} (${r.id || "no id"})`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id)) errors.push(`${at}: id must be kebab-case`);
    else if (seen.has(r.id)) errors.push(`${at}: duplicate id`);
    seen.add(r.id);
    if (!DATASETS.has(r.dataset)) errors.push(`${at}: dataset must be one of ${[...DATASETS].join(", ")}`);
    if (!r.setup) errors.push(`${at}: setup is empty`);
    if (!(Number(r.duration_s) > 0)) errors.push(`${at}: duration_s must be a positive number`);
    if (!KINDS.has(r.caption_kind)) errors.push(`${at}: caption_kind must be one of ${[...KINDS].join(", ")}`);
    if (r.caption_kind === "none" ? r.caption : !r.caption) {
      errors.push(`${at}: caption must be ${r.caption_kind === "none" ? "empty when caption_kind is none" : "set"}`);
    }
    if (r.caption_kind === "tagline" && tagline && r.caption !== tagline) {
      errors.push(`${at}: tagline caption "${r.caption}" doesn't match the landing <h1> "${tagline}"`);
    }
    if (/^manual:/i.test(r.capture)) {
      if (!GRANDFATHERED_MANUAL.has(r.id) || r.status !== "shipped") {
        errors.push(
          `${at}: new or re-shot rows need a capture script (a repo path) or "N/A: <reason>", not "manual:"` +
            (GRANDFATHERED_MANUAL.has(r.id) ? " (grandfathered only while status is shipped)" : ""),
        );
      } else if (!r.capture.replace(/^manual:/i, "").trim()) {
        errors.push(`${at}: manual capture needs a description`);
      }
    } else if (/^N\/A\b/i.test(r.capture)) {
      if (!/^N\/A:\s*\S/i.test(r.capture)) errors.push(`${at}: capture "N/A" needs a reason ("N/A: <reason>")`);
    } else {
      const path = r.capture.replace(/^`|`$/g, "");
      if (!path || !existsSync(join(root, path)) || !statSync(join(root, path)).isFile()) {
        errors.push(`${at}: capture script \`${path}\` doesn't exist`);
      }
    }
    if (!STATUSES.has(r.status)) errors.push(`${at}: status must be one of ${[...STATUSES].join(", ")}`);
    if (!OWNERS.has(r.owner)) errors.push(`${at}: owner must be one of ${[...OWNERS].join(", ")}`);
  }
  return errors;
}
