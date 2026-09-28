# LandmarksWidget feature map

Poteto-style verification index for agents. Each file maps **one user-visible
capability** to existing Playwright coverage — not a product roadmap.

**CI specs:** `frontend/e2e/landmarks/`  
**Harness docs:** [`frontend/e2e/README.md`](../../../frontend/e2e/README.md)  
**Skill entrypoint:** [`../SKILL.md`](../SKILL.md)

## Mapped features

| Feature | Spec source | Visual anchor |
| --- | --- | --- |
| [chrome-rest](chrome-rest.md) | `landmarks.spec.ts` — zoom test preamble | `rest` |
| [zoom-controls](zoom-controls.md) | `landmarks.spec.ts` — `"zoom in/out/reset buttons change viewState"` | (uses `rest` before zoom) |
| [place-landmark-point](place-landmark-point.md) | `landmarks.spec.ts` — `"landmark point authoring happy path"` | `after-place-point` |
| [place-landmark-line](place-landmark-line.md) | `landmarks.spec.ts` — `"line drag places a two-vertex landmark"` | — |
| [place-spline-shape](place-spline-shape.md) | `landmarks.spec.ts` — `"spline and shape are click-to-add only"` | — |
| [selection-neighborhood](selection-neighborhood.md) | `landmarks.spec.ts` — `"selection neighborhood: highlight, Shift+wheel radius, radius gradient vs knn edges"` | `selection-neighborhood` |
| [pointer-or-select-modes](pointer-or-select-modes.md) | `landmarks.spec.ts` — `"Select / Node / Move / Probe and lasso geometry control"` | — |
| [landmark-edit-node](landmark-edit-node.md) | `landmarks-tools.spec.ts` — `"node mode: drag a vertex, insert via midpoint, then delete"` | — |
| [landmark-undo](landmark-undo.md) | `landmarks-tools.spec.ts` — `"Mod+Z undoes the last landmark geometry edit"` | — |
| [inspect-cube](inspect-cube.md) | `landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block | — |
| [toolbar-layout](toolbar-layout.md) | `landmarks.spec.ts` — `"toolbar: interaction order, lasso and landmark dropdowns, cube icon"`, `"active lasso keeps its colours on hover in dark mode"` | — |
| [panel-peek](panel-peek.md) | `landmarks.spec.ts` — `"side panels collapse to a peek tab and come back"` | — |

`inspect-cube` runs under a separate spec file and harness
(`E2E_HARNESS=landmarks-volume`, `frontend/e2e/landmarks/landmarks-volume.spec.ts`),
wired into `npm run test:e2e:landmarks` alongside the rest of this tier; see
[`frontend/e2e/README.md`](../../../frontend/e2e/README.md). It shares its
rendering component (`VolumeCube`) with `VolumeCubeWidget` — see the
[verify-volume-cube feature map](../../verify-volume-cube/features/README.md).

## Not yet mapped (spec exists, no feature file)

These tests in `landmarks.spec.ts` / `landmarks-tools.spec.ts` have e2e coverage but
no dedicated feature file yet. Extend the map when agents routinely need them:

- `"select pin via model + Esc clears"`
- `"context toolbar docks at bottom center for selected landmark"` (dock + buffer/line-style edits)
- `"context toolbar promote from selection neighborhood"`
- `"point buffer promotes contained points to a selection"`, `"shape buffer side (out/in/both) shapes the promoted selection"`, `"reverse and convert the selected landmark from the context toolbar"`, `` "the legacy `locked` field no longer blocks nudge or drag edits" `` (tools.spec)

## Adding a feature

1. Confirm a spec exists under `frontend/e2e/landmarks/`.
2. Copy an existing feature file shape (four H2 sections).
3. Cite real `getByRole` names, helpers from `frontend/e2e/helpers.ts`, and traitlet keys.
4. Link the spec test title and any named screenshot from the e2e README.
