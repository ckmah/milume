import { expect, test } from "@playwright/test";
import path from "node:path";

import { getModel, stabilizeUi, waitForEngine } from "./helpers";

const artifactDir = process.env.ISSUE_103_ARTIFACT_DIR ?? "/opt/cursor/artifacts";

function pointCountFromModel(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const b64 = (window as any).__landmarksModel.get("points_data") as string;
    return atob(b64).length / 16;
  });
}

async function loadPlatform(
  page: import("@playwright/test").Page,
  fixture: string,
  outName: string,
  expectedPoints: number,
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("milume-harness-theme", "dark");
  });
  await page.goto(`/?fixture=${fixture}`, { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
  await expect(await pointCountFromModel(page)).toBe(expectedPoints);
  const bounds = await getModel(page, "x_bounds");
  expect(bounds).toHaveLength(2);
  await page.screenshot({
    path: path.join(artifactDir, outName),
    fullPage: true,
  });
}

test.describe("issue #103 platform harness", () => {
  test("xenium fixture renders 632 cells", async ({ page }) => {
    await loadPlatform(page, "issue-103-xenium-fixture.json", "issue-103-xenium.png", 632);
  });

  test("cosmx fixture renders 6 cells", async ({ page }) => {
    await loadPlatform(page, "issue-103-cosmx-fixture.json", "issue-103-cosmx.png", 6);
  });
});
