import { test } from "@playwright/test";
import path from "node:path";

import { bootLandmarksHarness, stabilizeUi, waitForEngine } from "./helpers";

const artifactDir = process.env.ISSUE_103_ARTIFACT_DIR ?? "/opt/cursor/artifacts";

async function shotPlatform(page: import("@playwright/test").Page, fixture: string, outName: string) {
  await page.goto(`/?fixture=${fixture}`, { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
  await page.screenshot({
    path: path.join(artifactDir, outName),
    fullPage: true,
  });
}

test.describe("issue #103 platform screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("milume-harness-theme", "dark");
    });
  });

  test("xenium-shaped fixture", async ({ page }) => {
    await shotPlatform(page, "issue-103-xenium-fixture.json", "issue-103-xenium.png");
  });

  test("cosmx-shaped fixture", async ({ page }) => {
    await shotPlatform(page, "issue-103-cosmx-fixture.json", "issue-103-cosmx.png");
  });
});
