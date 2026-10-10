/**
 * Real-kernel colon A2 perf: marimo + LandmarksWidget (not the Vite mock harness).
 */
import { chromium, expect } from "@playwright/test";

const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 5);
const base = (process.env.MARIMO_URL ?? "http://127.0.0.1:8890/").replace(/\/?$/, "/");

function median(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function waitForLandmarks(page) {
  await page.goto(base, { waitUntil: "networkidle", timeout: 600_000 });
  await page.locator("canvas.landmarks__webgl").waitFor({ timeout: 600_000 });
}

async function openInspectCube(page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await page.locator("canvas.landmarks__webgl").boundingBox();
  if (!box) throw new Error("no landmarks canvas");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 120_000 });
}

async function waitCubeSettled(page, timeout = 600_000) {
  const view = page.locator(".volume-cube__view");
  await view.waitFor({ timeout });
  await expect(view).toHaveAttribute("data-refining", "false", { timeout });
}

async function firstCubeRenderMs(page) {
  const t0 = Date.now();
  await openInspectCube(page);
  await waitCubeSettled(page);
  return Date.now() - t0;
}

async function inspectWindowMoveSettleMs(page) {
  const map = await page.locator("canvas.landmarks__webgl").boundingBox();
  if (!map) throw new Error("no map canvas");
  const t0 = Date.now();
  await page.mouse.move(map.x + map.width * 0.45, map.y + map.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width * 0.55, map.y + map.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await waitCubeSettled(page, 300_000);
  return Date.now() - t0;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await waitForLandmarks(page);

const firstCube = [];
const pan = [];
for (let i = 0; i < runs; i++) {
  if (i > 0) {
    await page.reload({ waitUntil: "networkidle" });
    await waitForLandmarks(page);
  }
  firstCube.push(await firstCubeRenderMs(page));
  pan.push(await inspectWindowMoveSettleMs(page));
}
await browser.close();

const out = {
  marimo_url: base,
  runs,
  first_cube_render_ms: { runs: firstCube.map((v) => Math.round(v)), median: Math.round(median(firstCube)) },
  inspect_window_move_settle_ms: {
    runs: pan.map((v) => Math.round(v)),
    median: Math.round(median(pan)),
  },
};
console.log(JSON.stringify(out, null, 2));
