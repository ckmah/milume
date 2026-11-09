#!/usr/bin/env node
/**
 * Read demos/recipes/<slug>/shots.yaml, open the assembled recipe page, assert
 * widget state, draw a pointer overlay, and capture screenshots.
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8765";
const slug = process.argv[3] ?? process.env.MILUME_RECIPE_SLUG ?? "squidpy_color";
const shotsPath =
  process.env.MILUME_RECIPE_SHOTS_YAML ?? path.join(REPO_ROOT, "demos", "recipes", slug, "shots.yaml");
const outDir = process.env.MILUME_RECIPE_SHOT_OUT ?? "/tmp";
mkdirSync(outDir, { recursive: true });

const doc = parseYaml(readFileSync(shotsPath, "utf8"));
if (!doc?.shots?.length) {
  console.error("capture-recipe-shots: no shots in", shotsPath);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });

async function placePointer(page, normX, normY) {
  await page.evaluate(
    ({ nx, ny }) => {
      let dot = document.getElementById("milume-recipe-pointer");
      if (!dot) {
        const style = document.createElement("style");
        style.id = "milume-recipe-pointer-style";
        style.textContent = `
      #milume-recipe-pointer {
        position: fixed; width: 18px; height: 18px; margin: -4px 0 0 -4px;
        border: 2px solid rgba(255,255,255,0.95); border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
        pointer-events: none; z-index: 2147483646;
      }
    `;
        document.documentElement.appendChild(style);
        dot = document.createElement("div");
        dot.id = "milume-recipe-pointer";
        document.body.appendChild(dot);
      }
      dot.style.display = "block";
      dot.style.left = `${nx * window.innerWidth}px`;
      dot.style.top = `${ny * window.innerHeight}px`;
    },
    { nx: normX, ny: normY },
  );
}

async function readWidgetState(page) {
  return page.evaluate(() => {
    const m = (window).__landmarksModel;
    if (!m || typeof m.get !== "function") {
      return { ok: false, error: "no_landmarks_model" };
    }
    const color = m.get("color");
    const selections = m.get("selections") || [];
    const vs = (window).__landmarksEngine?.getViewState?.() ?? null;
    const xb = m.get("x_bounds");
    const yb = m.get("y_bounds");
    let view = "custom";
    if (
      vs &&
      Array.isArray(vs.target) &&
      vs.target.length >= 2 &&
      Array.isArray(xb) &&
      xb.length >= 2 &&
      Array.isArray(yb) &&
      yb.length >= 2 &&
      Number.isFinite(Number(vs.zoom)) &&
      Number.isFinite(Number(vs.minZoom))
    ) {
      const cx = (Number(xb[0]) + Number(xb[1])) / 2;
      const cy = (Number(yb[0]) + Number(yb[1])) / 2;
      const atCenter =
        Math.abs(Number(vs.target[0]) - cx) < 1e-2 &&
        Math.abs(Number(vs.target[1]) - cy) < 1e-2;
      const atFitZoom = Math.abs(Number(vs.zoom) - (Number(vs.minZoom) + 1)) < 1e-3;
      if (atCenter && atFitZoom) view = "fit";
    }
    return {
      ok: true,
      color: color == null ? "" : String(color),
      selection_count: Array.isArray(selections) ? selections.length : -1,
      view,
    };
  });
}

for (const shot of doc.shots) {
  const pagePath = doc.page ?? `/docs/how-to/recipes/${slug}/index.html`;
  const url = `${baseUrl.replace(/\/$/, "")}${pagePath}`;
  const context = await browser.newContext({ viewport: { width: 1400, height: 960 } });
  const page = await context.newPage();
  const scheme = shot.theme === "slate" ? "slate" : "default";
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate((s) => {
    document.body.setAttribute("data-md-color-scheme", s);
    document.documentElement.setAttribute("data-md-color-scheme", s);
  }, scheme);
  await page.waitForTimeout(400);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => Boolean((window).__landmarksModel && (window).__landmarksEngine?.getViewState?.()),
    { timeout: 120_000 },
  );
  await page.waitForTimeout(800);
  const state = await readWidgetState(page);
  if (!state.ok) {
    console.error("capture-recipe-shots:", shot.id, state.error);
    await browser.close();
    process.exit(1);
  }
  if (state.color !== shot.column) {
    console.error(
      `capture-recipe-shots: ${shot.id} expected color=${shot.column} got ${state.color}`,
    );
    await browser.close();
    process.exit(1);
  }
  if (state.selection_count !== shot.selection_count) {
    console.error(
      `capture-recipe-shots: ${shot.id} expected selection_count=${shot.selection_count} got ${state.selection_count}`,
    );
    await browser.close();
    process.exit(1);
  }
  if (state.view !== shot.view) {
    console.error(
      `capture-recipe-shots: ${shot.id} expected view=${shot.view} got ${state.view}`,
    );
    await browser.close();
    process.exit(1);
  }
  await page.locator("canvas").first().evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.waitForTimeout(200);
  const px = shot.pointer?.norm_x ?? 0.5;
  const py = shot.pointer?.norm_y ?? 0.5;
  await placePointer(page, px, py);
  await page.waitForTimeout(200);
  const out = path.join(outDir, `recipe-${slug}-${shot.id}-${scheme}.png`);
  await page.screenshot({ path: out });
  const buf = readFileSync(out);
  const md5 = createHash("md5").update(buf).digest("hex");
  console.log(JSON.stringify({ shot: shot.id, path: out, md5 }, null, 0));
  await context.close();
}

await browser.close();
