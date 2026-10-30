/**
 * Production-build visual evidence for #376 (PR B).
 * Run from frontend/: npm run build && node scripts/capture-design-tokens-376-evidence.mjs [--before|--after]
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(scriptsDir, "..");
const outDir = process.env.MILUME_376_EVIDENCE_DIR || "/opt/cursor/artifacts/design-tokens-376";
const phase = process.argv.includes("--before") ? "before" : "after";
const port = Number(process.env.MILUME_376_PORT || 5199);

mkdirSync(outDir, { recursive: true });

function waitForUrl(url, ms = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((r) => (r.ok ? resolve() : schedule()))
        .catch(() => schedule());
    };
    const schedule = () => {
      if (Date.now() - start > ms) reject(new Error(`timeout waiting for ${url}`));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

async function seedEvidenceState(page) {
  await page.evaluate(async () => {
    const res = await fetch("/squidpy-niche-fixture.json");
    if (!res.ok) throw new Error(`fixture ${res.status}`);
    const patch = await res.json();
    const model = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const b = eng.getViewportWorldBounds();
    const W = b.xMax - b.xMin;
    const H = b.yMax - b.yMin;
    const X = (f) => b.xMin + W * f;
    const Y = (f) => b.yMin + H * f;
    for (const [k, v] of Object.entries(patch)) model.set(k, v);
    model.set("landmarks", [
      {
        id: "measure-line",
        type: "line",
        vertices: [
          [X(0.35), Y(0.42)],
          [X(0.55), Y(0.48)],
        ],
        color: "#00e5ff",
        line_style: "solid",
      },
    ]);
    model.set("selected_kind", "landmark");
    model.set("selected_index", 0);
    model.set("mode", "select");
    model.save_changes();
  });
  await page.waitForTimeout(1200);

  for (const dock of [".landmarks__chrome-dock--right", ".landmarks__chrome-dock--left"]) {
    const el = page.locator(dock);
    if ((await el.getAttribute("data-collapsed")) === "true") {
      const side = dock.includes("right") ? "Show right panel" : "Show left panel";
      await page.getByRole("button", { name: side }).click();
    }
  }

  await page.getByTestId("explore-color-by").getByRole("tab", { name: "category" }).click();
  await expectVisible(page.getByTestId("info-donut"));
  await expectVisible(page.getByTestId("landmark-measure"));

  await page.locator(".landmarks-cat-avatars").first().scrollIntoViewIfNeeded();
  await page.getByTestId("selection-row").first().hover();
  await page.waitForTimeout(300);
}

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForLandmarks(page) {
  await page.locator(".landmarks").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
}

async function bootHarness(page, theme) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await waitForLandmarks(page);
}

const vite = spawn(
  "npm",
  ["run", "dev:landmarks", "--", "--host", "127.0.0.1", `--port`, String(port), "--strictPort"],
  { cwd: frontendDir, stdio: "inherit", env: { ...process.env } },
);

try {
  await waitForUrl(`http://127.0.0.1:${port}/`);
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const theme of ["light", "dark"]) {
    const themed = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await themed.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `
        .harness-toolbar { display: none !important; }
        *, *::before, *::after { animation: none !important; transition: none !important; }
      `;
      document.documentElement.appendChild(style);
    });
    await bootHarness(themed, theme);
    await seedEvidenceState(themed);
    const widget = themed.locator(".landmarks").first();
    const path = join(outDir, `${phase}-${theme}-widget.png`);
    await widget.screenshot({ path, timeout: 120_000 });
    console.log("wrote", path);
    await themed.close();
  }

  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
