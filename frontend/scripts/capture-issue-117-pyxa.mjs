/**
 * Inspect cube screenshots on HF Stellaromics/demo small/ (landmarks-volume-small harness).
 * Usage: ISSUE_117_TAG=before|after node scripts/capture-issue-117-pyxa.mjs
 * Requires: MILUME_VOLUME_PROFILE=small vite on http://127.0.0.1:5173
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const tag = process.env.ISSUE_117_TAG;
if (!tag || !/^(before|after)$/.test(tag)) {
  console.error("Set ISSUE_117_TAG=before or after");
  process.exit(2);
}
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
try {
  await page.goto("http://127.0.0.1:5173/?window=100", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 300_000,
  });
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  await view.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 300_000 },
  );
  const labels = page.getByTestId("layer-toggle-labels");
  if ((await labels.getAttribute("aria-pressed")) !== "true") await labels.click();
  const image = page.getByTestId("layer-toggle-image");
  if ((await image.getAttribute("aria-pressed")) !== "true") await image.click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".volume-cube__view");
      return (
        el?.getAttribute("data-labels") === "on" &&
        el?.getAttribute("data-image") === "on" &&
        el?.getAttribute("data-coloring") === "groups"
      );
    },
    null,
    { timeout: 120_000 },
  );
  const bar = page.getByTestId("context-inspect-toolbar");
  const frameCube = async (preset) => {
    const name =
      preset === "top" ? "Top view" : preset === "iso" ? "Oblique view" : "Side view";
    await bar.getByRole("radio", { name }).click();
    await page.waitForTimeout(800);
    if (preset === "iso") {
      const zoomFile = `${outDir}/issue-117-pyxa-iso-zoom.txt`;
      const box = await view.boundingBox();
      if (!box) throw new Error("no cube view box");
      const cx = box.x + box.width * 0.5;
      const cy = box.y + box.height * 0.55;
      await page.mouse.move(cx, cy);
      const readZoom = () => Number(view.getAttribute("data-zoom"));
      const target = existsSync(zoomFile) ? Number(readFileSync(zoomFile, "utf8")) : null;
      if (target != null && Number.isFinite(target)) {
        for (let n = 0; n < 24; n++) {
          const z = Number(await readZoom());
          if (!Number.isFinite(z)) break;
          if (Math.abs(z - target) < 0.04) break;
          await page.mouse.wheel(0, z < target ? -120 : 120);
          await page.waitForTimeout(60);
        }
      } else {
        for (let w = 0; w < 6; w++) {
          await page.mouse.wheel(0, 140);
          await page.waitForTimeout(80);
        }
        const z = await readZoom();
        if (z) writeFileSync(zoomFile, String(z));
      }
      await page.waitForTimeout(600);
    }
  };
  for (const preset of ["top", "iso"]) {
    await frameCube(preset);
    const path = `${outDir}/issue-117-pyxa-${tag}-${preset}.png`;
    await view.screenshot({ path });
    console.log("wrote", path);
  }
} finally {
  await browser.close();
}
