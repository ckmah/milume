/**
 * Light/dark DPR-2 stills for #395 (DAPI + PanCK cube + layer toggles, Iso preset).
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  hideLandmarksVolumeHarnessChrome,
  openIssue395CubeAtInspectCentre,
  openLayersPanelWithCubeOpen,
  setCubeLabels,
  setCubePreset,
  waitIssue395CubeReadyForCapture,
} from "../e2e/helpers/issue395-cube-flow.ts";
import {
  applyIssue395CaptureChromeTheme,
  assertIssue395HarnessTheme,
  issue395PointerMove,
  installIssue395PointerOverlay,
} from "../e2e/helpers/issue395-visual-capture.ts";
import { bootLandmarksVolumeHarness, stabilizeUi } from "../e2e/helpers.ts";
import { hideMapPointsForImageAssert } from "../e2e/helpers/shader-and-pixels.ts";

const outDir = join(process.cwd(), "..", "docs/visual-acceptance/issue395");
const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";

await mkdir(outDir, { recursive: true });

async function captureTheme(theme: "light" | "dark") {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    baseURL: new URL(base).origin,
  });
  await page.addInitScript((t) => {
    window.localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await bootLandmarksVolumeHarness(page, "noDialkit=1");
  await applyIssue395CaptureChromeTheme(page, theme);
  await assertIssue395HarnessTheme(page, theme);
  await hideLandmarksVolumeHarnessChrome(page);
  await hideMapPointsForImageAssert(page);
  await stabilizeUi(page);
  await installIssue395PointerOverlay(page);
  await openIssue395CubeAtInspectCentre(page);
  await setCubeLabels(page, false);
  await setCubePreset(page, "Oblique view");
  await waitIssue395CubeReadyForCapture(page, `${theme} iso`, "dual");
  await openLayersPanelWithCubeOpen(page);
  const sw = page.getByTestId("layer-channel-PanCK");
  const box = await sw.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await issue395PointerMove(page, cx, cy, 12);
    await page.waitForTimeout(200);
  } else {
    throw new Error("PanCK switch not visible for pointer overlay");
  }
  const outPath = join(outDir, `395-cube-${theme}-dpr2-iso-toggles.png`);
  await page.locator(".milume-widget.landmarks").screenshot({ path: outPath });
  await browser.close();
  return outPath;
}

async function captureMapBand() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    baseURL: new URL(base).origin,
  });
  await bootLandmarksVolumeHarness(page, "noDialkit=1");
  await applyIssue395CaptureChromeTheme(page, "dark");
  await hideLandmarksVolumeHarnessChrome(page);
  await hideMapPointsForImageAssert(page);
  await stabilizeUi(page);
  await page.waitForTimeout(800);
  await page.locator(".milume-widget.landmarks").screenshot({
    path: join(outDir, "395-map-band-dpr2-dual-blend.png"),
  });
  await browser.close();
}

const lightPath = await captureTheme("light");
const darkPath = await captureTheme("dark");
await captureMapBand();

const lightMd5 = createHash("md5").update(await readFile(lightPath)).digest("hex");
const darkMd5 = createHash("md5").update(await readFile(darkPath)).digest("hex");
if (lightMd5 === darkMd5) {
  throw new Error(`light and dark stills are identical (md5=${lightMd5})`);
}
console.log(`Wrote stills under ${outDir}`);
console.log(`light md5=${lightMd5}`);
console.log(`dark md5=${darkMd5}`);
