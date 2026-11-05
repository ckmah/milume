/**
 * Dual-channel cube diagnostic stills + RGB samples at projected PanCK site centres.
 * MILUME_VOLUME_PROFILE=issue395-3d dev server on :5173
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  bootIssue395LandmarksVolume,
  openIssue395CubeAtInspectCentre,
  setCubeLabels,
  setCubePreset,
  waitIssue395CubeReadyForCapture,
} from "../e2e/helpers/issue395-cube-flow.ts";
import {
  cubeGlInkStats,
  cubeScreenshotInkStats,
  CUBE_VOLUME_INSET,
} from "../e2e/helpers/shader-and-pixels.ts";

async function loadProjectedRoIs(page: import("@playwright/test").Page) {
  const { projectIssue395PanckRoIs } = await import("../e2e/helpers/issue395-panck-roi.ts");
  return projectIssue395PanckRoIs(page);
}

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const cubeViewSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

type SiteSample = {
  id: string;
  normX: number;
  normY: number;
  rgb: [number, number, number];
};

async function sampleProjectedSites(
  page: import("@playwright/test").Page,
  rois: Awaited<ReturnType<typeof loadProjectedRoIs>>,
): Promise<SiteSample[]> {
  const png = await page.locator(cubeViewSel).screenshot();
  return page.evaluate(
    async ({ b64, rois }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
      if (!ctx) return [];
      ctx.drawImage(img, 0, 0);
      const { width: w, height: h, data } = ctx.getImageData(0, 0, img.width, img.height);
      return rois.map((roi: { id: string; cx: number; cy: number }) => {
        const x = Math.min(w - 1, Math.max(0, Math.round(roi.cx * w)));
        const y = Math.min(h - 1, Math.max(0, Math.round(roi.cy * h)));
        const i = (y * w + x) * 4;
        return {
          id: roi.id,
          normX: roi.cx,
          normY: roi.cy,
          rgb: [data[i]!, data[i + 1]!, data[i + 2]!] as [number, number, number],
        };
      });
    },
    { b64: png.toString("base64"), rois },
  );
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  baseURL: new URL(base).origin,
});

await bootIssue395LandmarksVolume(page);
await openIssue395CubeAtInspectCentre(page);
await setCubeLabels(page, false);

const report: Record<string, unknown> = { base };

for (const preset of ["Top view", "Oblique view"] as const) {
  await setCubePreset(page, preset);
  await waitIssue395CubeReadyForCapture(page, `diagnostic ${preset}`, "dual");
  const gl = await cubeGlInkStats(page, CUBE_VOLUME_INSET);
  const shotInk = await cubeScreenshotInkStats(page, CUBE_VOLUME_INSET);
  const rois = await loadProjectedRoIs(page);
  const slug = preset === "Top view" ? "top" : "iso";
  const pngPath = join(outDir, `395-diagnostic-dual-${slug}-labels-off.png`);
  await page.locator(cubeViewSel).screenshot({ path: pngPath });
  const samples = rois.length ? await sampleProjectedSites(page, rois) : [];
  report[`${slug}Png`] = pngPath;
  report[`${slug}GlInk`] = gl;
  report[`${slug}ScreenshotInk`] = shotInk;
  report[`${slug}ProjectedRoIs`] = rois;
  report[`${slug}SiteRgb`] = samples;
}

await writeFile(join(outDir, "395-diagnostic-dual-channel-report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log("Wrote diagnostic PNGs and", join(outDir, "395-diagnostic-dual-channel-report.json"));
