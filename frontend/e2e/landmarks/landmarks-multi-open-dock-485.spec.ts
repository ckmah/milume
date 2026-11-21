import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness, getZoom, setModel, waitForEngine } from "../helpers";

const SECTIONS = ["Selections", "Landmarks", "Layers"] as const;

function header(page: Page, label: (typeof SECTIONS)[number]) {
  return page.getByTestId(`panel-section-${label.toLowerCase()}`);
}

function section(page: Page, label: (typeof SECTIONS)[number]) {
  return page.locator(".landmarks-panel-section").filter({ has: header(page, label) });
}

function bodyScroll(page: Page, label: (typeof SECTIONS)[number]) {
  return section(page, label).locator(".landmarks-panel-section__scroll");
}

async function expectSection(page: Page, label: (typeof SECTIONS)[number], open: boolean) {
  const verb = open ? "Collapse" : "Expand";
  await expect(header(page, label).getByRole("button", { name: `${verb} ${label}` })).toHaveCount(1);
}

async function setShellHeight(page: Page, height: number) {
  const body = page.locator(".landmarks__body");
  const handle = page.getByRole("button", { name: "Resize height" });
  const start = await body.boundingBox();
  const grip = await handle.boundingBox();
  if (!start || !grip) throw new Error("shell resize handle missing");
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (height - start.height), { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await body.boundingBox())?.height ?? 0))
    .toBe(height);
}

async function manyLandmarks() {
  return Array.from({ length: 40 }, (_, i) => ({
    id: `row-${i}`,
    type: "point",
    vertices: [[0, 0]],
  }));
}

