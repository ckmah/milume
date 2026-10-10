/**
 * Local SwiftShader timings for issue #91 (face-hover path + orbit drag).
 * Usage: node scripts/volume-perf-bench.mjs
 * Env: BENCH_CUT_MODE=uncut|zcut, BENCH_ARTIFACT_DIR=/opt/cursor/artifacts
 * Requires: DEV_WIDGET=landmarks-volume vite on http://127.0.0.1:5173
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const HOVER_STEPS = 40;
const ORBIT_STEPS = 20;
const artifactDir = process.env.BENCH_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
const revTag = process.env.BENCH_REV_TAG ?? "run";

mkdirSync(artifactDir, { recursive: true });

async function layerOn(page, testId) {
  const el = page.getByTestId(testId);
  if (await el.count() && (await el.getAttribute("aria-pressed")) !== "true") {
    await el.click();
  }
}

async function cubeAttrs(page) {
  return page.evaluate(() => {
    const el = document.querySelector(
      '[role="dialog"][aria-label="Cube"] .volume-cube__view',
    );
    if (!el) return null;
    return {
      labels: el.getAttribute("data-labels"),
      image: el.getAttribute("data-image"),
      labelCells: el.getAttribute("data-label-cells"),
      refining: el.getAttribute("data-refining"),
      labelMode: el.getAttribute("data-label-mode"),
      imageMode: el.getAttribute("data-image-mode"),
      renders: window.__volumeCubeRenderCount ?? 0,
    };
  });
}

async function nonBlankPixels(page, view) {
  const png = await view.screenshot();
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { nonBlank: 0, total: 0 };
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let nonBlank = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 24) nonBlank++;
    }
    return { nonBlank, total: width * height };
  }, png.toString("base64"));
}

async function assertDrawing(page, view, phase) {
  const attrs = await cubeAttrs(page);
  if (!attrs) throw new Error(`${phase}: no .volume-cube__view`);
  if (attrs.labels !== "on") throw new Error(`${phase}: data-labels=${attrs.labels}`);
  if (attrs.image !== "on") throw new Error(`${phase}: data-image=${attrs.image}`);
  if (Number(attrs.labelCells) < 1) throw new Error(`${phase}: data-label-cells=${attrs.labelCells}`);
  if (attrs.refining !== "false") throw new Error(`${phase}: still refining`);
  const px = await nonBlankPixels(page, view);
  if (px.nonBlank < 5000) {
    throw new Error(`${phase}: cube view mostly blank (${px.nonBlank}/${px.total} pixels)`);
  }
  return { attrs, px };
}

async function bench(page) {
  const rev = process.env.BENCH_REV_TAG ?? "run";
  await page.goto(`http://127.0.0.1:5173/?window=100&_bench=${rev}-${Date.now()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  await page.mouse.click(
    ...(await page.evaluate(() => {
      const c = document.querySelector("canvas.landmarks__webgl").getBoundingClientRect();
      return [c.x + c.width / 2, c.y + c.height / 2];
    })),
  );
  await page.getByRole("dialog", { name: "Cube" }).waitFor();
  const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  await view.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );

  const cutMode = process.env.BENCH_CUT_MODE === "zcut" ? "zcut" : "uncut";
  if (cutMode === "zcut") {
    await page.evaluate(() => {
      const m = window.__landmarksModel;
      if (!m) return;
      const cut = [...m.get("volume_cut")];
      const z0 = cut[4];
      const z1 = cut[5];
      const mid = (z0 + z1) / 2;
      const thick = Math.max(6, (z1 - z0) * 0.04);
      cut[4] = mid - thick / 2;
      cut[5] = mid + thick / 2;
      m.set("volume_cut", cut);
      m.save_changes();
    });
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
      null,
      { timeout: 120_000 },
    );
  }

  await layerOn(page, "layer-toggle-labels");
  await layerOn(page, "layer-toggle-image");
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-labels") === "on",
    null,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-image") === "on",
    null,
    { timeout: 120_000 },
  );

  const side = page.getByRole("radio", { name: "Side view" });
  if (await side.count()) {
    await side.click();
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-pitch") === "0",
      null,
      { timeout: 30_000 },
    );
  }
  await page.waitForFunction(
    () => {
      const centers = document.querySelector(".volume-cube__view")?.getAttribute("data-cut-centers");
      return Boolean(centers && centers.length > 0);
    },
    null,
    { timeout: 60_000 },
  ).catch(() => {});

  const pre = await assertDrawing(page, view, "pre-orbit");
  const box = await view.boundingBox();
  if (!box) throw new Error("no cube view box");

  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  const hoverStart = performance.now();
  for (let i = 0; i < HOVER_STEPS; i++) {
    const t = i / (HOVER_STEPS - 1);
    const x = box.x + box.width * (0.22 + t * 0.56);
    const y = box.y + box.height * (0.18 + Math.sin(t * Math.PI * 2) * 0.08 + t * 0.35);
    await page.mouse.move(x, y);
  }
  await page.waitForTimeout(300);
  const hoverMs = performance.now() - hoverStart;
  const hoverRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  const orbitStart = performance.now();
  const orbitFrameRenders = [];
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= ORBIT_STEPS; i++) {
    const before = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
    await page.mouse.move(box.x + box.width * 0.5 + i * 12, box.y + box.height * 0.5 + i * 6);
    await page.waitForFunction((b) => (window.__volumeCubeRenderCount ?? 0) > b, before, {
      timeout: 30_000,
    });
    const after = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
    orbitFrameRenders.push(after - before);
    if (i === Math.floor(ORBIT_STEPS / 2)) {
      await view.screenshot({ path: `${artifactDir}/bench-${revTag}-${cutMode}-mid-orbit.png` });
      await assertDrawing(page, view, "mid-orbit");
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const orbitMs = performance.now() - orbitStart;
  const orbitRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

  const post = await assertDrawing(page, view, "post-orbit");
  if (orbitRenders < ORBIT_STEPS) {
    throw new Error(`orbit: only ${orbitRenders} deck renders for ${ORBIT_STEPS} moves`);
  }
  const minPerFrame = Math.min(...orbitFrameRenders);
  if (minPerFrame < 1) {
    throw new Error(`orbit: frame with zero new renders (${orbitFrameRenders.join(",")})`);
  }

  return {
    cutMode,
    hoverMs,
    hoverRenders,
    orbitMs,
    orbitRenders,
    orbitFrameRenders,
    labelCells: Number(pre.attrs.labelCells),
    nonBlankPixels: pre.px.nonBlank,
    postNonBlankPixels: post.px.nonBlank,
  };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", () => {});
try {
  const result = await bench(page);
  writeFileSync(`${artifactDir}/bench-${revTag}-last.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (err) {
  console.error("Bench failed:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
