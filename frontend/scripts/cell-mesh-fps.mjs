// Prototype A/B: orbit FPS, cell meshes vs Viv label raycast, SwiftShader.
// Env: BASE_URL, MODE=mesh|raycast, WINDOW (µm), OUT (jsonl), SHOTS (dir, optional), MESH_ALPHA
import { chromium } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
const BASE = process.env.BASE_URL, MODE = process.env.MODE ?? "mesh", WIN = process.env.WINDOW ?? "100";
const OUT = process.env.OUT, SHOTS = process.env.SHOTS, ALPHA = process.env.MESH_ALPHA;
const log = (...a) => console.error(`[${MODE} ${WIN}]`, ...a);
const sel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const browser = await chromium.launch({ args: ["--disable-lcd-text", "--font-render-hinting=none", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.text().includes("cell mesh")) log("console", m.text().slice(0, 300)); });
const q = new URLSearchParams({ window: WIN });
if (MODE === "raycast") q.set("mesh", "0");
if (ALPHA) q.set("meshAlpha", ALPHA);
await page.goto(`${BASE}/?${q}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.waitForFunction(() => window.__landmarksEngine?.getViewState?.()?.zoom != null, null, { timeout: 180_000 });
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").first().boundingBox();
let t0 = performance.now();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 180_000 });
const ready = MODE === "mesh"
  ? `document.querySelector('${sel}')?.getAttribute("data-mesh-shown") === "true" && Number(document.querySelector('${sel}')?.getAttribute("data-mesh-tris")) > 0 && document.querySelector('${sel}')?.getAttribute("data-refining") === "false"`
  : `document.querySelector('${sel}')?.getAttribute("data-refining") === "false" && document.querySelector('${sel}')?.getAttribute("data-label-cells") > "0"`;
await page.waitForFunction(ready, null, { timeout: 300_000 }).catch(() => log("ready wait timed out"));
await page.waitForTimeout(1500);
const NOIMAGE = process.env.NOIMAGE === "1";
if (NOIMAGE) {
  const t = page.getByTestId("layer-toggle-image");
  if ((await t.getAttribute("aria-pressed")) === "true") await t.click();
  await page.waitForTimeout(1500);
}
const r = { image: !NOIMAGE, mode: MODE, window_um: Number(WIN), mesh_alpha: ALPHA ?? null, gl: "swiftshader", open_cube_ms: Math.round(performance.now() - t0) };
const attrs = await page.evaluate((s) => { const el = document.querySelector(s); return Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value])); }, sel);
Object.assign(r, { labels: attrs["data-labels"], label_cells: attrs["data-label-cells"], points: attrs["data-points"], mesh_tris: Number(attrs["data-mesh-tris"]), mesh_bytes: Number(attrs["data-mesh-bytes"]), viewport: [attrs["data-viewport-w"], attrs["data-viewport-h"]], level: attrs["data-level"] });
r.mesh_fetch_ms = await page.evaluate(() => window.__cellMeshFetchMs ?? null);
const view = page.locator(sel);
const vb = await view.boundingBox();
if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await view.screenshot({ path: `${SHOTS}/${MODE}${ALPHA ? `-a${ALPHA}` : ""}${process.env.NOIMAGE === "1" ? "-noimage" : ""}-w${WIN}-top.png` }); }
// Orbit: each step waits for the frame it caused, so ms/step is render throughput.
const STEPS = 30;
await page.mouse.move(vb.x + vb.width * 0.5, vb.y + vb.height * 0.5);
await page.mouse.down();
const frameMs = [];
t0 = performance.now();
for (let i = 1; i <= STEPS; i++) {
  const before = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
  const s = performance.now();
  await page.mouse.move(vb.x + vb.width * 0.5 + i * 8, vb.y + vb.height * 0.5 + i * 5);
  await page.waitForFunction((b) => (window.__volumeCubeRenderCount ?? 0) > b, before, { timeout: 120_000, polling: "raf" }).catch(() => {});
  frameMs.push(performance.now() - s);
}
await page.mouse.up();
r.orbit_steps = STEPS;
r.orbit_total_ms = Math.round(performance.now() - t0);
const sorted = [...frameMs].sort((a, b) => a - b);
r.orbit_ms_per_frame_median = Math.round(sorted[Math.floor(STEPS / 2)]);
r.orbit_ms_per_frame_p90 = Math.round(sorted[Math.floor(STEPS * 0.9)]);
r.orbit_fps = Math.round((1000 / (r.orbit_total_ms / STEPS)) * 100) / 100;
await page.waitForTimeout(1500);
if (SHOTS) await view.screenshot({ path: `${SHOTS}/${MODE}${ALPHA ? `-a${ALPHA}` : ""}${process.env.NOIMAGE === "1" ? "-noimage" : ""}-w${WIN}-orbit.png` });
log(JSON.stringify(r));
if (OUT) appendFileSync(OUT, JSON.stringify(r) + "\n");
await browser.close();
