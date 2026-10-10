/**
 * PR #143 before/after: buffered spline on toy harness, fixed camera (resetZoom).
 * Usage: PORT=5177 OUT=/path/before.png node scripts/capture-pr143-buffer-evidence.mjs
 */
import { chromium } from "@playwright/test";

const PORT = Number(process.env.PORT || 5173);
const OUT = process.env.OUT;
if (!OUT) {
  console.error("set OUT=/path/to.png");
  process.exit(1);
}

const VIEWPORT = { width: 1280, height: 900 };

function bufferedLandmarks(cx, cy) {
  return [
    {
      id: "vessel",
      type: "line",
      vertices: [[cx - 140, cy - 20], [cx - 40, cy + 10]],
      buffer_width: 0,
    },
    {
      id: "tumour nest",
      type: "point",
      vertices: [[cx + 80, cy + 70]],
      buffer_width: 0,
    },
    {
      id: "artery",
      type: "spline",
      tension: 0.35,
      buffer_width: 72,
      buffer_side: "both",
      vertices: [
        [cx - 90, cy - 50],
        [cx - 20, cy - 30],
        [cx + 50, cy - 10],
        [cx + 110, cy + 15],
      ],
    },
  ];
}

async function main() {
  const base = `http://127.0.0.1:${PORT}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(() => {
    window.localStorage.setItem("milume-harness-theme", "dark");
  });
  await page.goto(base, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator(".landmarks").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });

  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { animation: none !important; transition: none !important; }
    `;
    document.head.appendChild(style);
  });

  await page.evaluate((landmarks) => {
    const m = window.__landmarksModel;
    const [xMin, xMax] = m.get("x_bounds");
    const [yMin, yMax] = m.get("y_bounds");
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const scaled = landmarks.map((lm) => ({
      ...lm,
      vertices: lm.vertices.map(([x, y]) => [x + cx, y + cy]),
    }));
    m.set("landmarks", scaled);
    m.set("selections", []);
    m.set("selected_kind", "");
    m.set("selected_index", -1);
    m.set("mode", "navigate");
    m.save_changes();
    window.__landmarksEngine.resetZoom();
  }, bufferedLandmarks(0, 0));

  await page.waitForTimeout(700);
  await page.locator(".landmarks__plot-host").screenshot({ path: OUT });
  const colors = await page.evaluate(() => {
    const engine = window.__landmarksEngine;
    return {
      stroke: engine.landmarkStrokeColor(2),
      buffer: engine.landmarkBufferFillColor?.(2) ?? null,
    };
  });
  console.log("wrote", OUT, "port", PORT, colors);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
