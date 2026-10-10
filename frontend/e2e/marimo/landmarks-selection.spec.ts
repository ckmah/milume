import { expect, test } from "@playwright/test";

import { canvasBox, drawLasso, getModel, onCi, waitForLandmarksWidget } from "./helpers";

test.describe("marimo kernel — canvas selection input", () => {
  test("lasso stroke commits selections on the anywidget model", async ({ page, baseURL }) => {
    test.slow(onCi(), "marimo kernel boot + zarr read");

    expect(baseURL).toBeTruthy();
    expect(baseURL).not.toMatch(/localhost|127\.0\.0\.1/);

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await drawLasso(page, await canvasBox(page));

    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0, {
        timeout: onCi() ? 120_000 : 30_000,
      })
      .toBeGreaterThan(before);
    const selections = (await getModel(page, "selections")) as { point_indices?: number[] }[];
    const last = selections[selections.length - 1];
    expect(last?.point_indices?.length ?? 0).toBeGreaterThan(0);
  });

  test("select-mode click picks a landmark through deck.gl onClick", async ({ page, baseURL }) => {
    test.slow(onCi(), "marimo kernel boot + zarr read");

    expect(baseURL).toBeTruthy();
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    const box = await canvasBox(page);
    await page.getByRole("button", { name: /Point\. Right-click for landmark menu/ }).click({
      button: "right",
    });
    await page.getByRole("menuitem", { name: /^Point\b/ }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("point");
    await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.4);
    await expect.poll(async () => ((await getModel(page, "landmarks")) as unknown[]).length).toBe(1);

    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.4);
    await expect.poll(async () => {
      const kind = await getModel(page, "selected_kind");
      const index = await getModel(page, "selected_index");
      return kind === "landmark" && Number(index) === 0;
    }).toBe(true);
  });
});
