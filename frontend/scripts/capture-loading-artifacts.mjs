#!/usr/bin/env node
/**
 * Capture PR screenshots and a short webm for issue #90 loading indicators.
 * Prereq: dev server on 5173 (landmarks + landmarks-volume harnesses).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const out = "/opt/cursor/artifacts";
const landmarksUrl = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const volumeUrl = process.env.VOLUME_URL ?? "http://127.0.0.1:5174";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

await page.addInitScript(() => {
  window.localStorage.setItem("milume-harness-theme", "dark");
  window.__landmarksPlotBootstrapHook = { delayMs: 2500 };
});
await page.goto(`${landmarksUrl}/`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="plot-bootstrap"][data-state="loading"]', { timeout: 15_000 });
await page.screenshot({ path: path.join(out, "issue-90-widget-loading.png") });
await page.waitForSelector('[data-testid="plot-bootstrap"]', { state: "detached", timeout: 30_000 });

await page.addInitScript(() => {
  window.__landmarksPlotBootstrapHook = { fail: true };
});
await page.goto(`${landmarksUrl}/`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="plot-bootstrap"][data-state="error"]');
await page.screenshot({ path: path.join(out, "issue-90-widget-error.png") });

const videoContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
const volPage = await videoContext.newPage();
await volPage.addInitScript(() => {
  window.localStorage.setItem("milume-harness-theme", "dark");
  window.__volumeCubeLoadHook = { delayMs: 1200 };
});
await volPage.goto(`${volumeUrl}/`, { waitUntil: "networkidle" });
await volPage.waitForFunction(() => {
  const eng = window.__landmarksEngine;
  return Boolean(eng?.getViewState?.()?.zoom);
});
await volPage.getByRole("radio", { name: "Inspect", exact: true }).click();
const canvas = volPage.locator("canvas.landmarks__webgl").first();
const box = await canvas.boundingBox();
await volPage.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await volPage.waitForSelector('[role="dialog"][aria-label="Cube"] [data-testid="cube-load-immersive"][data-state="loading"]', {
  timeout: 15_000,
});
await volPage.screenshot({ path: path.join(out, "issue-90-inspect-loading.png") });
await volPage.waitForSelector('[data-testid="cube-load-immersive"]', { state: "detached", timeout: 45_000 });
await volPage.waitForTimeout(800);

const errPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await errPage.addInitScript(() => {
  window.localStorage.setItem("milume-harness-theme", "dark");
  window.__volumeCubeLoadHook = { abortImage: true };
});
await errPage.goto(`${volumeUrl}/`, { waitUntil: "networkidle" });
await errPage.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()?.zoom));
await errPage.getByRole("radio", { name: "Inspect", exact: true }).click();
const errBox = await errPage.locator("canvas.landmarks__webgl").first().boundingBox();
await errPage.mouse.click(errBox.x + errBox.width * 0.5, errBox.y + errBox.height * 0.5);
await errPage.waitForSelector('[data-testid="cube-load-immersive"][data-state="error"]');
await errPage.screenshot({ path: path.join(out, "issue-90-inspect-error.png") });

const videoPath = await volPage.video()?.path();
await videoContext.close();
await browser.close();
if (videoPath) {
  const { copyFile } = await import("node:fs/promises");
  await copyFile(videoPath, path.join(out, "issue-90-widget-and-inspect.webm"));
}
console.log("Artifacts written to", out);
