/**
 * Ground-truth cube screenshots on current branch (run on main first).
 * Usage: DEV_WIDGET=landmarks-volume [MILUME_VOLUME_PROFILE=issue395-3d] npm run dev:landmarks-volume -- --port 5173
 * node scripts/main-ground-truth-cube.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const profile = process.env.MILUME_VOLUME_PROFILE ?? "toy";
const outDir = process.env.OUT ?? `/opt/cursor/artifacts/main-ground-truth-${profile}`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-lcd-text"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));

if (profile.includes("395")) {
  await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels");
    if (rows?.[1]) {
      rows[1].visible = false;
      window.__landmarksModel.set("_image_channels", rows);
      window.__landmarksModel.save_changes();
    }
  });
  await page.waitForTimeout(500);
}

await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const plot = page.locator(".landmarks__plot");
const box = await plot.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
await page.waitForFunction(
  () =>
    document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')?.getAttribute("data-refining") ===
    "false",
  null,
  { timeout: 120_000 },
);

for (const preset of ["Top view", "Oblique view"]) {
  await page.getByRole("radio", { name: preset }).click();
  await page.waitForTimeout(1500);
  const cubeView = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  const deckPng = await cubeView.screenshot();
  const widgetPng = await page.locator(".milume-widget.landmarks").screenshot();
  const slug = preset.replace(" ", "-").toLowerCase();
  writeFileSync(join(outDir, `cube-deck-${slug}.png`), deckPng);
  writeFileSync(join(outDir, `widget-${slug}.png`), widgetPng);
  const meta = await cubeView.evaluate((el) => ({
    format: el.getAttribute("data-image-format"),
    gpu: el.getAttribute("data-gpu-channel-bytes"),
    mode: el.getAttribute("data-image-mode"),
    channels: el.getAttribute("data-channels"),
  }));
  console.log(profile, preset, meta);
}

await browser.close();
console.log(`Wrote ${outDir}`);
