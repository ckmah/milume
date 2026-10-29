#!/usr/bin/env node
/** Capture integrated recipe page; optional runtime palette toggle check. */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const pageUrl =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/recipes/squidpy_color/index.html";
const labelPrefix = process.argv[3] ?? "";
const outDir = "/opt/cursor/artifacts";

const report = { url: pageUrl, labelPrefix, modes: {}, toggle: null };
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function readPlotSurface(page) {
  return page.evaluate(() => {
    const host = document.querySelector("marimo-anywidget");
    const root = host?.shadowRoot?.querySelector(".landmarks");
    const canvas = host?.shadowRoot?.querySelector("canvas.landmarks__webgl");
    const plot = canvas?.closest(".landmarks__plot");
    const studioHost = document.querySelector(".milume-recipe-studio-host");
    return {
      canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : "",
      plotBg: plot ? getComputedStyle(plot).backgroundColor : "",
      darkClass: Boolean(root?.classList.contains("landmarks--dark")),
      hostTheme: studioHost?.getAttribute("data-theme") ?? "",
      bodyScheme: document.body.getAttribute("data-md-color-scheme") ?? "default",
    };
  });
}

async function captureMode(scheme, label) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate((s) => {
    document.body.setAttribute("data-md-color-scheme", s);
    document.documentElement.setAttribute("data-md-color-scheme", s);
  }, scheme);
  if (scheme === "slate") {
    await page.waitForFunction(
      () => {
        const host = document.querySelector("marimo-anywidget");
        return Boolean(host?.shadowRoot?.querySelector(".landmarks.landmarks--dark"));
      },
      { timeout: 30_000 },
    );
  } else {
    await page.waitForFunction(
      () => {
        const host = document.querySelector("marimo-anywidget");
        const root = host?.shadowRoot?.querySelector(".landmarks");
        return Boolean(root && !root.classList.contains("landmarks--dark"));
      },
      { timeout: 30_000 },
    );
  }
  await page.waitForTimeout(500);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1500);
  const shot = `${outDir}/recipe-squidpy-zensical-${labelPrefix}${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  const bg = await page.locator(".milume-recipe-studio-wide marimo-cell").first().evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--marimo-cell-background").trim(),
  );
  const plot = await readPlotSurface(page);
  report.modes[label] = { screenshot: shot, console_errors: consoleErrors, cell_background: bg, plot };
  await context.close();
}

await captureMode("default", "light");
await captureMode("slate", "dark");

{
  const context = await browser.newContext({ viewport: { width: 1400, height: 960 } });
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  const beforePlot = await readPlotSurface(page);
  const before = await page.evaluate(
    () => document.body.getAttribute("data-md-color-scheme") || "default",
  );
  await page.evaluate(() => {
    document.body.setAttribute("data-md-color-scheme", "slate");
    document.documentElement.setAttribute("data-md-color-scheme", "slate");
  });
  await page.waitForFunction(
    () => {
      const host = document.querySelector("marimo-anywidget");
      return Boolean(host?.shadowRoot?.querySelector(".landmarks.landmarks--dark"));
    },
    { timeout: 30_000 },
  );
  const afterPlot = await readPlotSurface(page);
  const after = await page.evaluate(
    () => document.body.getAttribute("data-md-color-scheme") || "default",
  );
  const hostScheme = await page.evaluate(
    () => document.querySelector(".milume-recipe-studio-host")?.dataset.mdColorScheme ?? "",
  );
  report.toggle = { before, after, hostScheme, beforePlot, afterPlot };
  await context.close();
}

await browser.close();
writeFileSync(`${outDir}/recipe-zensical-capture${labelPrefix ? `-${labelPrefix.replace(/-$/, "")}` : ""}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const bad = Object.values(report.modes).some((m) => m.console_errors.length);
if (bad) process.exit(1);
