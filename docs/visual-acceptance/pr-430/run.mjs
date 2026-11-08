/**
 * Build the landmarks-volume harness in production and capture from `vite preview`.
 *
 *   CAPTURE_FRONTEND=/path/to/frontend \
 *   CAPTURE_SHA=$(git -C /path/to/repo rev-parse HEAD) \
 *   CAPTURE_LABEL=pre418-a8730ff \
 *   CAPTURE_PORT=4173 \
 *   CAPTURE_RESET=0 \
 *   CAPTURE_CLIP=0 \
 *   node docs/visual-acceptance/pr-430/run.mjs
 *
 * CAPTURE_RESET=1 and CAPTURE_CLIP=1 also record the Image Reset stills and the clip.
 * Does not start `vite` (the dev server).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(process.env.CAPTURE_FRONTEND ?? path.resolve(here, "../../../frontend"));
const repo = path.resolve(frontend, "..");
const sha = process.env.CAPTURE_SHA ?? execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const label = process.env.CAPTURE_LABEL ?? `pr-${sha.slice(0, 7)}`;
const port = process.env.CAPTURE_PORT ?? "4173";
const dist = path.resolve(process.env.CAPTURE_DIST ?? path.join("/tmp/milume-pr430", label));
const config = path.join(here, "harness.vite.config.mjs");
const viteBin = path.join(frontend, "node_modules/vite/bin/vite.js");

if (!existsSync(viteBin)) {
  throw new Error(`vite is not installed at ${viteBin}. Run npm ci in that frontend.`);
}

const env = {
  ...process.env,
  CAPTURE_FRONTEND: frontend,
  CAPTURE_SHA: sha,
  CAPTURE_LABEL: label,
  CAPTURE_DIST: dist,
  CAPTURE_URL: `http://127.0.0.1:${port}`,
};

function run(args) {
  const result = spawn(process.execPath, args, { env, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    result.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} exited ${code}`));
    });
  });
}

console.log(`production harness build label=${label} sha=${sha} frontend=${frontend}`);
await run([viteBin, "build", "--config", config]);

const assetsDir = path.join(dist, "assets");
const assetHashes = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
      .map((name) => {
        const buf = readFileSync(path.join(assetsDir, name));
        return { name, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
      })
  : [];
console.log("built assets", JSON.stringify(assetHashes));

const preview = spawn(process.execPath, [viteBin, "preview", "--config", config, "--host", "127.0.0.1", "--port", port, "--strictPort"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let previewLog = "";
preview.stdout.on("data", (chunk) => {
  previewLog += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  previewLog += chunk.toString();
});

async function waitForStamp() {
  const url = `http://127.0.0.1:${port}/build-stamp.json`;
  for (let i = 0; i < 80; i += 1) {
    if (preview.exitCode !== null) {
      throw new Error(`vite preview exited ${preview.exitCode}\n${previewLog}`);
    }
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const stamp = await res.json();
        if (stamp.gitSha !== sha) throw new Error(`stamp sha ${stamp.gitSha}`);
        return stamp;
      }
    } catch (err) {
      if (String(err).includes("stamp sha")) throw err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview did not serve build-stamp.json\n${previewLog}`);
}

try {
  const stamp = await waitForStamp();
  console.log("preview stamp", JSON.stringify(stamp));
  await run([path.join(here, "capture.mjs")]);
} finally {
  preview.kill("SIGTERM");
}