test.describe("multi-open left dock (#485)", () => {
  test("opening one section leaves the others open", async ({ page }) => {
    await bootLandmarksHarness(page);
    for (const label of SECTIONS) await expectSection(page, label, true);

    await header(page, "Selections").click();
    await expectSection(page, "Selections", false);
    await expectSection(page, "Landmarks", true);
    await expectSection(page, "Layers", true);

    await header(page, "Selections").click();
    await expectSection(page, "Selections", true);
    await expectSection(page, "Landmarks", true);
    await expectSection(page, "Layers", true);
  });

  test("a click collapses only that section, and none open is allowed", async ({ page }) => {
    await bootLandmarksHarness(page);
    for (const label of SECTIONS) await header(page, label).click();
    for (const label of SECTIONS) await expectSection(page, label, false);
    await expect(page.locator(".landmarks__layers-panel [data-group-rise]")).toHaveCount(0);

    await header(page, "Landmarks").click();
    await expectSection(page, "Landmarks", true);
    await expectSection(page, "Selections", false);
    await expectSection(page, "Layers", false);
  });

  test("minimise restores the open set", async ({ page }) => {
    await bootLandmarksHarness(page);
    await header(page, "Landmarks").click();
    await expectSection(page, "Landmarks", false);

    await page.getByTestId("toggle-minimise-panels").click();
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--minimise/);
    for (const label of SECTIONS) await expectSection(page, label, false);

    await page.getByTestId("toggle-minimise-panels").click();
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/landmarks--minimise/);
    await expectSection(page, "Selections", true);
    await expectSection(page, "Landmarks", false);
    await expectSection(page, "Layers", true);
  });

  test("a remount starts with all three sections open", async ({ page }) => {
    await bootLandmarksHarness(page);
    await header(page, "Layers").click();
    await expectSection(page, "Layers", false);
    await page.evaluate(() => (window as unknown as { __harnessReset: () => Promise<void> }).__harnessReset());
    await waitForEngine(page, 150);
    for (const label of SECTIONS) await expectSection(page, label, true);
  });

  test("all three headers stay visible at 550px and the dock stays above the minimap", async ({ page }) => {
    await bootLandmarksHarness(page);
    await setShellHeight(page, 550);
    for (const label of SECTIONS) await expectSection(page, label, true);

    const dock = page.locator(".landmarks__chrome-dock--left");
    const dockBox = await dock.boundingBox();
    const minimap = page.locator(".landmarks__chrome-minimap");
    const minimapBox = await minimap.boundingBox();
    expect(dockBox && minimapBox).toBeTruthy();
    expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(minimapBox!.y + 0.75);

    for (const label of SECTIONS) {
      const box = await header(page, label).boundingBox();
      expect(box, `${label} header`).toBeTruthy();
      expect(box!.height).toBeGreaterThan(24);
      expect(box!.y).toBeGreaterThanOrEqual(dockBox!.y - 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(dockBox!.y + dockBox!.height + 0.5);
      await expect(header(page, label)).toBeVisible();
    }
  });

  test("a long list scrolls inside its body and headers stay put", async ({ page }) => {
    await bootLandmarksHarness(page);
    await setShellHeight(page, 550);
    await setModel(page, { landmarks: await manyLandmarks() });

    const scroll = bodyScroll(page, "Landmarks");
    const before = await Promise.all(
      SECTIONS.map(async (label) => {
        const box = (await header(page, label).boundingBox())!;
        expect(box.height, `${label} header`).toBeGreaterThan(24);
        return box.y;
      }),
    );
    const metrics = await scroll.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.clientHeight).toBeGreaterThan(24);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 8);

    const sections = page.locator(".landmarks__layers-panel .landmarks-panel-sections");
    expect(await sections.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(async () => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(8);

    const after = await Promise.all(SECTIONS.map(async (label) => (await header(page, label).boundingBox())!.y));
    for (let i = 0; i < SECTIONS.length; i++) {
      expect(Math.abs(after[i]! - before[i]!), `${SECTIONS[i]} header moved`).toBeLessThanOrEqual(1);
    }
    await expect(header(page, "Landmarks").getByText("row-39", { exact: true })).toHaveCount(0);
    await expect(scroll.getByText("row-39", { exact: true })).toBeVisible();
    const dock = await page.locator(".landmarks__chrome-dock--left").boundingBox();
    expect(dock).toBeTruthy();
    for (const label of ["Size", "Opacity"]) {
      const box = await section(page, "Layers").getByText(label, { exact: true }).boundingBox();
      expect(box, label).toBeTruthy();
      expect(box!.y, label).toBeGreaterThanOrEqual(dock!.y);
      expect(box!.y + box!.height, label).toBeLessThanOrEqual(dock!.y + dock!.height + 0.5);
    }
  });

  test("wheel over the dock does not zoom the canvas", async ({ page }) => {
    await bootLandmarksHarness(page);
    await setShellHeight(page, 550);
    await setModel(page, { landmarks: await manyLandmarks() });
    const before = await getZoom(page);
    const scroll = bodyScroll(page, "Landmarks");
    const box = await scroll.boundingBox();
    expect(box && box.height).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 400);
    expect(await getZoom(page)).toBe(before);
    await expect.poll(async () => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("fullscreen dock still ends above the minimap", async ({ page }) => {
    await bootLandmarksHarness(page);
    for (const label of SECTIONS) await expectSection(page, label, true);
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--fs/);

    const { leftOk, leftBottom, minimapTop } = await page.evaluate(() => {
      const left = document.querySelector(".landmarks__chrome-dock--left");
      const minimap = document.querySelector(".landmarks__chrome-minimap");
      if (!left || !minimap) throw new Error("expected left dock and minimap");
      const lb = left.getBoundingClientRect();
      const mm = minimap.getBoundingClientRect();
      return {
        leftOk: lb.bottom <= mm.top + 0.75,
        leftBottom: lb.bottom,
        minimapTop: mm.top,
      };
    });
    expect(leftOk, `left dock bottom ${leftBottom} above minimap ${minimapTop}`).toBe(true);
    for (const label of SECTIONS) await expect(header(page, label)).toBeVisible();
  });
});
