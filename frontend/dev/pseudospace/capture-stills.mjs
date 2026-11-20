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

async function drag(page, fromBox, toX, toY) {
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 16 });
}

async function dropOn(page, id, into) {
  const row = await page.getByTestId(`pseudospace-row-${id}`).boundingBox();
  const group = await page.getByTestId(into).boundingBox();
  if (!row || !group) throw new Error(`missing box for ${id}`);
  await drag(page, row, group.x + group.width / 2, group.y + group.height - 8);
  await page.getByTestId("pseudospace-dragging").waitFor();
  await page.mouse.up();
  await page.getByTestId(`pseudospace-handle-${id}`).waitFor();
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
  await page.goto("http://127.0.0.1:5173/?pseudospace=a", { waitUntil: "networkidle" });
  await page.getByTestId("pseudospace-sparkle").waitFor();
  await page.getByTestId("pseudospace-map").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "panel-off-dark");
  await page.getByRole("button", { name: "Switch to light" }).click();
  await page.waitForTimeout(250);
  await shot(page, "panel-off-light");
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await page.waitForTimeout(250);

  await page.getByTestId("pseudospace-sparkle").click();
  await page.getByTestId("pseudospace-group").waitFor();
  await dropOn(page, "harness-shape", "pseudospace-group");
  await dropOn(page, "harness-spline", "pseudospace-group");
  await shot(page, "panel-group-dark");
  await page.getByRole("button", { name: "Switch to light" }).click();
  await page.waitForTimeout(250);
  await shot(page, "panel-group-light");
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await page.waitForTimeout(250);

  const handle = await page.getByTestId("pseudospace-handle-harness-spline").boundingBox();
  const shape = await page.getByTestId("pseudospace-row-harness-shape").boundingBox();
  if (!handle || !shape) throw new Error("reorder boxes missing");
  await drag(page, handle, shape.x + shape.width / 2, shape.y + 6);
  await page.getByTestId("pseudospace-dragging").waitFor();
  await shot(page, "panel-drag-dark");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Switch to light" }).click();
  await page.waitForTimeout(250);
  const handleLight = await page.getByTestId("pseudospace-handle-harness-spline").boundingBox();
  const shapeLight = await page.getByTestId("pseudospace-row-harness-shape").boundingBox();
  if (!handleLight || !shapeLight) throw new Error("light reorder boxes missing");
  await drag(page, handleLight, shapeLight.x + shapeLight.width / 2, shapeLight.y + 6);
  await page.getByTestId("pseudospace-dragging").waitFor();
  await shot(page, "panel-drag-light");
  await page.mouse.move(handleLight.x + handleLight.width / 2, handleLight.y + handleLight.height / 2, { steps: 8 });
  await page.mouse.up();

  const canvas = await page.getByTestId("pseudospace-map").boundingBox();
  const at = screenOf(canvas, between.x, between.y);
  await page.mouse.move(at.x, at.y);
  await page.getByTestId("pseudospace-readout").waitFor();
  await shot(page, "a-light");
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await page.waitForTimeout(300);
  await page.mouse.move(at.x, at.y);
  await shot(page, "a-dark");
} finally {
  console.log("PAGE_ERRORS", pageErrors.join("\n") || "none");
  await browser.close();
}
