/**
 * Long-task and backdrop-raster measures for colon pan (#122 AC).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const artifactDir = process.env.BENCH_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
const port = Number(process.env.BENCH_PORT ?? 5173);
const profile = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : process.env.MILUME_VOLUME_PROFILE ?? "colon";
const compareMain = process.argv.includes("--compare-main");

mkdirSync(artifactDir, { recursive: true });

const LAUNCH_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

function gitRev(label) {
  const r = spawnSync("git", ["rev-parse", label], { encoding: "utf8" });
  return r.stdout.trim();
}

async function measurePan(page, durationMs = 2000) {
  await page.evaluate(() => {
    performance.clearMeasures("backdrop-raster");
    window.__longTaskCapture = { tasks: [], obs: null };
    window.__frameCapture = { gaps: [], last: performance.now(), obs: null };
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTaskCapture.tasks.push(e.duration);
    });
    obs.observe({ type: "longtask", buffered: true });
    window.__longTaskCapture.obs = obs;
    const tick = (t) => {
      const prev = window.__frameCapture.last;
      if (prev > 0) {
        const gap = t - prev;
        if (gap > 24) window.__frameCapture.gaps.push(gap);
      }
      window.__frameCapture.last = t;
      window.__frameCapture.raf = requestAnimationFrame(tick);
    };
    window.__frameCapture.raf = requestAnimationFrame(tick);
  });
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) {
    return { longTaskCount: 0, longTaskMs: 0, longTaskMax: 0, rasterN: 0, rasterP50: 0, rasterP95: 0 };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const steps = Math.max(8, Math.floor(durationMs / 80));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(cx - 140 + t * 280, cy - 60 + t * 120, { steps: 2 });
    await page.waitForTimeout(Math.floor(durationMs / steps));
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    window.__longTaskCapture?.obs?.disconnect();
    cancelAnimationFrame(window.__frameCapture?.raf ?? 0);
    const tasks = window.__longTaskCapture?.tasks ?? [];
    const gaps = window.__frameCapture?.gaps ?? [];
    const raster = performance.getEntriesByName("backdrop-raster", "measure").map((e) => e.duration);
    raster.sort((a, b) => a - b);
    return {
      longTaskCount: tasks.length,
      longTaskMs: tasks.reduce((a, b) => a + b, 0),
      longTaskMax: tasks.length ? Math.max(...tasks) : 0,
      droppedFrames: gaps.length,
      rasterN: raster.length,
      rasterP50: raster[Math.floor(raster.length * 0.5)] ?? 0,
      rasterP95: raster[Math.floor(raster.length * 0.95)] ?? 0,
    };
  });
}

async function runLabel(revTag, channelMode = "default") {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${port}/?noDialkit=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__landmarksEngine?.getBackdropPick?.()?.level != null, null, {
    timeout: 120_000,
  });
  if (channelMode !== "default" && profile === "issue122-2d") {
    await page.evaluate((mode) => {
      const lm = window.__landmarksModel;
      const vol = lm.get("volume") || {};
      const all = vol.channels || [];
      const pick =
        mode === "1"
          ? ["DAPI"]
          : mode === "4"
            ? ["DAPI", "PanCK", "CD45", "Ki67"]
            : ["DAPI", "PanCK"];
      lm.set(
        "_image_channels",
        all.map((c) => ({ ...c, visible: pick.includes(c.name) })),
      );
      lm.save_changes();
    }, channelMode);
    await page.waitForTimeout(800);
  }
  const pan = await measurePan(page);
  await browser.close();
  return { revTag, profile, channelMode, ...pan };
}

async function main() {
  const rows = [];
  const head = gitRev("HEAD");
  const modes =
    profile === "issue122-2d" ? ["1", "2", "4"] : profile === "colon" ? ["3d"] : ["default"];
  for (const mode of modes) {
    rows.push(await runLabel(`branch-${head.slice(0, 8)}`, mode));
  }
  if (compareMain && profile === "colon") {
    spawnSync("git", ["stash", "push", "-m", "longtask-bench", "--", ":!frontend/dev/landmarks-volume/public"], {
      stdio: "inherit",
    });
    const mainRef = "ea54331";
    spawnSync(
      "git",
      ["-C", join(process.cwd(), ".."), "checkout", mainRef, "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"],
      { stdio: "inherit" },
    );
    const main = gitRev(mainRef);
    rows.push(await runLabel(`main-${main.slice(0, 8)}`, "3d"));
    spawnSync(
      "git",
      ["-C", join(process.cwd(), ".."), "checkout", "HEAD", "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"],
      { stdio: "inherit" },
    );
    spawnSync("git", ["stash", "pop"], { stdio: "inherit" });
  }

  const md = [
    "| label | long tasks | blocked ms | max task ms | dropped frames | raster n | raster p50 ms | raster p95 ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => {
      const ch = r.channelMode === "default" ? r.profile : `${r.channelMode}ch`;
      return `| ${r.revTag} ${ch} | ${r.longTaskCount} | ${r.longTaskMs.toFixed(1)} | ${r.longTaskMax.toFixed(1)} | ${r.droppedFrames} | ${r.rasterN} | ${r.rasterP50.toFixed(1)} | ${r.rasterP95.toFixed(1)} |`;
    }),
    "",
    "Scripted 2 s canvas pan with PerformanceObserver longtask plus backdrop-raster measures.",
  ].join("\n");
  writeFileSync(join(artifactDir, "depth-backdrop-122-longtask.md"), md);
  writeFileSync(join(artifactDir, "depth-backdrop-122-longtask.json"), JSON.stringify(rows, null, 2));
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
