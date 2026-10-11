/**
 * First Inspect cube render: comm (kernel fetch) vs browser HTTP against the HF #134 store.
 *
 * Usage (vite landmarks-volume harness on :5173):
 *   node scripts/volume-hf134-first-render-bench.mjs
 */
import { chromium } from "@playwright/test";

const RUNS = Number(process.env.BENCH_RUNS ?? 3);
const baseUrl = process.env.BENCH_BASE_URL ?? "http://127.0.0.1:5173";

async function timeFirstRender(page, fixture) {
  const q = encodeURIComponent(fixture);
  await page.goto(`${baseUrl}/?fixture=${q}&budgets=2000,20000&_bench=${Date.now()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  const t0 = Date.now();
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const [x, y] = await page.evaluate(() => {
    const c = document.querySelector("canvas.landmarks__webgl").getBoundingClientRect();
    return [c.x + c.width / 2, c.y + c.height / 2];
  });
  await page.mouse.click(x, y);
  await page.getByRole("dialog", { name: "Cube" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 180_000 },
  );
  const ms = Date.now() - t0;
  const httpFetches = await page.evaluate(() => window.__volumeHttpFetches?.() ?? 0);
  const commReads = await page.evaluate(() => window.__volumeCommReads?.() ?? 0);
  return { ms, httpFetches, commReads };
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

const browser = await chromium.launch();
const page = await browser.newPage();

const commMs = [];
const httpMs = [];
for (let i = 0; i < RUNS; i++) {
  commMs.push((await timeFirstRender(page, "/landmarks-volume-fixture.hf134-bench.json")).ms);
  httpMs.push((await timeFirstRender(page, "/landmarks-volume-fixture.hf134-bench.http.json")).ms);
}
await browser.close();

const out = {
  runs: RUNS,
  hf_store:
    "https://huggingface.co/datasets/Stellaromics/demo/resolve/main/test/134/small.sdata.zarr/",
  comm_first_render_ms: { samples: commMs, median: median(commMs) },
  http_first_render_ms: { samples: httpMs, median: median(httpMs) },
};
console.log(JSON.stringify(out, null, 2));
