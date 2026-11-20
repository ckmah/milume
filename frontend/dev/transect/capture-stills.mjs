import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts/transect";
mkdirSync(outDir, { recursive: true });

const bounds = {
  x0: 900.0569884078238,
  x1: 999.4378443592046,
  y0: -5139.789521620431,
  y1: -5040.1346413607735,
};
const stops = [
  { id: "harness-point", x: 941.892353304382, y: -5097.83880345168 },
  { id: "harness-line#0", x: 943.8561190741651, y: -5086.023720510063 },
  { id: "harness-line#1", x: 953.6749479230805, y: -5084.054540019793 },
  { id: "harness-line#2", x: 957.6024794626466, y: -5091.931261980872 },
];

function screenOf(box, x, y) {
  const dx = bounds.x1 - bounds.x0;
  const dy = bounds.y1 - bounds.y0;
  const pad = 28;
  const s = Math.min((box.width - pad * 2) / dx, (box.height - pad * 2) / dy);
  const xOff = (box.width - dx * s) / 2 - bounds.x0 * s;
  const yOff = (box.height - dy * s) / 2;
  return {
    x: box.x + xOff + x * s,
    y: box.y + yOff + (bounds.y1 - y) * s,
  };
}

async function shot(page, name) {
  const widget = page.locator(".milume-widget.landmarks");
  const box = await widget.boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error("widget box missing");
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const clip = {
    x,
    y,
    width: Math.min(box.width, vp.width - x),
    height: Math.min(box.height, vp.height - y),
  };
  await page.screenshot({ path: `${outDir}/${name}.png`, clip });
  console.log("wrote", name, Math.round(clip.width), Math.round(clip.height));
}

async function ready(page, testId) {
  await page.getByTestId(testId).waitFor({ timeout: 20000 });
  await page.getByTestId("transect-map").waitFor();
  await page.waitForTimeout(700);
}

async function buildA(page) {
  await page.goto("http://127.0.0.1:5173/?transect=a", { waitUntil: "networkidle" });
  await ready(page, "transect-option-a");
  for (const id of ["harness-point", "harness-line-0", "harness-line-1", "harness-line-2"]) {
    await page.getByTestId(`include-${id}`).click();
  }
  await page.getByTestId("transect-make").click();
  await page.getByTestId("transect-profile").waitFor();
  const make = await page.getByTestId("transect-make").boundingBox();
  await page.mouse.move(make.x + make.width / 2, make.y + make.height / 2);
}

async function buildB(page) {
  await page.goto("http://127.0.0.1:5173/?transect=b", { waitUntil: "networkidle" });
  await ready(page, "transect-option-b");
  const canvas = await page.getByTestId("transect-map").boundingBox();
  console.log("b canvas", canvas);
  for (const stop of stops) {
    const at = screenOf(canvas, stop.x, stop.y);
    await page.mouse.click(at.x, at.y);
    const count = await page.getByTestId("transect-option-b").getAttribute("data-count");
    console.log("b click", stop.id, count);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  console.log("b done", await page.getByTestId("transect-option-b").getAttribute("data-done"));
  await page.getByTestId("transect-profile").waitFor();
  const last = screenOf(canvas, stops[3].x, stops[3].y);
  await page.mouse.move(last.x, last.y);
}

async function buildC(page) {
  await page.goto("http://127.0.0.1:5173/?transect=c", { waitUntil: "networkidle" });
  await ready(page, "transect-option-c");
  await page.getByTestId("transect-readout").waitFor();
  const slider = page.locator("[data-slot='slider-thumb']");
  const thumb = await slider.boundingBox();
  if (!thumb) throw new Error("slider thumb missing");
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
}

async function pair(page, name, build) {
  await build(page);
  await shot(page, `${name}-dark`);
  await page.getByRole("button", { name: "Switch to light" }).click();
  await page.waitForTimeout(250);
  await shot(page, `${name}-light`);
}

const browser = await chromium.launch();
const pageErrors = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 1024 },
  deviceScaleFactor: 2,
});
await context.addInitScript(() => localStorage.setItem("milume-harness-theme", "dark"));
const page = await context.newPage();
page.on("pageerror", (err) => pageErrors.push(String(err)));
try {
  if (process.env.ONLY_MOBILE !== "1") {
  await pair(page, "a", buildA);
  await pair(page, "b", buildB);
  await pair(page, "c", buildC);
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await mobile.addInitScript(() => localStorage.setItem("milume-harness-theme", "dark"));
  const phone = await mobile.newPage();
  const buildPhone = async (target) => {
    await target.goto("http://127.0.0.1:5173/?transect=a", { waitUntil: "domcontentloaded" });
    await target.addStyleTag({
      content: ".harness-toolbar{display:none !important}.landmarks__chrome-view,.landmarks__peek-tab{display:none !important}.landmarks__body{height:844px !important}",
    });
    await ready(target, "transect-option-a");
    for (const id of ["harness-point", "harness-line-0", "harness-line-1", "harness-line-2"]) {
      await target.getByTestId(`include-${id}`).click();
    }
    await target.getByTestId("transect-make").click();
    await target.getByTestId("transect-profile").waitFor();
    const make = await target.getByTestId("transect-make").boundingBox();
    await target.mouse.move(make.x + make.width / 2, make.y + make.height / 2);
  };
  await buildPhone(phone);
  await phone.addStyleTag({ content: ".harness-toolbar{display:none !important}" });
  await phone.waitForTimeout(200);
  await phone.screenshot({ path: `${outDir}/a-mobile-dark.png` });
  await phone.evaluate(() => {
    localStorage.setItem("milume-harness-theme", "light");
    document.documentElement.classList.remove("dark", "dark-theme");
    document.documentElement.classList.add("light", "light-theme");
  });
  await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${outDir}/a-mobile-light.png` });
  console.log("wrote mobile viewport", phone.viewportSize());
  await mobile.close();
} finally {
  console.log("PAGE_ERRORS", pageErrors.join("\n") || "none");
  await browser.close();
}
