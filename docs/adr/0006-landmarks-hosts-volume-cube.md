# Landmarks hosts the volume cube

## Context

Inspecting a 3D window of tissue under a Landmarks selection meant two
widgets and a notebook glue cell: `LandmarksWidget` wrote `inspect_cx` /
`inspect_cy`, a cell copied them onto a separate `VolumeCubeWidget`'s
`window_cx` / `window_cy`, and the two rendered in different notebook
outputs. Coloring the cube to match the category panel meant a second
round trip through Python. `frontend/e2e/volume-cube/notebook-link.spec.ts`
and the `dev/notebook-link` harness existed only to prove that glue.

## Decision

`LandmarksWidget(sdata)` infers everything the cube needs from a
SpatialData object (`spatial_rx/volume_source.py`: table, labels element,
3D image, and their shared physical frame) and renders the cube itself,
in its own chrome:

- Three new traits carry only what Python needs: `volume` (read-only
  config: image/labels URLs, voxel size, origin, contrast limits),
  `volume_label_ids` (one label id per cell, base64 int32), and
  `volume_cut` (the committed cut box, `x0,x1,y0,y1,z0,z1` µm). Every
  rendering control (camera, projection, palette, image alpha/gamma, cell
  alpha, Labels) is client-local, per [ADR 0005](0005-widget-owns-rendering-controls.md).
- The **Inspect** tool places a window on the map and opens a floating
  **Cube** dialog (`frontend/src/widgets/landmarks/chrome/cube-window.tsx`)
  with its own context toolbar (`chrome/inspect-toolbar.tsx`,
  `data-testid="context-inspect-toolbar"`). Highlight follows the category
  panel's focus in the browser (`cube-highlight.ts`) — no Python round
  trip. It is a linear scan over every cell's decoded `points_data`
  position against the window (plus a 10 µm margin), re-run whenever the
  window, focus, categories or selections change, so on each drag move
  too; a spatial index is the next step if large tables make that slow.
- `volume_cut`'s X/Y edges are window-relative in the browser
  (`cube-cut.ts`): an open edge follows the inspect window as it moves, so
  Python reads the shown box by intersecting `volume_cut` with the window
  (`inspect_cx/cy ± inspect_size_um/2`) rather than a second frame. Z is
  absolute, since the stack does not move. The trait is written once on
  slider release and once when a window move settles (~250 ms debounce),
  only while the cube is open.
- `VolumeCube` (`frontend/src/widgets/volume-cube/VolumeCube.tsx`) is the
  shared rendering component: props and a cell lookup in, no model. Both
  `landmarks/chrome/cube-window.tsx` and the standalone
  `volume-cube/VolumeCubeView.tsx` bind it to their own state.
- The browser reads the store through a loopback server
  (`serve_directory` in `spatial_rx/volume_cube.py`) that serves only
  `images/<image>/` and `labels/<labels>/` of the SpatialData; tables and
  every other path are 404, and no directory is listed.
- `LandmarksWidget(adata)` (no SpatialData) is unchanged: no cube, no new
  traits populated.

## Consequences

- Viv, zarrita and the cube shaders join the Landmarks bundle (both widgets
  already share the root deck.gl / luma.gl stack); `landmarks.mjs` grew
  from about 2.9 MB to about 4.9 MB raw, because a widget loads as one
  module and cannot share a chunk with another notebook cell. The widget
  build inlines dynamic imports, so every Landmarks widget downloads Viv,
  with or without a 3D image; `VolumeCube`'s lazy import only defers it
  in the dev harness.
- In MIP the projection is drawn opaque, so the Image **Alpha** slider
  scales its colour: it acts as brightness rather than transparency.
- `VolumeCubeWidget` and `from_ome_zarr` stay as a standalone widget, and
  as the dev/Playwright harness for the cube's rendering
  (`npm run dev:volume-cube`, `npm run test:e2e:volume-cube`) — the same
  `VolumeCube` component both ways.
- The notebook-link harness (`frontend/dev/notebook-link/`) and its spec
  are gone: `frontend/dev/landmarks-volume/` and
  `frontend/e2e/landmarks/landmarks-volume.spec.ts` cover the inspect →
  cube path directly, with a toy SpatialData instead of two linked
  widgets. Manually linking `LandmarksWidget.inspect_cx` to a separate
  `VolumeCubeWidget.window_cx` (as `demos/volume-cube.py` still shows)
  remains possible but is no longer the traitlet path this product
  exercises in CI.
- Traits budget: three more on top of the widget's ~70; still one owner
  per synced value (ADR 0005) — the cube's own controls never become
  traits Python did not ask for.
