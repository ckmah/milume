import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, stabilizeUi } from "../helpers";
import { uiEvidencePng } from "./paths";

test("04 shared chrome rest", async ({ page }) => {
  await bootLandmarksHarness(page);
  await stabilizeUi(page);
  const widget = page.locator(".landmarks").first();
  await expect(widget).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  await widget.screenshot({ path: uiEvidencePng("04-shared-chrome-rest.png") });
});
