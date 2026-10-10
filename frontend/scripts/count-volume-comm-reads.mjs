import { chromium } from "@playwright/test";

const base = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(base, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), undefined, {
  timeout: 120_000,
});
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor();
await page.waitForFunction(
  () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
  undefined,
  { timeout: 120_000 },
);
const reads = await page.evaluate(() => window.__volumeCommReads?.() ?? -1);
const paths = await page.evaluate(() => window.__volumeCommPaths?.() ?? []);
console.log(JSON.stringify({ reads, paths }, null, 2));
await browser.close();
