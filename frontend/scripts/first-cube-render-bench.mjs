/**
 * Time from Inspect cube open to first settled render (data-refining=false).
 * Usage: LANDMARKS_URL=http://localhost:5173 FIXTURE=/landmarks-volume-fixture.small.json node scripts/first-cube-render-bench.mjs --runs 5
 */
import { chromium } from "@playwright/test";

const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 5);
const base = process.env.LANDMARKS_URL ?? "http://localhost:5173/";
const fixture = process.env.FIXTURE ?? "/landmarks-volume-fixture.small.json";
const url = `${base.replace(/\/?$/, "/")}?fixture=${encodeURIComponent(fixture)}`;

async function oneRun(page) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await page.waitForFunction(
    () => Boolean(window.__landmarksEngine?.getViewState?.()),
    undefined,
    { timeout: 300_000 },
  );
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const click = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas.landmarks__webgl");
    const c = canvas?.getBoundingClientRect();
    if (!c) throw new Error("no canvas");
    const model = window.__landmarksModel;
    const [x0, x1] = model.get("x_bounds");
    const [y0, y1] = model.get("y_bounds");
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const engine = window.__landmarksEngine;
    const vs = engine.getViewState();
    const { target, zoom } = vs;
    const scale = Math.pow(2, zoom);
    const sx = c.x + c.width / 2 + (cx - target[0]) * scale;
    const sy = c.y + c.height / 2 - (cy - target[1]) * scale;
    return { x: sx, y: sy };
  });
  const t0 = performance.now();
  await page.mouse.click(click.x, click.y);
  await page.getByRole("dialog", { name: "Cube" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    undefined,
    { timeout: 600_000 },
  );
  return performance.now() - t0;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const samples = [];
for (let i = 0; i < runs; i++) {
  samples.push(await oneRun(page));
  await page.reload({ waitUntil: "networkidle" });
}
await browser.close();

samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)];
console.log(JSON.stringify({ runs: samples, median_ms: Math.round(median) }));
