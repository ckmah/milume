// Evidence stills of the Inspect cube. Env: BASE_URL, WINDOW, FIXTURE, OUT (png path), CUT=x|y|z, PRESET=top|iso, ORBIT=1, NOIMAGE=1
import { chromium } from "@playwright/test";
const BASE = process.env.BASE_URL, WIN = process.env.WINDOW ?? "100", CUT = process.env.CUT ?? "";
const sel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error("console", m.text().slice(0, 300)); });
const q = new URLSearchParams({ window: WIN });
if (process.env.FIXTURE) q.set("fixture", process.env.FIXTURE);
await page.goto(`${BASE}/?${q}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.addStyleTag({ content: ".dialkit-root{display:none!important}" });
await page.waitForFunction(() => window.__landmarksEngine?.getViewState?.()?.zoom != null, null, { timeout: 180_000 });
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await page.locator("canvas.landmarks__webgl").first().boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 180_000 });
const ready = `document.querySelector('${sel}')?.getAttribute("data-refining") === "false" && document.querySelector('${sel}')?.getAttribute("data-labels") === "on"`;
await page.waitForFunction(ready, null, { timeout: 600_000 }).catch(() => console.error("ready wait timed out"));
await page.waitForTimeout(1500);
if (process.env.NOIMAGE === "1") { await page.getByTestId("layer-toggle-image").click(); await page.waitForTimeout(1500); }
if (CUT) {
  await page.evaluate((axis) => {
    const m = window.__landmarksModel;
    const c = [...m.get("volume_cut")];
    const cx = m.get("inspect_cx"), cy = m.get("inspect_cy");
    if (axis === "x") c[0] = cx;
    if (axis === "y") c[3] = cy;
    if (axis === "z") c[5] = (c[4] + c[5]) / 2;
    m.set("volume_cut", c);
    m.save_changes?.();
  }, CUT);
  await page.waitForTimeout(1000);
  await page.waitForFunction(ready, null, { timeout: 300_000 }).catch(() => console.error("cut wait timed out"));
  await page.waitForTimeout(2000);
}
const preset = process.env.PRESET ?? "top";
if (preset !== "top") {
  await page.getByRole("radio", { name: { iso: "Oblique view", side: "Side view" }[preset] }).click();
  await page.waitForTimeout(2500);
}
const view = page.locator(sel);
if (process.env.ORBIT === "1") {
  const vb = await view.boundingBox();
  const sx = vb.x + (CUT ? 24 : vb.width * 0.5), sy = vb.y + vb.height * 0.5;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const before = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
    await page.mouse.move(sx + (i * 240) / 12, sy + (i * 150) / 12);
    await page.waitForFunction((b) => (window.__volumeCubeRenderCount ?? 0) > b, before, { timeout: 15_000, polling: "raf" }).catch(() => {});
  }
  await page.mouse.up(); await page.waitForTimeout(2000);
}
await view.screenshot({ path: process.env.OUT });
const attrs = await page.evaluate((s) => { const el = document.querySelector(s); return Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value])); }, sel);
console.log(JSON.stringify({ out: process.env.OUT, labels: attrs["data-labels"], cells: attrs["data-label-cells"], coloring: attrs["data-coloring"], points: attrs["data-points"] }));
await browser.close();
