#!/usr/bin/env node
/**
 * Letterbox Clarence's hand capture to 904×820 (no crop) for the GALT tutorial dark still.
 *
 *   node scripts/capture-galt-tutorial-still-dark.mjs
 *
 * Env:
 *   CLARENCE_GALT_STILL — source PNG (default: repo-relative path if present)
 *   GALT_DARK_PAD_COLOR — pad hex without # (default 0a0a0a, harness neutral-950)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tutorials", "explore-cells-2d");
const defaultSrc = join(
  root,
  "frontend",
  "dev",
  "clarence-galt-tutorial-still.png",
);
const src = process.env.CLARENCE_GALT_STILL ?? defaultSrc;
const out = join(assets, "still-galt-selection.dark.png");
const pad = process.env.GALT_DARK_PAD_COLOR ?? "0a0a0a";

if (!existsSync(src)) {
  console.error("missing Clarence still:", src);
  console.error("Set CLARENCE_GALT_STILL to the hand-capture PNG.");
  process.exit(1);
}

const vf = `scale=904:820:force_original_aspect_ratio=decrease,pad=904:820:(ow-iw)/2:(oh-ih)/2:color=0x${pad}`;
const r = spawnSync(
  "ffmpeg",
  ["-y", "-i", src, "-vf", vf, out],
  { encoding: "utf8", stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("wrote", out);
