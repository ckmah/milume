#!/usr/bin/env node
/**
 * Scale Clarence's hand capture to 1068×728 (half of 2136×1456) with no crop or pad.
 *
 *   node scripts/capture-galt-tutorial-still-dark.mjs
 *
 * Env: CLARENCE_GALT_STILL — source PNG (default frontend/dev/clarence-galt-tutorial-still.png)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { GALT_TUTORIAL_STILL_SIZE } from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tutorials", "explore-cells-2d");
const defaultSrc = join(root, "frontend", "dev", "clarence-galt-tutorial-still.png");
const src = process.env.CLARENCE_GALT_STILL ?? defaultSrc;
const out = join(assets, "still-galt-selection.dark.png");
const { width, height } = GALT_TUTORIAL_STILL_SIZE;

if (!existsSync(src)) {
  console.error("missing Clarence still:", src);
  console.error("Set CLARENCE_GALT_STILL to the hand-capture PNG.");
  process.exit(1);
}

const vf = `scale=${width}:${height}`;
const r = spawnSync("ffmpeg", ["-y", "-i", src, "-vf", vf, out], {
  encoding: "utf8",
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("wrote", out, `${width}×${height}`);
