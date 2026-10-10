/**
 * Real-kernel colon A2 perf: marimo + LandmarksWidget (not the Vite mock harness).
 *
 * Prereqs:
 *   - COLON_A2_STORE points at colon_a2.sdata.zarr
 *   - marimo serving this app: `marimo run --headless --no-token --port $PORT frontend/dev/colon_a2_kernel_bench.py`
 *   - Built milume wheel / editable install in that kernel
 *
 * Usage:
 *   MARIMO_URL=http://127.0.0.1:8890 node scripts/colon-a2-kernel-bench.mjs --runs=5
 */
import { chromium } from "@playwright/test";

const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 5);
const base = (process.env.MARIMO_URL ?? "http://127.0.0.1:8890/").replace(/\/?$/, "/");

function median(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function waitForLandmarks(page) {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await page.waitForFunction(
    () => {
      const host = document.querySelector("marimo-ui-element");
      const root = host?.shadowRoot;
      const canvas = root?.querySelector("canvas.landmarks__webgl") ?? document.querySelector("canvas.landmarks__webgl");
      return Boolean(canvas);
    },
    undefined,
    { timeout: 600_000 },
  );
}

async function canvasBox(page) {
  return page.evaluate(() => {
    const host = document.querySelector("marimo-ui-element");
    const root = host?.shadowRoot ?? document;
    const canvas = root.querySelector("canvas.landmarks__webgl");
    const c = canvas?.getBoundingClientRect();
    if (!c) throw new Error("no landmarks canvas");
    return { x: c.x, y: c.y, width: c.width, height: c.height };
  });
}

async function clickInspectCenter(page) {
  const box = await canvasBox(page);
  await page.evaluate(() => {
    const host = document.querySelector("marimo-ui-element");
    const sr = host?.shadowRoot;
    const btn = [...(sr ?? document).querySelectorAll("button,[role=radio]")].find(
      (el) => el.textContent?.trim() === "Inspect",
    );
    btn?.click();
  });
  const click = await page.evaluate(() => {
    const host = document.querySelector("marimo-ui-element");
    const root = host?.shadowRoot ?? document;
    const canvas = root.querySelector("canvas.landmarks__webgl");
    const c = canvas?.getBoundingClientRect();
    if (!c) throw new Error("no canvas");
    return { x: c.x + c.width * 0.5, y: c.y + c.height * 0.5 };
  });
  await page.mouse.click(click.x, click.y);
}

async function firstCubeRenderMs(page) {
  const t0 = performance.now();
  await clickInspectCenter(page);
  await page.waitForFunction(
    () => {
      const host = document.querySelector("marimo-ui-element");
      const root = host?.shadowRoot ?? document;
      const view = root.querySelector(".volume-cube__view");
      return view?.getAttribute("data-refining") === "false";
    },
    undefined,
    { timeout: 600_000 },
  );
  return performance.now() - t0;
}

async function panSettleMs(page) {
  const box = await canvasBox(page);
  const t0 = performance.now();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => {
      const host = document.querySelector("marimo-ui-element");
      const root = host?.shadowRoot ?? document;
      const view = root.querySelector(".volume-cube__view");
      return view?.getAttribute("data-refining") === "false";
    },
    undefined,
    { timeout: 120_000 },
  );
  return performance.now() - t0;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await waitForLandmarks(page);

const firstCube = [];
const pan = [];
for (let i = 0; i < runs; i++) {
  firstCube.push(await firstCubeRenderMs(page));
  pan.push(await panSettleMs(page));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForLandmarks(page);
}
await browser.close();

const out = {
  marimo_url: base,
  runs,
  first_cube_render_ms: { runs: firstCube, median: Math.round(median(firstCube)) },
  inspect_pan_settle_ms: { runs: pan.map((v) => Math.round(v)), median: Math.round(median(pan)) },
};
console.log(JSON.stringify(out, null, 2));
