#!/usr/bin/env node
/** Time gzip CSC decode + first dense column (harness, squidpy niche fixture). */
import { chromium } from "@playwright/test";

const url =
  process.argv[2] ??
  "http://127.0.0.1:5173/?fixture=/squidpy-niche-fixture.json&eagerGenes=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForFunction(() => Boolean(window.__landmarksEngine));

const timing = await page.evaluate(async () => {
  const model = window.__landmarksModel;
  const genes = model.get("gene_names").map((g) => g.name);
  const gene = genes.find((n) => n === "Lgr5") ?? genes[0];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const engine = window.__landmarksEngine;
    const done = () => {
      if (engine.getGeneStats().pinnedGenes === genes.length) resolve(undefined);
    };
    if (engine.getGeneStats().pinnedGenes === genes.length) resolve(undefined);
    else {
      const unsub = engine.subscribe?.(() => {
        done();
        unsub?.();
      });
    }
  });
  const decodedMs = performance.now() - t0;
  model.set({ active_genes: [gene], color_mode: "continuous" });
  await new Promise((resolve) => {
    const engine = window.__landmarksEngine;
    const tick = () => {
      if (engine.getGeneStats().denseColumns >= 1) resolve(undefined);
      else requestAnimationFrame(tick);
    };
    tick();
  });
  const colourMs = performance.now() - t0;
  return { decodedMs, colourMs, gene, nGenes: genes.length };
});

await browser.close();
console.log(JSON.stringify(timing, null, 2));
