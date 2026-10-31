/**
 * Pan/zoom and depth-rail drag frame times for #122 performance AC.
 *
 * Usage (production build recommended; dev harness ok for relative checks):
 *   cross-env DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=issue122-2d npm run dev:landmarks-volume -- --port 5173
 *   node scripts/depth-backdrop-perf-bench.mjs --profile issue122-2d
 *
 * Compare to main at the same merge-base:
 *   node scripts/depth-backdrop-perf-bench.mjs --compare-main
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.env.BENCH_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
const port = Number(process.env.BENCH_PORT ?? 5173);
const profile = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : process.env.MILUME_VOLUME_PROFILE ?? "toy";
const compareMain = process.argv.includes("--compare-main");

mkdirSync(artifactDir, { recursive: true });

async function measureScenario(page, name, action) {
  const samples = [];
  await page.evaluate(() => {
    window.__benchFrames = [];
    let last = performance.now();
    function tick(now) {
      window.__benchFrames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  await action(page);
  await page.waitForTimeout(800);
  const frames = await page.evaluate(() => window.__benchFrames ?? []);
  frames.sort((a, b) => a - b);
  const p50 = frames[Math.floor(frames.length * 0.5)] ?? 0;
  const p95 = frames[Math.floor(frames.length * 0.95)] ?? 0;
  const gpu = await page.evaluate(() => {
    const mem = performance.memory;
    const pick = window.__landmarksEngine?.getBackdropPick?.();
    return {
      jsHeapMb: mem ? mem.usedJSHeapSize / (1024 * 1024) : null,
      pyramidLevel: pick?.level ?? null,
      pyramidFactor: pick?.factor ?? null,
    };
  });
  return { name, frames: frames.length, p50Ms: p50, p95Ms: p95, ...gpu };
}

async function runBench(revTag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${port}/?_bench=${revTag}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));

  const pan = await measureScenario(page, "pan", async (p) => {
    const canvas = p.locator("canvas.landmarks__webgl").first();
    const box = await canvas.boundingBox();
    if (!box) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + 120, cy + 40, { steps: 12 });
    await p.mouse.up();
  });

  const rail = await measureScenario(page, "rail-drag", async (p) => {
    const lo = p.getByRole("slider", { name: "Lower z bound" });
    if ((await lo.count()) === 0) return;
    const box = await lo.boundingBox();
    if (!box) return;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height + 28, { steps: 8 });
    await p.mouse.up();
  });

  await browser.close();
  return { revTag, profile, pan, rail };
}

function gitRev(label) {
  const r = spawnSync("git", ["rev-parse", label], { encoding: "utf8" });
  return r.stdout.trim();
}

async function main() {
  const rows = [];
  const head = gitRev("HEAD");
  rows.push(await runBench(`pr-${head.slice(0, 8)}`));
  if (compareMain) {
    const main = gitRev("origin/main");
    spawnSync("git", ["stash", "push", "-m", "bench-depth-backdrop", "--", ":!frontend/dev/landmarks-volume/public"], {
      stdio: "inherit",
    });
    spawnSync("git", ["checkout", "origin/main", "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"], {
      stdio: "inherit",
    });
    rows.push(await runBench(`main-${main.slice(0, 8)}`));
    spawnSync("git", ["checkout", "HEAD", "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"], {
      stdio: "inherit",
    });
    spawnSync("git", ["stash", "pop"], { stdio: "inherit" });
  }
  const out = join(artifactDir, "depth-backdrop-122-perf.json");
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
