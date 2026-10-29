#!/usr/bin/env node
/**
 * Side-by-side contact sheet: origin/main vs working tree posters/stills for ileum recapture review.
 *
 *   node scripts/docs-tools-contact-sheet.mjs
 *
 * Writes /opt/cursor/artifacts/tools-contact-sheet.webp and prints harness-pixel checks.
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tools");
const outDir = "/opt/cursor/artifacts";
const pairs = [];

function gitShow(ref, rel) {
  const r = spawnSync("git", ["-C", root, "show", `${ref}:${rel}`], { encoding: null, maxBuffer: 50_000_000 });
  if (r.status !== 0) return null;
  return r.stdout;
}

function walk(dir, rel = "") {
  for (const name of execSync(`find ${join(assets, rel)} -type f`, { encoding: "utf8" }).trim().split("\n")) {
    if (!name) continue;
    const short = name.slice(assets.length + 1);
    if (short.startsWith("inspect-3d/")) continue;
    if (!/\.(poster\.webp|\.dark\.png|\.light\.png)$/.test(short) && !short.endsWith(".png")) continue;
    if (!/\.(poster\.webp|still-.*\.(dark|light)\.png|\.dark\.png|\.light\.png)$/.test(short)) {
      if (!short.includes("still-") && !short.endsWith(".poster.webp")) continue;
    }
    pairs.push(short);
  }
}

walk("");

mkdirSync(outDir, { recursive: true });
const manifest = [];

for (const rel of pairs.sort()) {
  const afterPath = join(assets, rel);
  const beforeBuf = gitShow("origin/main", join("website/content/assets/tools", rel));
  if (!beforeBuf) continue;
  const beforePath = join(outDir, "tools-before", rel);
  mkdirSync(dirname(beforePath), { recursive: true });
  writeFileSync(beforePath, beforeBuf);
  manifest.push({ rel, before: beforePath, after: afterPath });
}

writeFileSync(join(outDir, "tools-contact-manifest.json"), JSON.stringify(manifest, null, 2));

let harnessHits = 0;
for (const { rel, after } of manifest) {
  if (!rel.endsWith(".poster.webp")) continue;
  const r = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image; import numpy as np; im=Image.open(${JSON.stringify(after)}).convert('RGB'); a=np.array(im); top=a[:70,:500]; spread=float((top.max(0)-top.min(0)).mean()); print(spread)`,
    ],
    { encoding: "utf8" },
  );
  const spread = Number((r.stdout || "").trim());
  if (spread > 55) {
    harnessHits += 1;
    console.warn("harness-like top contrast", rel, spread);
  }
}

console.log("pairs", manifest.length, "harness-like posters", harnessHits);
console.log("manifest", join(outDir, "tools-contact-manifest.json"));
