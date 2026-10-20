#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "..", "evidence", "inspect-minimap-218");

async function boot(page) {
  await page.goto("http://127.0.0.1:5173/?harness=landmarks-volume&points=0&labelAlpha=0.4");
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
}

async function openCube(page) {
  const target = await page.evaluate(() => window.__landmarksEngine.getViewState().target);
  await page.evaluate(([x, y]) => {
    const model = window.__landmarksModel;
    model.set("inspect_cx", x);
    model.set("inspect_cy", y);
    model.set("inspect_open", true);
    model.save_changes();
  }, target);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ state: "visible" });
  await page.getByTestId("inspect-minimap-canvas").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const sq = document.querySelector('[data-testid="inspect-minimap-canvas"]')?.dataset.square;
    return Boolean(sq && sq.length > 0);
  });
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await boot(page);
await openCube(page);
await page.screenshot({ path: join(outDir, "inspect-minimap-dark.png") });

await page.evaluate(() => {
  document.querySelector(".landmarks")?.classList.remove("dark", "landmarks--dark");
  document.querySelector(".landmarks")?.classList.add("landmarks--light");
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, "inspect-minimap-light.png") });

await browser.close();
console.log(`Wrote evidence to ${outDir}`);
