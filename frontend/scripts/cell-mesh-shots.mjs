// Prototype stills: coloured cell meshes in the Inspect cube (branch proto-cell-mesh).
// Env: BASE_URL, WINDOW (µm), NOIMAGE=1, MESH_ALPHA, FIXTURE (harness ?fixture=), SHOTS (dir), TAG,
// RECOLOR (path to a JSON of synced trait deltas to replay, e.g. what `w.color = "FOV"` sends).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const BASE = process.env.BASE_URL, WIN = process.env.WINDOW ?? "100", SHOTS = process.env.SHOTS;
const ALPHA = process.env.MESH_ALPHA, NOIMAGE = process.env.NOIMAGE === "1", TAG = process.env.TAG ?? "";
const log = (...a) => console.error(`[w${WIN}${NOIMAGE ? " noimage" : ""}]`, ...a);
const sel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const browser = await chromium.launch({ args: ["--disable-lcd-text", "--font-render-hinting=none", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.text().includes("cell mesh")) log("console", m.text().slice(0, 300)); });
const q = new URLSearchParams({ window: WIN });
if (process.env.FIXTURE) q.set("fixture", process.env.FIXTURE);
if (ALPHA) q.set("meshAlpha", ALPHA);
await page.goto(`${BASE}/?${q}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.waitForFunction(() => window.__landmarksEngine?.getViewState?.()?.zoom != null, null, { timeout: 180_000 });
// The 2D view in the same colours, for comparison.
if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); }
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").first().boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 180_000 });
const ready = `document.querySelector('${sel}')?.getAttribute("data-mesh-shown") === "true" && Number(document.querySelector('${sel}')?.getAttribute("data-mesh-tris")) > 0 && document.querySelector('${sel}')?.getAttribute("data-refining") === "false"`;
await page.waitForFunction(ready, null, { timeout: 300_000 }).catch(() => log("ready wait timed out"));
await page.waitForTimeout(1500);
if (NOIMAGE) {
  const t = page.getByTestId("layer-toggle-image");
  if ((await t.getAttribute("aria-pressed")) === "true") await t.click();
  await page.waitForTimeout(1500);
}
const attrs = () => page.evaluate((s) => { const el = document.querySelector(s); return Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-mesh") || a.name === "data-points" || a.name === "data-labels").map((a) => [a.name, a.value])); }, sel);
const name = (view) => `${SHOTS}/mesh-colour${TAG}${ALPHA ? `-a${ALPHA}` : ""}${NOIMAGE ? "-noimage" : ""}-w${WIN}-${view}.png`;
const view = page.locator(sel);
const r = { window_um: Number(WIN), image: !NOIMAGE, mesh_alpha: ALPHA ?? null, before: await attrs() };
if (process.env.RECOLOR) {
  const delta = JSON.parse(readFileSync(process.env.RECOLOR, "utf8"));
  if (SHOTS) await view.screenshot({ path: name("top-before-recolor") });
  await page.evaluate((d) => { const m = window.__landmarksModel; for (const [k, v] of Object.entries(d)) m.set(k, v); m.save_changes?.(); }, delta);
  await page.waitForTimeout(2500);
  r.recolor = Object.keys(delta);
  r.after = await attrs();
  if (SHOTS) await view.screenshot({ path: name("top-after-recolor") });
  log(JSON.stringify(r));
  await browser.close();
  process.exit(0);
}
if (SHOTS) await view.screenshot({ path: name("top") });
const vb = await view.boundingBox();
await page.mouse.move(vb.x + vb.width * 0.5, vb.y + vb.height * 0.5);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  const before = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
  await page.mouse.move(vb.x + vb.width * 0.5 + i * 20, vb.y + vb.height * 0.5 + i * 12.5);
  await page.waitForFunction((b) => (window.__volumeCubeRenderCount ?? 0) > b, before, { timeout: 120_000, polling: "raf" }).catch(() => {});
}
await page.mouse.up();
await page.waitForTimeout(2000);
if (SHOTS) await view.screenshot({ path: name("orbit") });
r.after_orbit = await attrs();
log(JSON.stringify(r));
await browser.close();
