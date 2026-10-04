# zoom-controls

Zoom in, zoom out, and reset view buttons change deck.gl viewState zoom.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"zoom in/out/reset buttons change viewState"`

## Sub-features

- Zoom in increases viewState zoom
- Zoom out decreases zoom relative to zoom-in state
- Reset view returns zoom near the baseline
- In Inspect the tool pill is swapped out; the armed Inspect pill carries the same Zoom in / Zoom out / Reset view buttons (`ZoomControls`, `chrome/topbar.tsx`, shared by both pills) for placing a window. The open pill drops them (the map is covered); the Inspect bar's own `Reset view` (an `IconBtn` titled "Reset view") resets the cube's camera instead — scope `Reset view` to `getByTestId("inspect-pill")` or `getByTestId("context-inspect-toolbar")` in Inspect

## How to get to it (user POV)

With the LandmarksWidget open, use the zoom controls in the widget chrome (Zoom in,
Zoom out, Reset view buttons). No landmark or selection mode is required.

## Driving it with Playwright

```ts
await bootLandmarksHarness(page);

const baseline = await getZoom(page);

await page.getByRole("button", { name: "Zoom in" }).click();
await page.waitForTimeout(350);
const afterIn = await getZoom(page);
// afterIn > baseline

await page.getByRole("button", { name: "Zoom out" }).click();
await page.waitForTimeout(350);
const afterOut = await getZoom(page);
// afterOut < afterIn

await page.getByRole("button", { name: "Reset view" }).click();
await page.waitForTimeout(450);
const afterReset = await getZoom(page);
// Math.abs(afterReset - baseline) < 0.35
```

Helpers: `bootLandmarksHarness`, `getZoom`.

Selectors: `getByRole("button", { name: "Zoom in" })`, `"Zoom out"`, `"Reset view"`.

**Proof**

- `getZoom(page)` reads `window.__landmarksEngine.getViewState().zoom`.
- Assertions: zoom increases after Zoom in, decreases after Zoom out, reset within
  `0.35` of baseline.
- Optional visual preamble: `shot(page, "rest", widget)` in the same spec.

## Gotchas

- Allow ~350–450 ms after each click for deck.gl view transitions (spec uses fixed timeouts).
- Zoom is read from the engine handle, not a synced traitlet — Python does not receive viewState.
- Do not confuse with pan; this test only clicks zoom/reset buttons.
