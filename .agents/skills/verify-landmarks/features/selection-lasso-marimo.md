# Lasso selection (marimo / molab)

## Proof

- Harness: `landmarks.spec.ts` — `"lasso stroke survives picking-canvas mouseleave with foreign relatedTarget"`, `"lasso stroke survives mouseleave when relatedTarget is the anywidget shadow host"`, `"lasso stroke commits under CSS scale on the widget host"`.
- Harness molab viewport (CI landmarks): `landmarks-molab-viewport.spec.ts` — CSS scale, zero-height grow, lasso path + highlight on the Vite harness.
- Harness molab shadow stress (CI landmarks): `landmarks-molab-shadow.spec.ts` — scrolled page, CSS scale, deck picking canvas above WebGL, `mouseleave` with shadow-host `relatedTarget`, lasso path + commit + highlight. Regression proof vs tag `v1.3.3`: `node frontend/scripts/prove-molab-shadow-harness.mjs`.
- Marimo kernel (local): `landmarks-selection-molab.spec.ts` on Pyxa `small/` with CSS scale, DPR 2, picking `mouseleave` stub (`playwright.marimo-pyxa.config.ts`).
- Marimo molab shell (local): `landmarks-molab-pyxa-shell.spec.ts` — zero-height grow + CSS scale on the marimo page; lasso, highlight, `get_focus_obs_names`, centred inspect cube.
- Marimo molab iframe (local): `landmarks-molab-iframe.spec.ts` — same assertions inside an outer iframe (`playwright.marimo-pyxa-iframe.config.ts`).

## Regression

Deck picking-buffer swaps can fire `mouseleave` on the WebGL canvas with a `relatedTarget` outside the widget while the pointer is still on the plot. On molab, `relatedTarget` is often the anywidget **shadow host** (not inside `container.contains`); `pointerStillOnPlot` and `eventInWidget` must treat that host and `composedPath()` as in-widget. Long lasso drags must not clear `isLassoing` until window-capture `mouseup` / `pointerup`; window capture should `preventDefault` selection strokes so notebook text does not steal the drag. CSS-scaled hosts must map pointer coords through `clientWidth` / `getBoundingClientRect().width` before `viewport.unproject` (use the event target canvas when deck adds a picking canvas).

Focused selections with `neighborhood: "off"` still get seed point-role emphasis (`prepareFocusGeom` seeds-only path); toggling hood off and back on reuses stashed neighborhood geometry when seeds match. Deferred zero-height mounts must resize the plot (`IntersectionObserver` + host `ResizeObserver`) so draft overlays and scatter highlights render. Volume cube framing must use the host's real `getBoundingClientRect` size (not inflated preview floors); re-home zoom only until the user adjusts the camera, then scale zoom on resize (`landmarks-volume.spec.ts` centre signal + wheel-zoom resize tests).
