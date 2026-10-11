# Lasso selection (marimo / molab)

## Proof

- Harness: `landmarks.spec.ts` — `"lasso stroke survives picking-canvas mouseleave with foreign relatedTarget"`, `"lasso stroke commits under CSS scale on the widget host"`.
- Marimo kernel: `landmarks-selection-molab.spec.ts` on Pyxa `small/` (~4.3k cells) with CSS scale, DPR 2, and a synthetic picking-canvas `mouseleave` mid-stroke (`playwright.marimo-pyxa.config.ts`).
- Marimo molab shell: `landmarks-molab-iframe.spec.ts` — widget inside an outer iframe with CSS scale and zero-height grow-in; lasso path, seed highlight, `get_focus_obs_names` via `data-testid="marimo-focus-count"`, centred inspect cube (`playwright.marimo-pyxa-iframe.config.ts`, video on in CI).

## Regression

Deck picking-buffer swaps can fire `mouseleave` on the WebGL canvas with a `relatedTarget` outside the widget while the pointer is still on the plot. Long lasso drags must not clear `isLassoing` until window-capture `mouseup`; CSS-scaled hosts must map pointer coords through `clientWidth` / `getBoundingClientRect().width` before `viewport.unproject`.

Focused selections with `neighborhood: "off"` still get seed point-role emphasis (`prepareFocusGeom` seeds-only path); toggling hood off and back on reuses stashed neighborhood geometry when seeds match. Deferred zero-height mounts must resize the plot (`IntersectionObserver` + host `ResizeObserver`) so draft overlays and scatter highlights render. Volume cube framing must use the host's real `getBoundingClientRect` size (not inflated preview floors); re-home zoom only until the user adjusts the camera, then scale zoom on resize (`landmarks-volume.spec.ts` centre signal + wheel-zoom resize tests).
