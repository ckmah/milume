# VolumeCubeWidget feature map

Poteto-style verification index for agents. Each file maps **one user-visible
capability** to existing Playwright coverage — not a product roadmap.

**CI specs:** `frontend/e2e/volume-cube/`  
**Harness docs:** [`frontend/e2e/README.md`](../../../frontend/e2e/README.md)  
**Skill entrypoint:** [`../SKILL.md`](../SKILL.md)

## Mapped features

| Feature | Spec source | Visual anchor |
| --- | --- | --- |
| [harness-boots-volume](harness-boots-volume.md) | `volume-cube.spec.ts` — `"harness boots and OME-Zarr volume renders"` | `rest` |
| [inspect-window-placement](inspect-window-placement.md) | `volume-cube.spec.ts` — `"toy inspect drag updates synced window traits"` | `window-on-sphere` |
| [window-trait-readout](window-trait-readout.md) | `volume-cube.spec.ts` — `"model patches update the window and axis slice readout"` | — |
| [labels-toggle](labels-toggle.md) | `volume-cube.spec.ts` — `"labels switch outlines cells as a second channel of the same volume"` | `labels-off` |
| [fetch-errors](fetch-errors.md) | `volume-cube.spec.ts` — `"a failed labels fetch ends in an error state, not loading"`, `"a failed image window fetch shows a status line"`; `test_serve_directory_takes_a_burst_of_parallel_reads` | — |
| [cube-controls](cube-controls.md) | `volume-cube.spec.ts` — `"in-widget controls: camera presets, projection, and a committed Z cut"` | `rest` |
| [highlight-groups](highlight-groups.md) | `volume-cube.spec.ts` — `"highlight_groups colour chosen cells and follow the Labels switch"` | — |
| [axis-slice-traits](axis-slice-traits.md) | `volume-cube.spec.ts` — `"model patches update the window and axis slice readout"` | — |
| [coord-contract-xy-frame](coord-contract-xy-frame.md) | `test_coord_contract_landmarks_cube_xy`; `test_from_ome_zarr_frames_cube_in_store_microns` | — |
| [python-analysis-inspect-window](python-analysis-inspect-window.md) | `test_coord_contract_landmarks_cube_xy`; `demos/volume-cube.py` analysis cell | — |

`VolumeCube` (`frontend/src/widgets/volume-cube/VolumeCube.tsx`) is a shared
rendering component: this standalone widget (`VolumeCubeView.tsx`) and
Landmarks' floating Cube dialog (`landmarks/chrome/cube-window.tsx`) both bind
it to their own state — see [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)
and the [verify-landmarks `inspect-cube` map entry](../../verify-landmarks/features/inspect-cube.md).
The Inspect → cube path is now proved directly in the landmarks tier
(`frontend/e2e/landmarks/landmarks-volume.spec.ts`), not by linking two
separate widgets — the notebook-link harness and its spec are gone.

`data-*` attributes (`data-channels`, `data-render`, `data-pan`,
`data-palette`, `data-image-gamma`, `data-highlight`, `data-labels`) exist in
two places: the full mirror on `VolumeCube`'s own root, `.volume-cube__view`
(the element the feature files below assert against inside Landmarks' Cube
dialog), and a smaller subset re-mirrored onto this standalone widget's own
root (`.volume-cube`, via `VolumeCubeView.tsx`) for tests written against the
standalone harness. Scope selectors to the widget under test — do not assume
one root's attributes describe the other's.

## Not yet mapped (spec exists, no feature file)

These tests have e2e coverage but no dedicated feature file yet. Extend the map
when agents routinely need them:


## Adding a feature

1. Confirm a spec exists under `frontend/e2e/volume-cube/`.
2. Copy an existing feature file shape (four H2 sections).
3. Cite real `getByRole` names, helpers from `frontend/e2e/helpers.ts`, and traitlet keys.
4. Link the spec test title and any named screenshot from the e2e README.
