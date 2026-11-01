import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  bootIssue395LandmarksVolume,
  openIssue395CubeAtInspectCentre,
  prepareIssue395DapiOnlyObliqueView,
} from "./e2e/helpers/issue395-cube-flow.ts";
import { cubeGlInkStats, CUBE_VOLUME_INSET } from "./e2e/helpers/shader-and-pixels.ts";

async function waitReady(page: import("@playwright/test").Page) {
  // prepareIssue395DapiOnlyObliqueView already waits for capture-ready ink.
}

async function main() {
  const sha = execSync("git -C /workspace rev-parse HEAD").toString().trim();
  const shaShort = sha.slice(0, 7);
  const base = process.env.ISSUE395_BASE_URL ?? "http://127.0.0.1:5181";
  const pngPath = process.argv[2] ?? `/opt/cursor/artifacts/issue395/bisect-${shaShort}-oblique-inset.png`;
  mkdirSync("/opt/cursor/artifacts/issue395", { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, baseURL: base });
  await page.goto(`${base}/?noDialkit=1&_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await bootIssue395LandmarksVolume(page, "noDialkit=1");
  await openIssue395CubeAtInspectCentre(page);
  await prepareIssue395DapiOnlyObliqueView(page);
  await waitReady(page);

  const channels = await page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view').getAttribute("data-channels");
  const gl = await cubeGlInkStats(page, CUBE_VOLUME_INSET);
  await page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view').screenshot({ path: pngPath });

  const pass = (gl?.tissue ?? 0) >= 4000 && (gl?.blueTissue ?? 0) >= 1500;
  const out = { sha, shaShort, base, channels, gl, pngPath, pass };
  writeFileSync(`/opt/cursor/artifacts/issue395/bisect-${shaShort}-oracle.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await browser.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
