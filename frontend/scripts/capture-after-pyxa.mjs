import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";
const base = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5174";
const tag = "after";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${base}/?window=100`, { waitUntil: "domcontentloaded", timeout: 120_000 });
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
for (const toggle of ["layer-toggle-labels", "layer-toggle-image"]) {
  const el = page.getByTestId(toggle);
  if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
}
const bar = page.getByTestId("context-inspect-toolbar");
await bar.getByRole("radio", { name: "Top view" }).click();
await page.waitForTimeout(800);
await view.screenshot({ path: `${outDir}/issue-117-pyxa-${tag}-uncut-top.png` });
await page.evaluate(() => {
  const m = window.__landmarksModel;
  if (m) m.set("volume_cut", [0, 1e9, 0, 1e9, 12, 18]);
});
await page.waitForFunction(
  () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
  null,
  { timeout: 120_000 },
);
await bar.getByRole("radio", { name: "Side view" }).click();
await page.waitForTimeout(800);
await view.screenshot({ path: `${outDir}/issue-117-pyxa-${tag}-zcut-side.png` });
await browser.close();

for (const shot of ["uncut-top", "zcut-side"]) {
  const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");
  const before = `${outDir}/issue-117-pyxa-before-${shot}.png`;
  const after = `${outDir}/issue-117-pyxa-${tag}-${shot}.png`;
  console.log(shot, "before", md5(before), "after", md5(after));
}
