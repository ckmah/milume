# Surface: Landmarks widget chrome

Target: `src/widgets/landmarks/` (chrome/, LandmarksView.tsx, landmarks.css). Harness: `dev/index.html` via `npm run dev:landmarks`.

## Mode

Operate

## Visitor and task

A computational biologist inside a marimo/Jupyter cell, reading tissue and cell data and acting on it: select regions, place landmarks, colour by category / gene / embedding, Inspect a 3D window. Sessions are long and repeated; the user knows the tool after the first run.

## What leads

1. The plot (tissue image + cells), edge to edge under floating chrome.
2. Tools: the top tool pill (select, pan, Inspect, landmark modes, lasso/shape, zoom, fullscreen).
3. Data rows: Selections and Landmarks (left card), the data card (colour-by + legend, right).
4. Secondary, folded by default: Layers (with the depth rail for 3D images), display options, rulers, minimap.

## Constraints

- Visual evidence is stills or annotated live chrome from the harness. No Figma/Wonder comps, no generated images, no `live`/`generate` variant mode.
- Chrome sizes are fixed; budgets come from the widget box (container queries), never the page.
- Representative sizes: 1280×800 and 960×720 (plus 1440×900 when a layout changes); light and dark; narrow (<640px) stack.
- Ground: black while an image layer is visible, `--lm-bg` otherwise.
- Panel hide = carets; minimise = boxed −/+; one section open per panel (each dock is an accordion with at most one expanded section; left and right can be open together when space allows); minimise never moves a control.
- Legend open in the data card: keep the 24px summary bar (donut slices, same colours and proportions) above the list while at least 8 entries fit, else fall back to the one-line summary.
- Chrome text ≥ 11px; only canvas ruler ticks may be 9px.
- Inspect never draws points.

## Signature move

Soft Float: one translucent glass material for every float over a live specimen, with inverted active glyphs in muted trays.

## Open decisions

See `docs/widget-ui-dev.md` (Widget UI design loop) and issue #376 for decisions not yet confirmed by Clarence.
