import { chromium } from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { readdir } from "node:fs/promises";

const outVideo = process.env.OUT_VIDEO ?? "/opt/cursor/artifacts/inspect-move-after.webm";
const outPng = process.env.OUT_PNG ?? "/opt/cursor/artifacts/inspect-move-after.png";
const outDir = "/opt/cursor/artifacts/inspect-move-demo-tmp";

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/?window=100&budgets=20000,80000", { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor();
await page.waitForFunction(
  () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
  null,
  { timeout: 120_000 },
);
await page.waitForTimeout(800);
await page.keyboard.press("Escape");
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.5, { steps: 10 });
await page.mouse.up();
await page.getByRole("dialog", { name: "Cube" }).waitFor();
await page.waitForTimeout(1200);
const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
const vb = await view.boundingBox();
await page.keyboard.down("Shift");
await page.mouse.move(vb.x + vb.width * 0.5, vb.y + vb.height * 0.52);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(vb.x + vb.width * (0.5 + i * 0.035), vb.y + vb.height * 0.52);
  await page.waitForTimeout(80);
}
await page.mouse.up();
await page.keyboard.up("Shift");
await page.waitForTimeout(1500);
await page.screenshot({ path: outPng, fullPage: false });
await context.close();
await browser.close();
const webm = (await readdir(outDir)).find((f) => f.endsWith(".webm"));
if (webm) await rename(`${outDir}/${webm}`, outVideo);
console.log(`Wrote ${outVideo} and ${outPng}`);
