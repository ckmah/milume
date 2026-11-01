/**
 * Dual-channel cube bisect: GL inset stats per bisect mode on Oblique and Top.
 * Usage: ISSUE395_BASE_URL=http://127.0.0.1:5181 npx tsx scripts/issue395-dual-bisect.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

import {
  bootIssue395LandmarksVolume,
  expectPanckVisible,
  openIssue395CubeAtInspectCentre,
  setCubeLabels,
  setCubePreset,
  waitIssue395CubeReadyForCapture,
} from "../e2e/helpers/issue395-cube-flow.ts";
import {
  analyzeIssue395PanckSitesInCubeView,
  cubeGlInkStats,
  CUBE_VOLUME_INSET,
} from "../e2e/helpers/shader-and-pixels.ts";

const outDir = "/opt/cursor/artifacts/issue395";
const base = process.env.ISSUE395_BASE_URL ?? "http://127.0.0.1:5181";

type BisectMode = "merge" | "ch0" | "ch1";
type Preset = "Top view" | "Oblique view";

function queryFor(mode: BisectMode) {
  if (mode === "ch0") return "noDialkit=1&cubeDebugDualBisect=ch0";
  if (mode === "ch1") return "noDialkit=1&cubeDebugDualBisect=ch1";
  return "noDialkit=1";
}

async function bootDualCube(page: import("@playwright/test").Page, mode: BisectMode) {
  const q = queryFor(mode);
  await page.goto(`${base}/?${q}&_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await bootIssue395LandmarksVolume(page, q);
  await openIssue395CubeAtInspectCentre(page);
  await expectPanckVisible(page, true);
  await setCubeLabels(page, false);
  await setCubePreset(page, "Top view");
  await setCubePreset(page, "Oblique view");
}

async function measurePreset(page: import("@playwright/test").Page, mode: BisectMode, preset: Preset) {
  await setCubePreset(page, preset);
  await waitIssue395CubeReadyForCapture(page, `dual bisect ${mode} ${preset}`, "dual");
  const gl = await cubeGlInkStats(page, CUBE_VOLUME_INSET);
  const analysis = preset === "Oblique view" ? await analyzeIssue395PanckSitesInCubeView(page) : null;
  return {
    preset,
    gl,
    gatePass: (gl?.tissue ?? 0) >= 4000,
    sites: analysis?.sites,
  };
}

async function runMode(page: import("@playwright/test").Page, mode: BisectMode) {
  await bootDualCube(page, mode);
  const oblique = await measurePreset(page, mode, "Oblique view");
  const top = await measurePreset(page, mode, "Top view");
  return { mode, oblique, top };
}

await mkdir(outDir, { recursive: true });
const head = execSync("git rev-parse HEAD", { cwd: "/workspace" }).toString().trim();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, baseURL: base });

const merge = await runMode(page, "merge");
const ch0 = await runMode(page, "ch0");
const ch1 = await runMode(page, "ch1");

const report = { head, base, results: [ch0, ch1, merge] };
await writeFile(`${outDir}/issue395-dual-bisect-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
