import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "landing/assets/hero-renderer.js");
const contentAssets = join(root, "content/assets");
mkdirSync(dirname(outFile), { recursive: true });
mkdirSync(contentAssets, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "landing/hero/index.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  outfile: outFile,
  legalComments: "none",
});

const { gzipSync } = await import("node:zlib");
const { readFileSync } = await import("node:fs");
const raw = readFileSync(outFile);
const gz = gzipSync(raw);
console.log(`hero-renderer.js ${raw.length} bytes (${gz.length} gzip)`);

const { copyFileSync } = await import("node:fs");
for (const name of [
  "hero-renderer.js",
  "hero-points.bin",
  "hero-poster.png",
  "hero-poster-800.png",
]) {
  copyFileSync(join(root, "landing/assets", name), join(contentAssets, name));
}
