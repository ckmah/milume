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
SpatialData object (`milume/volume_source.py`: table, labels element,
3D image, and their shared physical frame) and renders the cube itself,
in its own chrome:

- Three new traits carry only what Python needs: `volume` (read-only
  config: image/labels URLs, voxel size, origin, contrast limits),
  `volume_label_ids` (one label id per cell, base64 int32), and
  `volume_cut` (the committed cut box, `x0,x1,y0,y1,z0,z1` µm). Every
  rendering control (camera, projection, palette, image alpha/gamma, cell
  alpha, Labels) is client-local, per [ADR 0005](0005-widget-owns-rendering-controls.md).
- The **Inspect** tool places a window on the map and opens the **Cube**
  dialog (`frontend/src/widgets/landmarks/chrome/cube-immersive.tsx`; a
  floating window until the 2026-10-02 addendum)
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
  rendering component: props and a cell lookup in, no model.
  `landmarks/chrome/cube-immersive.tsx` binds it to the widget state.
- The browser reads the store through a loopback server
  (`serve_directory` in `milume/volume_cube.py`) that serves only
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
- The standalone `VolumeCubeWidget` (and `from_ome_zarr`) and its dev/Playwright
  harness were removed when Milume dropped the standalone image interface; the
  cube is only reachable through `LandmarksWidget(sdata)`.
- The notebook-link harness (`frontend/dev/notebook-link/`) and its spec
  are gone: `frontend/dev/landmarks-volume/` and
  `frontend/e2e/landmarks/landmarks-volume.spec.ts` cover the inspect →
  cube path directly, with a toy SpatialData instead of two linked
  widgets. Linking `LandmarksWidget.inspect_cx` to a separate widget is no longer
  a supported path.
- Traits budget: three more on top of the widget's ~70; still one owner
  per synced value (ADR 0005) — the cube's own controls never become
  traits Python did not ask for.

## Addendum 2026-09-26

[Inspect preview, dock and history](../superpowers/specs/2026-09-26-inspect-preview-dock-design.md)
adds a live pyramid preview beside the window square and a history strip in
the dock, without new traits:

- The window is a fixed 300 µm square. The hover preview loads a coarse level
  through `pickLevel`; the dock shows that level from cache, then always loads
  level 0 for the window (only the 3D texture axis limit makes it coarser).
- A decoded-chunk LRU is shared per widget instance between the preview and
  the dock, so recentres and reopens are cache reads, not re-fetches.
- A click only places the window. The dock's **Save** makes an ordinary
  `selections` entry (`type: "inspect"`); the history strip reads
  `selections`, it does not add a trait.
- `inspect_size_um` flips to an output: the browser writes 300 at placement;
  Python no longer sets it.
- Both cube views open top-down and draw the user's landmarks on the stack's
  top face, with a small axis legend.

## Addendum 2026-10-02

[Inspect: immersive cube](../superpowers/specs/2026-10-02-inspect-immersive-cube-design.md)
replaces the floating Cube window with a takeover of the plot area, still
without new traits:

- The cube is no longer a floating window. `CubeImmersive`
  (`chrome/cube-immersive.tsx`) fills the plot area (`.landmarks__body`, or the
  whole widget in fullscreen) and covers the map while it is open; the map stays
  mounted underneath, so the engine keeps its layout and WebGL context. Esc or
  Close cube returns to the map; to move the window the user closes the cube and
  places again. The hover preview is hidden while the cube is open.
- The cube opens on mouse **release**, not press (the engine's `release`
  event). A press-and-drag positions the window with the hover preview
  following, and the cube opens where the drag ends.
- A second, coarse **context** volume layer is loaded around the window (3×
  the window's side, within `PREVIEW_REGION_BUDGET`, through its own
  `useShownWindow`) and drawn first, dimmed and desaturated outside the
  window, so zooming out shows the tissue around it. The window layer is
  unchanged. The window stays the unit that Save, the cut and the highlight
  act on; the context is for orientation only and never moves `inspect_cx` /
  `inspect_cy` (no free pan; zoom-out stops just past the context region).
- Known limit: the context drops every ray that crosses the window's column,
  so an orbited view does not draw context tissue in front of or behind the
  window. A screen-space blur that would hold the focus when orbited was not
  built.
- No new synced traits; `volume`, `volume_label_ids`, `volume_cut`, `inspect_*`
  and `selections` keep their meaning, and ADR 0005 still holds (the cube's
  controls and the context stay client-local).
