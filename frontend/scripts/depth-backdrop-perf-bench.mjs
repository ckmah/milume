/**
 * Pan/zoom and depth-rail drag timings for #122 (backdrop raster measures, not vsync-limited rAF).
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

const LAUNCH_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];

function summarize(samples) {
  if (!samples.length) return { p50Ms: 0, p95Ms: 0, n: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}

async function measureScenario(page, kind) {
  const samples = await page.evaluate(async (scenarioKind) => {
    performance.clearMeasures("backdrop-raster");
    const eng = window.__landmarksEngine;
    const lm = window.__landmarksModel;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (scenarioKind === "pan" || scenarioKind === "rail-2d") {
      for (let i = 0; i < 3; i++) {
        const vs = eng.getViewState();
        const sign = scenarioKind === "pan" ? 1 : -1;
        eng.setViewState({
          ...vs,
          zoom: (vs.zoom ?? 0) + 0.35 + i * 0.08,
          target: [
            (vs.target?.[0] ?? 0) + sign * (25 + i * 19),
            (vs.target?.[1] ?? 0) + sign * (18 + i * 13),
            vs.target?.[2] ?? 0,
          ],
        });
        lm.set("_image_alpha", 0.88 + i * 0.04);
        lm.save_changes();
        await sleep(900);
      }
    } else if (scenarioKind === "rail-3d") {
      const lo0 = lm.get("z_band_lo_um");
      for (let i = 0; i < 6; i++) {
        lm.set("z_band_lo_um", lo0 + i * 0.9);
        lm.save_changes();
        await sleep(70);
      }
      eng?.noteBackdropZBandEnd?.();
      await sleep(900);
    } else if (scenarioKind === "band-3d") {
      const f0 = lm.get("z_focus_um");
      for (let i = 0; i < 5; i++) {
        lm.set("z_focus_um", f0 + i * 1.1);
        lm.save_changes();
        await sleep(70);
      }
      eng?.noteBackdropZBandEnd?.();
      await sleep(900);
    }
    await sleep(400);
    return performance.getEntriesByName("backdrop-raster", "measure").map((e) => e.duration);
  }, kind);
  const stats = summarize(samples);
  const gpu = await page.evaluate(() => {
    const mem = performance.memory;
    const pick = window.__landmarksEngine?.getBackdropPick?.();
    return {
      jsHeapMb: mem ? mem.usedJSHeapSize / (1024 * 1024) : null,
      pyramidLevel: pick?.level ?? null,
      pyramidFactor: pick?.factor ?? null,
    };
  });
  return { ...stats, ...gpu };
}

async function runBench(revTag, channelMode = "default") {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${port}/?noDialkit=1&_bench=${revTag}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await page.waitForFunction(
    () => window.__landmarksEngine?.getBackdropPick?.()?.level != null,
    null,
    { timeout: 120_000 },
  );

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

  const pan = { name: `pan-${channelMode}`, ...(await measureScenario(page, "pan")) };

  const railKind = profile === "colon" || channelMode === "3d" ? "rail-3d" : "rail-2d";
  const rail = { name: `rail-drag-${channelMode}`, ...(await measureScenario(page, railKind)) };

  const bandKind = profile === "colon" || channelMode === "3d" ? "band-3d" : "pan";
  const band3d =
    bandKind === "band-3d"
      ? { name: "band-move-3d", ...(await measureScenario(page, "band-3d")) }
      : { name: "band-move-3d", n: 0, p50Ms: 0, p95Ms: 0, jsHeapMb: null, pyramidLevel: null, pyramidFactor: null };

  await browser.close();
  return { revTag, profile, channelMode, pan, rail, band3d };
}

function gitRev(label) {
  const r = spawnSync("git", ["rev-parse", label], { encoding: "utf8" });
  return r.stdout.trim();
}

async function main() {
  const rows = [];
  const head = gitRev("HEAD");
  const channelModes =
    profile === "issue122-2d" ? ["1", "2", "4"] : profile === "colon" ? ["3d"] : ["default"];
  for (const channelMode of channelModes) {
    rows.push(await runBench(`pr-${head.slice(0, 8)}`, channelMode));
  }
  if (compareMain && profile === "issue122-2d") {
    const main = gitRev("origin/main");
    spawnSync("git", ["stash", "push", "-m", "bench-depth-backdrop", "--", ":!frontend/dev/landmarks-volume/public"], {
      stdio: "inherit",
    });
    spawnSync("git", ["checkout", "origin/main", "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"], {
      stdio: "inherit",
    });
    rows.push(await runBench(`main-${main.slice(0, 8)}`, "2"));
    spawnSync("git", ["checkout", "HEAD", "--", "frontend/src/widgets/landmarks", "milume/static/landmarks.js"], {
      stdio: "inherit",
    });
    spawnSync("git", ["stash", "pop"], { stdio: "inherit" });
  }
  const out = join(artifactDir, "depth-backdrop-122-perf.json");
  writeFileSync(out, JSON.stringify(rows, null, 2));
  const md = [
    "| scenario | n raster | p50 raster (ms) | p95 raster (ms) | p50 rail raster | p95 rail raster | p50 band raster | level (pan) | heap MB |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) => {
      const ch = r.channelMode === "default" ? "toy" : `${r.channelMode}ch`;
      return `| ${r.revTag} ${ch} | ${r.pan.n} | ${r.pan.p50Ms.toFixed(2)} | ${r.pan.p95Ms.toFixed(2)} | ${r.rail.p50Ms.toFixed(2)} | ${r.rail.p95Ms.toFixed(2)} | ${(r.band3d?.p50Ms ?? 0).toFixed(2)} | ${r.pan.pyramidLevel ?? "—"} | ${r.pan.jsHeapMb?.toFixed(1) ?? "—"} |`;
    }),
    "",
    "Measure: `performance.measure('backdrop-raster')` around comm/zarr fetch + CPU composite per refresh. Chromium flags `--disable-gpu-vsync --disable-frame-rate-limit`.",
    "",
    "Colon rail-drag p95 spikes when `preferCoarseLevel` serves the coarsest pyramid during band motion; `noteBackdropZBandEnd` on pointer-up triggers a fine refresh (acceptable during drag, refined at rest).",
  ].join("\n");
  writeFileSync(join(artifactDir, "depth-backdrop-122-perf.md"), md);
  console.log(md);
  console.log(`wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
