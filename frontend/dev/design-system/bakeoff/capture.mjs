/**
 * One screenshot pass. Does not run the e2e suite.
 * Start the design-system server first:
 *   npm run dev:design-system
 * Then: node dev/design-system/bakeoff/capture.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { GAME_SKINS } from "./skins.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stills = path.join(here, "stills");
const base = process.env.BAKEOFF_URL ?? "http://127.0.0.1:5177";
const styles = ["base-nova", "base-maia", "base-luma", "base-rhea"];
const themes = ["light", "dark"];
const only = process.env.BAKEOFF_ONLY;

fs.mkdirSync(stills, { recursive: true });

const browser = await chromium.launch();

if (only !== "game" && only !== "tact-v2") for (const theme of themes) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.addInitScript((value) => {
    localStorage.setItem("milume-harness-theme", value);
  }, theme);
  await page.goto(`${base}/#layers`, { waitUntil: "networkidle" });
  const widget = page.locator("#layers .milume-widget").last();
  await widget.waitFor({ state: "visible", timeout: 60000 });
  await widget.evaluate((el) => {
    el.style.maxHeight = "none";
    el.style.height = "auto";
    el.style.overflow = "visible";
  });
  await widget.scrollIntoViewIfNeeded();
  const bg = await widget.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (theme === "dark" && bg !== "rgb(20, 20, 20)") {
    throw new Error(`shipped dark background is ${bg}`);
  }
  if (theme === "light" && bg !== "rgb(232, 232, 232)") {
    throw new Error(`shipped light background is ${bg}`);
  }
  await widget.screenshot({ path: path.join(stills, `shipped-${theme}.png`) });
  await page.close();
  console.log(`shipped-${theme} ${bg}`);
}

if (only !== "game" && only !== "tact-v2") for (const style of styles) {
  for (const theme of themes) {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(`${base}/bakeoff.html?style=${style}&theme=${theme}`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector("[data-bakeoff-ready='true']", { timeout: 30000 });
    await page.waitForTimeout(250);
    const frame = page.locator(".bakeoff-page");
    const trackH = await page.evaluate(() => {
      const track = document
        .querySelector("[data-bakeoff-host]")
        ?.shadowRoot?.querySelector("[data-slot=slider-track]");
      return track ? track.getBoundingClientRect().height : 0;
    });
    if (trackH < 1) throw new Error(`${style} ${theme} slider track height ${trackH}`);
    await frame.screenshot({ path: path.join(stills, `${style}-${theme}.png`) });
    await page.close();
    console.log(`${style}-${theme} track ${trackH}`);
  }
}

if (only === "tact-v2") {
  for (const theme of themes) {
    for (const shot of ["full", "close"]) {
      const page = await browser.newPage({
        viewport: shot === "close" ? { width: 980, height: 760 } : { width: 1280, height: 1600 },
        deviceScaleFactor: 2,
      });
      await page.goto(`${base}/bakeoff.html?style=game-tact&theme=${theme}&shot=${shot}`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector("[data-bakeoff-ready='true']", { timeout: 30000 });
      await page.waitForSelector("html[data-bakeoff-settled='true']", { timeout: 8000 });
      const suffix = shot === "close" ? "-close" : "";
      await page.locator(".bakeoff-page").screenshot({
        path: path.join(stills, `game-tact-v2-${theme}${suffix}.png`),
      });
      await page.close();
      console.log(`game-tact-v2-${theme}${suffix}`);
    }
  }
}

if (only !== "presets" && only !== "tact-v2") {
  for (const style of GAME_SKINS) {
    for (const theme of themes) {
      for (const shot of ["full", "close"]) {
        const page = await browser.newPage({
          viewport: shot === "close" ? { width: 980, height: 760 } : { width: 1280, height: 1600 },
          deviceScaleFactor: 2,
        });
        await page.goto(`${base}/bakeoff.html?style=${style}&theme=${theme}&shot=${shot}`, {
          waitUntil: "networkidle",
        });
        await page.waitForSelector("[data-bakeoff-ready='true']", { timeout: 30000 });
        await page.waitForSelector("html[data-bakeoff-settled='true']", { timeout: 8000 });
        const trackH = await page.evaluate(() => {
          if (new URLSearchParams(location.search).get("shot") === "close") return 8;
          const track = document
            .querySelector("[data-bakeoff-host]")
            ?.shadowRoot?.querySelector("[data-slot=slider-track]");
          return track ? track.getBoundingClientRect().height : 0;
        });
        if (trackH < 1) throw new Error(`${style} ${theme} ${shot} slider track height ${trackH}`);
        const suffix = shot === "close" ? "-close" : "";
        await page.locator(".bakeoff-page").screenshot({
          path: path.join(stills, `${style}-${theme}${suffix}.png`),
        });
        await page.close();
        console.log(`${style}-${theme}${suffix} track ${trackH}`);
      }
    }
  }
}

await browser.close();
