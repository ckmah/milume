import { expect, test } from "@playwright/test";

import {
  assertMolabPyxaSelectionAndInspectInIframe,
} from "./molab-pyxa-flow";
import {
  canvasBoxInIframe,
  gotoMolabIframeShell,
  onCi,
  pulseMolabIframeReflow,
  waitForLandmarksWidgetInIframe,
} from "./helpers";

test.describe("marimo kernel — molab iframe shell (scale, zero-height grow)", () => {
  test("lasso, highlight, focus obs names, and centred inspect cube", async ({ page, baseURL }) => {
    test.skip(onCi(), "iframe anywidget mount is unreliable on CI; see landmarks-molab-pyxa-shell.spec.ts");
    test.slow(onCi(), "pyxa kernel boot + zarr read inside iframe");

    expect(baseURL).toBeTruthy();
    expect(baseURL).not.toMatch(/localhost|127\.0\.0\.1/);

    await gotoMolabIframeShell(page, baseURL!);
    await waitForLandmarksWidgetInIframe(page);
    await pulseMolabIframeReflow(page);
    await waitForLandmarksWidgetInIframe(page);

    const box = await canvasBoxInIframe(page);
    const widget = page.frameLocator('iframe[data-testid="molab-marimo-frame"]');
    await widget.getByRole("button", { name: /Lasso/i }).click();
    await assertMolabPyxaSelectionAndInspectInIframe(page, box);
  });
});
