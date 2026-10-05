# Driving the widget in a browser (milume 1.2.0)

Use Playwright (MCP or script) against the notebook URL. Prefer reading state
over reading pixels.

## What exists on the page

- The widget renders in a shadow root under `marimo-anywidget`. Playwright locators pierce it. Raw `document.querySelector` does not; recurse through `shadowRoot`.
- `window.__landmarksModel`: `get(key)`, `set(key, value)` then `save_changes()` for the synced traits.
- `window.__landmarksEngine`: `getViewState()`, `getViewportWorldBounds()` (µm), `getLandmarkGeometry()`, `getPoints()`, `getHover()`, `zoomBy`, `panTo`, `undoLandmarkEdit`. Full list: `frontend/src/widgets/landmarks/engine.d.ts` in the milume repo.
- The map is `canvas.landmarks__webgl`. It does not appear in an accessibility snapshot.

Python writes to the traits above reach `__landmarksModel` within about a
second. A gesture reaches `widget.<trait>` as soon as it completes.

## Selectors that work

```js
page.getByRole('radio',  { name: 'Select', exact: true })   // also Move, Inspect, Probe, Node
page.getByRole('button', { name: /Lasso\. Right-click/ })   // arms mode "lasso"
page.getByRole('button', { name: /Right-click for landmark menu/ }).click({ button: 'right' })
page.getByRole('menuitem', { name: /^Spline\b/ })           // Point, Line, Spline, Shape
page.getByRole('button', { name: /Zoom in|Zoom out|Reset view|Full screen/ })
```

## Gesture recipes

Compute screen points from the canvas box: `b = await canvas.boundingBox()`.

- **Point**: arm Point, click once.
- **Line**: arm Line, press, move with `steps: 8`, release.
- **Spline and shape**: click each vertex, then press `Enter`. A drag stroke does nothing.
- **Lasso**: arm it, press at the first point, move through the others with `steps: 10`, release. Check `__landmarksModel.get('mode') === 'lasso'` first.
- **Inspect**: arm Inspect and click the map; releasing opens the cube. Save is on the Inspect pill and creates an `inspect` selection.

## Gotchas observed

- A lasso drawn after a Python-set `mode` and several gestures produced no selection once, with no error. Reload the page (or confirm `mode`) and retry; then read `selections` back to confirm.
- A hidden or backgrounded tab throttles animation frames. Time work with the engine, not `requestAnimationFrame`.
- A running kernel keeps the widget JS it started with. After upgrading milume, restart the kernel before checking the UI.
- Start your own marimo on a free port for experiments. Never stop the user's.
