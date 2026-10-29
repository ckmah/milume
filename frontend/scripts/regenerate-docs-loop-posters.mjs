#!/usr/bin/env node
/** Rebuild *.poster.webp from existing *.mp4 at ~45% duration (distinct mid-loop frame). */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ffmpeg, probeVideoMeta } from "./lib/docs-tool-media.mjs";

const root = join(import.meta.dirname, "..", "..", "website", "content", "assets", "tools");
const SKIP = new Set(["inspect-3d"]);

function walk(dir, out = []) {
  const rel = dir.slice(root.length + 1);
  if (rel && SKIP.has(rel.split("/")[0])) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".dark.mp4") || name.endsWith(".light.mp4")) out.push(p);
  }
  return out;
}

for (const mp4 of walk(root)) {
  const poster = mp4.replace(/\.(dark|light)\.mp4$/, ".$1.poster.webp");
  const meta = probeVideoMeta(mp4);
  const at = Math.max(0.5, meta.seconds * 0.45);
  ffmpeg(["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", "-q:v", "80", poster]);
  console.log(poster);
}
