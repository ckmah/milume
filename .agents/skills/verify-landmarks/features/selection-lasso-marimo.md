# Lasso selection (marimo / molab)

## Proof

- Harness: `landmarks.spec.ts` — `"lasso stroke survives picking-canvas mouseleave with foreign relatedTarget"`, `"lasso stroke commits under CSS scale on the widget host"`.
- Marimo kernel: `landmarks-selection-molab.spec.ts` on Pyxa `small/` (~4.3k cells) with CSS scale, DPR 2, and a synthetic picking-canvas `mouseleave` mid-stroke (`playwright.marimo-pyxa.config.ts`).
- Marimo molab shell (CI): `landmarks-molab-pyxa-shell.spec.ts` — zero-height grow + CSS scale on the marimo page; lasso, seed highlight, `get_focus_obs_names`, centred inspect cube (`playwright.marimo-pyxa.config.ts`).
- Marimo molab iframe (local): `landmarks-molab-iframe.spec.ts` — same assertions inside an outer iframe (`playwright.marimo-pyxa-iframe.config.ts`, skipped on CI).

## Regression

Deck picking-buffer swaps can fire `mouseleave` on the WebGL canvas with a `relatedTarget` outside the widget while the pointer is still on the plot. Long lasso drags must not clear `isLassoing` until window-capture `mouseup`; CSS-scaled hosts must map pointer coords through `clientWidth` / `getBoundingClientRect().width` before `viewport.unproject`.

Focused selections with `neighborhood: "off"` still get seed point-role emphasis (`prepareFocusGeom` seeds-only path); toggling hood off and back on reuses stashed neighborhood geometry when seeds match. Deferred zero-height mounts must resize the plot (`IntersectionObserver` + host `ResizeObserver`) so draft overlays and scatter highlights render. Volume cube framing must use the host's real `getBoundingClientRect` size (not inflated preview floors); re-home zoom only until the user adjusts the camera, then scale zoom on resize (`landmarks-volume.spec.ts` centre signal + wheel-zoom resize tests).
