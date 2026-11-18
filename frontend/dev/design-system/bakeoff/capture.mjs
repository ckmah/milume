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

if (only !== "game" && only !== "tact-v2" && only !== "tact-v3" && only !== "tact-v4" && only !== "tact-v5" && only !== "tact-v6") for (const theme of themes) {
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

if (only !== "game" && only !== "tact-v2" && only !== "tact-v3" && only !== "tact-v4" && only !== "tact-v5" && only !== "tact-v6") for (const style of styles) {
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

if (only === "tact-v3") {
  for (const backdrop of ["solid", "translucent", "blur"]) {
    for (const theme of themes) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1600 },
        deviceScaleFactor: 2,
      });
      await page.goto(
        `${base}/bakeoff.html?style=game-tact&theme=${theme}&shot=full&backdrop=${backdrop}`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("[data-bakeoff-ready='true']", { timeout: 30000 });
      await page.waitForSelector("html[data-bakeoff-settled='true']", { timeout: 8000 });
      await page.locator(".bakeoff-page").screenshot({
        path: path.join(stills, `game-tact-v3-${backdrop}-${theme}.png`),
      });
      await page.close();
      console.log(`game-tact-v3-${backdrop}-${theme}`);
    }
  }
}

async function shootTact(page, url, file, { hoverThumb = false } = {}) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-bakeoff-ready='true']", { timeout: 30000 });
  await page.waitForSelector("html[data-bakeoff-settled='true']", { timeout: 8000 });
  if (hoverThumb) {
    const thumb = page.locator(".g-close-slider [data-slot=slider-thumb]").first();
    if (await thumb.count()) await thumb.hover();
  }
  await page.locator(".bakeoff-page").screenshot({ path: file });
}

if (only === "tact-v4") {
  const marks = (process.env.BAKEOFF_MARK ?? "a,b").split(",");
  const veils = (process.env.BAKEOFF_VEIL ?? "60,75,88").split(",");
  for (const mark of marks) {
    for (const veil of veils) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1600 },
        deviceScaleFactor: 2,
      });
      const notebook = process.env.BAKEOFF_PAGE === "notebook";
      const pageQuery = notebook ? "&page=notebook" : "";
      await shootTact(
        page,
        `${base}/bakeoff.html?style=game-tact&theme=dark&shot=full&backdrop=blur&veil=${veil}&mark=${mark}${pageQuery}`,
        path.join(
          stills,
          notebook
            ? "game-tact-v4-in-light-notebook.png"
            : `game-tact-v4-${mark.toUpperCase()}-blur-${veil}.png`,
        ),
      );
      await page.close();
      console.log(notebook ? "notebook" : `game-tact-v4-${mark.toUpperCase()}-blur-${veil}`);
    }
  }
}

if (only === "tact-v5") {
  const baseQuery = `${base}/bakeoff.html?style=game-tact&theme=dark&backdrop=blur&veil=75&mark=a`;
  const full = await browser.newPage({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
  });
  await shootTact(full, `${baseQuery}&shot=full`, path.join(stills, "game-tact-v5-A-75.png"));
  await full.close();
  console.log("game-tact-v5-A-75");
  const close = await browser.newPage({
    viewport: { width: 980, height: 760 },
    deviceScaleFactor: 2,
  });
  await shootTact(close, `${baseQuery}&shot=close`, path.join(stills, "game-tact-v5-A-75-close.png"), {
    hoverThumb: true,
  });
  await close.close();
  console.log("game-tact-v5-A-75-close");
}

if (only === "tact-v6") {
  const board = await browser.newPage({
    viewport: { width: 900, height: 1400 },
    deviceScaleFactor: 2,
  });
  await shootTact(
    board,
    `${base}/bakeoff.html?style=game-tact&theme=dark&shot=sliders&backdrop=blur&veil=75&mark=a`,
    path.join(stills, "game-tact-v6-sliders.png"),
  );
  await board.close();
  console.log("game-tact-v6-sliders");
  const picked = process.env.BAKEOFF_SLIDER ?? "a";
  const full = await browser.newPage({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
  });
  await shootTact(
    full,
    `${base}/bakeoff.html?style=game-tact&theme=dark&shot=full&backdrop=blur&veil=75&mark=a&slider=${picked}`,
    path.join(stills, "game-tact-v6-A-75.png"),
  );
  await full.close();
  console.log("game-tact-v6-A-75");
}

if (only !== "presets" && only !== "tact-v2" && only !== "tact-v3" && only !== "tact-v4" && only !== "tact-v5" && only !== "tact-v6") {
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
