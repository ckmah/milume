#!/usr/bin/env node
/**
 * Fail if banned Tailwind slate or cyan literals remain in landmarks widget sources.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const widgetRoot = join(repoRoot, "frontend/src/widgets/landmarks");
const enginePath = join(repoRoot, "milume/static/landmarks.js");

/** Documented ban list for #376 (Tailwind slate + cyan fallback + slate error scrim). */
export const BANNED_WIDGET_COLOR_LITERALS = [
  "#e2e8f0",
  "#1e293b",
  "#64748b",
  "#94a3b8",
  "#0f172a",
  "#f1f5f9",
  "#f8fafc",
  "#22d3ee",
];

const bannedRes = BANNED_WIDGET_COLOR_LITERALS.map(
  (h) => new RegExp(h.replace("#", "#"), "gi"),
);
const bannedSlateScrim = /rgba\(\s*15\s*,\s*23\s*,\s*42/gi;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(css|ts|tsx|js|mjs)$/.test(name) && !/\.(test|spec)\.(mjs|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...walk(widgetRoot), enginePath];
const hits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const re of bannedRes) {
    re.lastIndex = 0;
    if (re.test(text)) hits.push({ file, match: re.source });
  }
  bannedSlateScrim.lastIndex = 0;
  if (bannedSlateScrim.test(text)) hits.push({ file, match: "rgba(15, 23, 42" });
}

if (hits.length) {
  console.error("Banned slate/cyan literals found in widget CSS/TS:");
  for (const h of hits) {
    console.error(`  ${relative(repoRoot, h.file)} (${h.match})`);
  }
  process.exit(1);
}

console.log("check-widget-design-tokens: OK (no banned literals)");
