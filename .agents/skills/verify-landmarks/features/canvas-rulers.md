# canvas-rulers

The **Canvas rulers** switch frames the map with X (top) and Y (left) rulers
and draws a thin grid line at every tick across the map.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"rulers: labels sit on the data and follow a pan; a grid line at every tick above the map"`

## Sub-features

- Tick labels sit on their data value in both axes (the map's Y runs down, like the screen), so a pan moves each label with the data
- One full-length grid line per tick (`.landmarks-ruler-grid-line--x` / `--y` inside `.landmarks-ruler-grid`), over the map (points, selections, squares, landmarks) and under the chrome, `pointer-events: none`, coloured from the theme's `--foreground`
- The chrome docks and top tools shift in by the ruler band while rulers are on (`.landmarks--rulers`)

## How to get to it (user POV)

Turn on the **Canvas rulers** switch in the view controls (or set
`w.show_rulers = True`). Pan or zoom: labels and grid lines follow the data.

## Driving it with Playwright

```ts
await setModel(page, { show_rulers: true });
const rulers = page.getByTestId("canvas-rulers");
const yTicks = rulers.locator(".landmarks-ruler--y .landmarks-ruler-tick"); // data-value = the tick's µm
await expect(rulers.locator(".landmarks-ruler-grid .landmarks-ruler-grid-line--y")).toHaveCount(await yTicks.count());
```

Helpers: `bootLandmarksHarness`, `canvasBox`, `setModel` (in
`frontend/e2e/helpers.ts`). Model key: `show_rulers`.

**Proof**

- Functional: each tick label's centre is within 2 px of its `data-value` projected through the view state, in X and Y, before and after a Move-tool drag down; each Y label moves by the same amount as its data; one grid line per tick, after the deck canvas in the DOM with the overlay's `z-index` above the plot host, `pointer-events: none`, full width.

## Gotchas

- Rulers rise in (cube-motion `Rise`): poll positions until they settle rather than reading once.
- Labels use `toPrecision(3)` (e.g. `2.86e+3`); read a tick's value from `data-value`, not its text.
