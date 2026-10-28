/**
 * Headless screenshot of marimo-studio zero-python export (issue #242 spike).
 * Usage: node capture-studio-screenshot.mjs <url> <output.png>
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const url = process.argv[2] ?? "http://127.0.0.1:8765/";
const out = process.argv[3] ?? "/opt/cursor/artifacts/studio-squidpy-zero-python.png";

await mkdir(dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
// anywidget / WebGL need extra time after zero-python hydration
await page.waitForTimeout(8000);

const widgetHost = page.locator("marimo-cell[name='landmark_map']");
await widgetHost.waitFor({ state: "attached", timeout: 60_000 });

const canvas = page.locator("marimo-cell[name='landmark_map'] canvas");
const canvasCount = await canvas.count();
let webgl = false;
if (canvasCount > 0) {
  webgl = await canvas.first().evaluate((el) => {
    const gl =
      el.getContext("webgl2") ||
      el.getContext("webgl") ||
      el.getContext("experimental-webgl");
    return Boolean(gl);
  });
}

const bbox = await widgetHost.boundingBox();
await page.screenshot({ path: out, fullPage: true });

const diag = await page
  .locator("[data-marimo-studio-diagnostic], [data-marimo-studio-runtime-diagnostic]")
  .allTextContents();

await browser.close();

console.log(
  JSON.stringify(
    {
      output: out,
      canvasCount,
      webglContextOnCanvas: webgl,
      widgetBBox: bbox,
      studioDiagnostics: diag,
      consoleErrors: consoleErrors.slice(0, 20),
    },
    null,
    2,
  ),
);
