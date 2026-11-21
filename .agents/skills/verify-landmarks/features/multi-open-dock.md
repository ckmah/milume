# multi-open-dock

Selections, Landmarks, and Layers stay open together. Each body scrolls. The dock does not.

**Spec:** `frontend/e2e/landmarks/landmarks-multi-open-dock-485.spec.ts`

## Sub-features

- All three sections open on first mount
- Opening or collapsing one section leaves the others as they were
- None open is allowed
- Minimise folds the bodies, then restores the same open set
- A harness remount starts from all three open again
- At a 550px shell every header stays inside the dock, above the minimap
- A long Landmarks list scrolls inside its body
- Wheel over that list does not change canvas zoom
- Fullscreen keeps the left dock above the minimap

## How to get to it (user POV)

Open the widget. The left dock shows Selections, Landmarks, and Layers expanded. Click a header to fold only that section. Minimise, then show the panels again. The same sections are open.

## Driving it with Playwright

```ts
await bootLandmarksHarness(page);
await expect(page.getByTestId("panel-section-layers").getByRole("button", { name: "Collapse Layers" })).toHaveCount(1);
```

Helpers: `bootLandmarksHarness`, `setModel`, `getZoom`.

**Proof**

- Each header's Collapse/Expand button matches the open set.
- After minimise and restore, Landmarks stays collapsed when it was collapsed before.
- At shell height 550, each header box sits inside the left dock, and the dock bottom is at or above the minimap.
- The Landmarks scrollport's `scrollHeight` exceeds `clientHeight`, the sections container does not scroll, and header `y` stays within 1px after the body scrolls.
- `getZoom` is unchanged after a wheel over the Landmarks body, and that body's `scrollTop` moves.
