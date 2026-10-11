# Lasso selection (marimo / molab)

## Proof

- Harness: `landmarks.spec.ts` — `"lasso stroke survives picking-canvas mouseleave with foreign relatedTarget"`, `"lasso stroke commits under CSS scale on the widget host"`.
- Marimo kernel: `landmarks-selection-molab.spec.ts` on Pyxa `small/` (~4.3k cells) with CSS scale, DPR 2, and a synthetic picking-canvas `mouseleave` mid-stroke (`playwright.marimo-pyxa.config.ts`).

## Regression

Deck picking-buffer swaps can fire `mouseleave` on the WebGL canvas with a `relatedTarget` outside the widget while the pointer is still on the plot. Long lasso drags must not clear `isLassoing` until window-capture `mouseup`; CSS-scaled hosts must map pointer coords through `clientWidth` / `getBoundingClientRect().width` before `viewport.unproject`.
