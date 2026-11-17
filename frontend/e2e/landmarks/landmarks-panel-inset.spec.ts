import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness } from "../helpers";
import { expectSharedPanelInset } from "./panel-edges";

test("left dock trailing edges share one content inset", async ({ page }) => {
  await bootLandmarksHarness(page);
  const panel = page.locator(
    ".landmarks__chrome-dock--left .landmarks__layers-panel",
  );
  await expect(panel).toBeVisible();
  await expectSharedPanelInset(panel);
});
