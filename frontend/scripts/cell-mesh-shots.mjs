// Prototype stills: coloured cell meshes in the Inspect cube (branch proto-cell-mesh).
// Env: BASE_URL, WINDOW (µm), NOIMAGE=1, MESH_ALPHA, FIXTURE (harness ?fixture=), SHOTS (dir), TAG,
// RECOLOR (path to a JSON of synced trait deltas to replay, e.g. what `w.color = "FOV"` sends),
// CUT=x|y|z (Python-style `volume_cut` write through the window's middle on that axis),
// EXTRA_QS (more harness query params), HIDE_DIAL=1 (hide the DialKit panel),
// MODE=raycast (Viv labels, `?mesh=0`), VIEWS=top,orbit (default both), PITCH (extra orbit drag, px).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const BASE = process.env.BASE_URL, WIN = process.env.WINDOW ?? "100", SHOTS = process.env.SHOTS;
const ALPHA = process.env.MESH_ALPHA, NOIMAGE = process.env.NOIMAGE === "1", TAG = process.env.TAG ?? "";
const log = (...a) => console.error(`[w${WIN}${NOIMAGE ? " noimage" : ""}]`, ...a);
const sel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const browser = await chromium.launch({ args: ["--disable-lcd-text", "--font-render-hinting=none", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.text().includes("cell mesh")) log("console", m.text().slice(0, 300)); });
// Network accounting: label-image requests (should be none with client meshes) and bytes per kind.
const net = { labels: 0, image: 0, parquet_bytes: 0, cellmesh: 0 };
page.on("response", async (resp) => {
  const u = resp.url();
  if (u.includes("/labels/")) net.labels++;
  else if (u.includes("/images/")) net.image++;
  else if (u.includes("/cellmesh/")) net.cellmesh++;
  else if (u.endsWith(".parquet")) net.parquet_bytes += Number(resp.headers()["content-length"] ?? 0);
});
const q = new URLSearchParams({ window: WIN });
if (process.env.FIXTURE) q.set("fixture", process.env.FIXTURE);
if (ALPHA) q.set("meshAlpha", ALPHA);
const MODE = process.env.MODE ?? "mesh", CUT = process.env.CUT ?? "";
const VIEWS = (process.env.VIEWS ?? "top,orbit").split(",");
if (MODE === "raycast") q.set("mesh", "0");
for (const [k, v] of new URLSearchParams(process.env.EXTRA_QS ?? "")) q.set(k, v);
await page.goto(`${BASE}/?${q}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
// HIDE_DIAL=1: no harness DialKit panel over the view (before/after comparisons).
if (process.env.HIDE_DIAL === "1") await page.addStyleTag({ content: ".dialkit-root{display:none!important}" });
await page.waitForFunction(() => window.__landmarksEngine?.getViewState?.()?.zoom != null, null, { timeout: 180_000 });
// The 2D view in the same colours, for comparison.
if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); }
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").first().boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 180_000 });
const ready = MODE === "raycast"
  ? `document.querySelector('${sel}')?.getAttribute("data-refining") === "false" && document.querySelector('${sel}')?.getAttribute("data-label-cells") > "0"`
  : `document.querySelector('${sel}')?.getAttribute("data-mesh-shown") === "true" && Number(document.querySelector('${sel}')?.getAttribute("data-mesh-tris")) > 0 && document.querySelector('${sel}')?.getAttribute("data-refining") === "false"`;
await page.waitForFunction(ready, null, { timeout: 300_000 }).catch(() => log("ready wait timed out"));
await page.waitForTimeout(1500);
if (NOIMAGE) {
  const t = page.getByTestId("layer-toggle-image");
  if ((await t.getAttribute("aria-pressed")) === "true") await t.click();
  await page.waitForTimeout(1500);
}
let cutApplied = null;
if (CUT) {
  cutApplied = await page.evaluate((axis) => {
    const m = window.__landmarksModel;
    const c = [...m.get("volume_cut")];
    const cx = m.get("inspect_cx"), cy = m.get("inspect_cy");
    // Keep the half facing the camera's side of the orbit: +x, -y, and the lower z.
    if (axis === "x") c[0] = cx;
    if (axis === "y") c[3] = cy;
    if (axis === "z") c[5] = (c[4] + c[5]) / 2;
    m.set("volume_cut", c);
    m.save_changes?.();
    return c;
  }, CUT);
  await page.waitForTimeout(1000);
  await page.waitForFunction(`document.querySelector('${sel}')?.getAttribute("data-refining") === "false"`, null, { timeout: 300_000 }).catch(() => log("cut refine wait timed out"));
  await page.waitForTimeout(2000);
}
const attrs = () => page.evaluate((s) => { const el = document.querySelector(s); return Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-mesh") || ["data-points", "data-labels", "data-outside", "data-label-cells", "data-image-contrast", "data-image-gamma"].includes(a.name)).map((a) => [a.name, a.value])); }, sel);
const name = (view) => `${SHOTS}/${MODE === "raycast" ? "raycast" : "mesh"}-colour${CUT ? `-cut${CUT}` : ""}${TAG}${ALPHA ? `-a${ALPHA}` : ""}${NOIMAGE ? "-noimage" : ""}-w${WIN}-${view}.png`;
const view = page.locator(sel);
const workerStats = () => page.evaluate(() => ({ worker: window.__cellMeshWorker ?? null, heap_mb: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null }));
const r = { net, ...(await workerStats()), mode: MODE, cut_axis: CUT || null, volume_cut: cutApplied, window_um: Number(WIN), image: !NOIMAGE, mesh_alpha: ALPHA ?? null, before: await attrs() };
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
if (SHOTS && VIEWS.includes("top")) await view.screenshot({ path: name("top") });
if (!VIEWS.includes("orbit")) { log(JSON.stringify(r)); await browser.close(); process.exit(0); }
if (process.env.PRESET) {
  await page.getByRole("radio", { name: { iso: "Oblique view", side: "Side view", top: "Top view" }[process.env.PRESET.toLowerCase()] }).click();
  await page.waitForTimeout(2500);
}
const vb = await view.boundingBox();
const PITCH = Number(process.env.PITCH ?? 0);
// ORBIT_DX/DY: total drag (px). A cut makes the box faces grabbable (a press on one
// moves the cut), so with a cut the drag starts on empty canvas near the view's corner.
const DX = Number(process.env.ORBIT_DX ?? 240), DY = Number(process.env.ORBIT_DY ?? 150 + PITCH);
const sx = vb.x + (CUT ? 24 : vb.width * 0.5), sy = vb.y + (CUT ? vb.height * 0.5 : vb.height * 0.5);
await page.mouse.move(sx, sy);
await page.mouse.down();
for (let i = 1; i <= (DX || DY ? 12 : 0); i++) {
  const before = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
  await page.mouse.move(sx + (i * DX) / 12, sy + (i * DY) / 12);
  await page.waitForFunction((b) => (window.__volumeCubeRenderCount ?? 0) > b, before, { timeout: 15_000, polling: "raf" }).catch(() => {});
}
await page.mouse.up();
await page.waitForTimeout(2000);
if (SHOTS) await view.screenshot({ path: name(process.env.ORBIT_NAME ?? "orbit") });
r.after_orbit = await attrs();
r.volume_cut_after = await page.evaluate(() => window.__landmarksModel.get("volume_cut"));
log(JSON.stringify(r));
await browser.close();
