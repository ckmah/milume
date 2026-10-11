import { expect, type Frame, type Page } from "@playwright/test";

export function onCi(): boolean {
  return Boolean(process.env.CI);
}

export async function waitForLandmarksWidget(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  await canvas.waitFor({ state: "visible", timeout: onCi() ? 720_000 : 420_000 });
  await page.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  await page.waitForFunction(
    () => {
      const eng = (window as any).__landmarksEngine;
      const n = eng?.getPoints?.()?.length ?? 0;
      return n > 0;
    },
    undefined,
    { timeout: onCi() ? 720_000 : 180_000 },
  );
  await page.waitForTimeout(400);
  return canvas;
}

export async function getModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__landmarksModel?.get(k), key);
}

export async function canvasBox(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

/** Molab-like embed: scaled widget + picking-canvas leave stub mid-stroke. */
export async function applyMolabEmbedStress(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector(".landmarks") as HTMLElement | null;
    if (root) {
      root.style.transform = "scale(0.88)";
      root.style.transformOrigin = "center center";
    }
  });
  await page.evaluate(() => {
    (window as any).__molabPickingLeaveHook = () => {
      const canvas = document.querySelector("canvas.landmarks__webgl");
      let foreign = document.getElementById("deck-picking-swap-stub");
      if (!foreign) {
        foreign = document.createElement("canvas");
        foreign.id = "deck-picking-swap-stub";
        document.body.appendChild(foreign);
      }
      canvas?.dispatchEvent(
        new MouseEvent("mouseleave", { bubbles: true, relatedTarget: foreign }),
      );
    };
  });
}

/** Closed lasso stroke on the map (page.mouse, molab-style). */
export async function drawLasso(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  await page.getByRole("button", { name: "Reset view" }).click({ timeout: 15_000 }).catch(() => undefined);
  await canvas.click({ position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) } });
  await page.keyboard.press("l");
  await expect.poll(() => getModel(page, "mode"), { timeout: onCi() ? 60_000 : 15_000 }).toBe("lasso");

  const inset = 0.1;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const rx = box.width * (0.5 - inset);
  const ry = box.height * (0.5 - inset);

  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    if (i === 4) {
      await page.evaluate(() => (window as any).__molabPickingLeaveHook?.());
    }
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, { steps: 3 });
  }
  await page.mouse.up();
}

/** Axis-aligned rectangle drag (Square tool). */
export async function drawRectangle(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  await page.getByRole("button", { name: /Lasso\. Right-click for shape menu/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Square\b/ }).click();
  await expect.poll(() => getModel(page, "mode"), { timeout: onCi() ? 60_000 : 15_000 }).toBe("rectangle");

  const x0 = box.x + box.width * 0.28;
  const y0 = box.y + box.height * 0.28;
  const x1 = box.x + box.width * 0.72;
  const y1 = box.y + box.height * 0.72;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

/** Click-select an existing landmark (deck onClick in Select mode). */
export async function clickSelectLandmark(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await page.getByRole("radio", { name: "Select", exact: true }).click();
  await expect.poll(() => getModel(page, "mode")).toBe("select");
  const before = ((await getModel(page, "landmarks")) as unknown[])?.length ?? 0;
  if (before === 0) {
    await page.getByRole("button", { name: /Point\. Right-click for landmark menu/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Point\b/ }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("point");
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.38);
    await expect.poll(async () => ((await getModel(page, "landmarks")) as unknown[]).length).toBe(1);
    await page.getByRole("radio", { name: "Select", exact: true }).click();
  }
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.38);
  await expect.poll(async () => {
    const kind = await getModel(page, "selected_kind");
    const index = await getModel(page, "selected_index");
    return kind === "landmark" && Number(index) >= 0;
  }).toBe(true);
}

export const MARIMO_IFRAME_SELECTOR = 'iframe[data-testid="molab-marimo-frame"]';

/** Molab-like outer shell: CSS scale on the iframe holder and zero-height grow-in. */
export async function gotoMolabIframeShell(page: Page, baseURL: string) {
  const marimoUrl = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const shellPath = "molab-iframe-shell.html";
  await page.route(`**/${shellPath}`, (route) => {
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>molab iframe shell</title>
<style>
  body { margin: 0; background: #1a1a1a; display: flex; justify-content: center; padding: 12px; }
  #shell { transform: scale(0.88); transform-origin: center center; width: min(1320px, 96vw); }
  #holder { height: 0; overflow: hidden; width: 100%; }
  #holder.ready { height: 760px; overflow: visible; }
  iframe { border: 0; width: 100%; height: 760px; display: block; }
</style></head>
<body>
  <div id="shell">
    <div id="holder">
      <iframe data-testid="molab-marimo-frame" src="${marimoUrl}"></iframe>
    </div>
  </div>
  <script>
    requestAnimationFrame(() => setTimeout(() => document.getElementById("holder").classList.add("ready"), 100));
  </script>
</body></html>`,
    });
  });
  await page.goto(`${marimoUrl}${shellPath}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

export async function marimoEmbedFrame(page: Page): Promise<Frame> {
  const el = page.locator(MARIMO_IFRAME_SELECTOR);
  await el.waitFor({ state: "attached", timeout: 120_000 });
  await expect
    .poll(async () => (await el.contentFrame()) !== null, { timeout: onCi() ? 120_000 : 60_000 })
    .toBe(true);
  return (await el.contentFrame())!;
}

export async function waitForLandmarksWidgetFrame(frame: Frame) {
  const canvas = frame.locator("canvas.landmarks__webgl, canvas").first();
  await canvas.waitFor({ state: "visible", timeout: onCi() ? 720_000 : 420_000 });
  await frame.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  await frame.waitForFunction(
    () => {
      const eng = (window as any).__landmarksEngine;
      return (eng?.getPoints?.()?.length ?? 0) > 0;
    },
    undefined,
    { timeout: onCi() ? 720_000 : 180_000 },
  );
  await frame.waitForTimeout(400);
  return canvas;
}

export async function getModelFrame(frame: Frame, key: string) {
  return frame.evaluate((k) => (window as any).__landmarksModel?.get(k), key);
}

export async function canvasBoxFrame(frame: Frame) {
  const canvas = frame.locator("canvas.landmarks__webgl, canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

export async function drawLassoFrame(page: Page, frame: Frame, box: { x: number; y: number; width: number; height: number }) {
  const canvas = frame.locator("canvas.landmarks__webgl, canvas").first();
  await frame.getByRole("button", { name: "Reset view" }).click({ timeout: 15_000 }).catch(() => undefined);
  await canvas.click({ position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) } });
  await page.keyboard.press("l");
  await expect.poll(() => getModelFrame(frame, "mode"), { timeout: onCi() ? 60_000 : 15_000 }).toBe("lasso");

  const inset = 0.1;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const rx = box.width * (0.5 - inset);
  const ry = box.height * (0.5 - inset);

  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    if (i === 4) {
      await frame.evaluate(() => {
        const canvas = document.querySelector("canvas.landmarks__webgl");
        const foreign = document.createElement("canvas");
        document.body.appendChild(foreign);
        canvas?.dispatchEvent(
          new MouseEvent("mouseleave", { bubbles: true, relatedTarget: foreign }),
        );
      });
    }
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, { steps: 3 });
  }
  await page.mouse.up();
}
