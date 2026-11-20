import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts/pseudospace";
mkdirSync(outDir, { recursive: true });

const bounds = {
  x0: 900.0569884078238,
  x1: 999.4378443592046,
  y0: -5139.789521620431,
  y1: -5040.1346413607735,
};
const shape = { x: 915, y: -5091.5 };
const spline = { x: 988, y: -5100 };
const between = { x: 950, y: -5090 };

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
  await page.getByTestId(testId).waitFor();
  await page.getByTestId("pseudospace-map").waitFor();
  await page.waitForTimeout(400);
}

async function buildA(page) {
  await page.goto("http://127.0.0.1:5173/?pseudospace=a", { waitUntil: "networkidle" });
  await ready(page, "pseudospace-option-a");
  await page.getByTestId("include-harness-shape").click();
  await page.getByTestId("include-harness-spline").click();
  await page.getByTestId("pseudospace-make").click();
  await page.getByTestId("pseudospace-measure").waitFor();
  await page.getByTestId("pseudospace-rho").waitFor();
  const canvas = await page.getByTestId("pseudospace-map").boundingBox();
  const at = screenOf(canvas, between.x, between.y);
  await page.mouse.move(at.x, at.y);
  await page.getByTestId("pseudospace-readout").waitFor();
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
  }

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await mobile.addInitScript(() => localStorage.setItem("milume-harness-theme", "dark"));
  const phone = await mobile.newPage();
  await phone.goto("http://127.0.0.1:5173/?pseudospace=a", { waitUntil: "domcontentloaded" });
  await phone.addStyleTag({
    content:
      ".harness-toolbar{display:none !important}.landmarks__chrome-view,.landmarks__peek-tab{display:none !important}.landmarks__body{height:844px !important}",
  });
  await ready(phone, "pseudospace-option-a");
  await phone.getByTestId("include-harness-shape").click();
  await phone.getByTestId("include-harness-spline").click();
  await phone.getByTestId("pseudospace-make").click();
  await phone.getByTestId("pseudospace-measure").waitFor();
  const make = await phone.getByTestId("pseudospace-make").boundingBox();
  await phone.mouse.move(make.x + make.width / 2, make.y + make.height / 2);
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
