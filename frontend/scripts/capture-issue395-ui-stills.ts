/**
 * Light/dark DPR-2 stills for #395 (DAPI + PanCK cube + layer toggles).
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  bootIssue395LandmarksVolume,
  openIssue395CubeAtInspectCentre,
  openLayersPanelWithCubeOpen,
  setCubeLabels,
  setCubePreset,
  waitIssue395CubeReadyForCapture,
} from "../e2e/helpers/issue395-cube-flow.ts";

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
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await bootIssue395LandmarksVolume(page);
  await page.evaluate((dark) => {
    document.documentElement.classList.toggle("dark", dark);
  }, theme === "dark");
  await openIssue395CubeAtInspectCentre(page);
  await setCubeLabels(page, false);
  await setCubePreset(page, "Oblique view");
  await waitIssue395CubeReadyForCapture(page, `${theme} dual oblique`, "dual");
  await openLayersPanelWithCubeOpen(page);
  const sw = page.getByTestId("layer-channel-PanCK");
  const box = await sw.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy, { steps: 12 });
    await page.waitForTimeout(200);
  }
  await page.locator(".milume-widget.landmarks").screenshot({
    path: join(outDir, `395-cube-${theme}-dpr2-dual-oblique-toggles.png`),
  });
  await browser.close();
}

await captureTheme("light");
await captureTheme("dark");

async function captureMapBand() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    baseURL: new URL(base).origin,
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await bootIssue395LandmarksVolume(page);
  await page.waitForTimeout(800);
  await page.locator(".milume-widget.landmarks").screenshot({
    path: join(outDir, "395-map-band-dpr2-dual-blend.png"),
  });
  await browser.close();
}

await captureMapBand();
console.log(`Wrote stills under ${outDir}`);
