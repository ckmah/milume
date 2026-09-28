# Landmarks hosts the volume cube

**Date:** 2026-09-25
**Status:** design, awaiting review

## Goal

One widget, one gesture. `LandmarksWidget(sdata)` reads a SpatialData object and
infers everything the 3D cube needs. The **Inspect** tool shows a window-sized
square under the cursor; clicking or dragging places it and opens a floating 3D
view of that window inside the Landmarks widget. The cube's controls sit in the
bottom context toolbar like every other tool's, and which cells it colours
follows the category panel. The notebook needs no glue cells.

Alongside it, the main toolbar is regrouped, Inspect gets a cube icon, the lasso
button keeps its active colour on hover, and both side panels collapse to a peek
tab.

## Non-goals

- Analysis workflows or statistics cells (the colon A2 example is on hold).
- Hiding categories in the panel (not a feature today; see Highlight rules).
- Removing `VolumeCubeWidget`: it stays as a standalone widget and as the dev
  harness for the cube's rendering, built from the same component.
- Several open cubes, or a cube not tied to the inspect window.

## User flow

1. `w = LandmarksWidget(sdata)` in a notebook cell; display `w`.
2. Press **I** (or pick the cube icon). A square the size of the inspect window
   follows the cursor over the map.
3. Click: the square is placed and a floating **Cube** window opens over the map,
   showing the window's nuclear stain in 3D. Drag: the square follows the cursor
   and the cube pans live (loaded voxels slide under a fixed frame; the new
   window replaces them when it loads).
4. The bottom context toolbar shows the cube's controls while Inspect is active.
5. Focus a category or Selection in the side panel: the cube colours those cells.
6. Switching tools keeps the cube open; its close button or **Esc** (in Inspect)
   hides it. Clicking again in Inspect reopens it.

## Python API and inference

```python
w = LandmarksWidget(sdata)                      # everything inferred
w = LandmarksWidget(sdata, table="rna", color="Cluster", image="mosaic")  # overrides
w = LandmarksWidget(adata)                      # unchanged: no cube
```

`LandmarksWidget.__init__` accepts `AnnData | SpatialData`. For a SpatialData:

| What | Inferred from | Override |
| --- | --- | --- |
| Table | the only table; otherwise the one annotating a labels element; otherwise error listing tables | `table=` |
| Cells' xy | `table.obsm["spatial"]` (as today) | `spatial_key=` |
| Labels element | `table.uns["spatialdata_attrs"]["region"]` when it names a labels element | `labels=` (or `None`) |
| Label id per cell | `obs[instance_key]` from the same attrs | none |
| Image element | the 3D image (`c, z, y, x`) in the table's coordinate system whose level-0 grid (shape and transform) equals the labels'; else the only 3D image there | `image=` (or `None`) |
| Physical frame | the element's transform to that coordinate system (scale + translation, including SpatialData's `Sequence`) | none |
| Colour-by | first categorical column (as today) | `color=` |

- The cube needs the SpatialData on disk (`sdata.path`, backed Zarr). The widget
  serves that directory on loopback with range requests (the existing
  `serve_directory`), so the browser reads `images/<name>` and `labels/<name>`
  lazily. In-memory SpatialData, or no 3D image, gives a widget without the
  cube and one `UserWarning` saying why.
- A labels element on a different grid from the image is dropped with a warning;
  the cube still shows the image.
- Only the image's first channel is shown.
- Coordinates must agree: the table's `obsm["spatial"]` is in the chosen
  coordinate system's units. This is the contract the colon A2 build already
  meets (Pyxa µm = the mosaic's `global` frame).
- `LandmarksWidget(adata)` keeps today's behaviour; `VolumeCubeWidget` and its
  `from_ome_zarr` stay for standalone use.

### Data: the colon A2 SpatialData gains the mosaic

The build script (sibling `pyxa_scverse_demo/build_colon_a2.py`) writes Meteor's
`mosaic_3d.ome.zarr` into the SpatialData as `images/mosaic` (`Image3DModel`,
`c, z, y, x`), next to `labels/cell_labels`:

- Meteor's store is `t, c, z, y, x`; SpatialData images have no `t`, so the
  levels are rewritten, not copied. Its six existing levels are reused (no
  pyramid recompute) and written with the same 32×256×256 chunks.
- Sharding (1024² shards, as Meteor writes) if SpatialData's writer supports it
  in the installed version; otherwise plain chunks. To be confirmed in the plan;
  it changes file count, not correctness.
- `uns["pyxa"]["mosaic_3d"]` goes away.
- The element is `mosaic`, not named for its stain: more channels will join it
  later (out of scope here; the cube shows channel 0).

## Synced traits: three new ones

The widget already has ~70 traits. The cube adds three and reuses the inspect
traits; every rendering control is client-local (ADR 0005).

| Trait | Type | Set by | Size |
| --- | --- | --- | --- |
| `volume` | `Dict` (read-only config): `image_url`, `labels_url`, `voxel_size_um` (z, y, x), `origin_um`, `contrast_limits` (the browser reads the pyramid itself) | Python, once | < 1 KB |
| `volume_label_ids` | `Unicode`: base64 int32, one per cell, in table order (0 = no label) | Python, once | 4 B/cell (1.9 MB b64 for 358k) |
| `volume_cut` | `List(Float, 6)`: x0, x1, y0, y1, z0, z1 in µm | widget, on slider release | 6 floats |
| `inspect_cx`, `inspect_cy`, `inspect_size_um` | existing | widget / Python | — |

Client-local, never synced: cube open/closed and its position, camera, additive
/ MIP, palette, Labels switch, contrast while dragging, image alpha and gamma, cell alpha, peek
state of the side panels.

Python reads the cut box with `w.volume_cut`, and the inspect window as today.
Nothing is re-sent when the window moves: the browser fetches voxels directly
and computes the highlight itself.

## Frontend

### Shared cube component

`VolumeCubeView` is split into:

- `volume-cube/VolumeCube.tsx`: props in, no model. Loads the pyramid, picks the
  level, cuts the window (`WindowPixelSource`, `LabelVolumeSource`), pans the
  loaded volume, raycasts with the cell lookup, draws the frame and axes. Props:
  URLs and frame, window centre and size, cut, contrast, render settings
  (camera preset, mode, palette, image alpha and gamma, cell alpha, labels on), and the
  cell lookup (`HighlightGroup[]` or a prebuilt lookup).
- `volume-cube/VolumeCubeView.tsx`: the standalone widget; binds its traits and
  `CubeControls` to `VolumeCube`, as now.
- `landmarks/chrome/cube-window.tsx`: the floating window in Landmarks: Soft
  Float panel (`FLOAT_PANEL`), title bar with drag handle and close, the 3D view
  only, default about 440×380 px at the top right of the map, clamped inside the
  widget (and so works in full screen). A resize handle on the corner.

Viv, zarrita and the cube shaders join the Landmarks bundle (both already share
the root deck.gl / luma.gl stack). Expected growth ~1 MB; checked at build.

### Inspect tool in the engine (`landmarks.js`)

- Hover in Inspect: draw the window square (blue, as now) centred on the cursor;
  no model writes while hovering.
- Pointer down: place the square (`inspect_cx/cy`), open the cube (event to the
  React chrome). Drag: update `inspect_cx/cy` on each move (throttled to one
  write per animation frame), so the cube pans.
- Esc in Inspect closes the cube and clears the hover square.

### Context toolbar in Inspect

`SelectionToolbar` gains an Inspect bar, shown while the mode is Inspect and the
cube is open, using the existing level-1 / level-2 pattern:

- **Level 1:** Top · Iso · Side | Additive · MIP | **Palette ▾** | **Labels**
  switch | **Cuts** · **Image** · **Cells** (level-2 openers) | Reset view.
- **Level 2:**
  - **Cuts:** X, Y, Z range sliders in µm (X/Y from the window edge), live while
    dragging, commit `volume_cut` on release.
  - **Image:** contrast range, alpha (0–1), gamma (0.2–5, log scale).
  - **Cells:** alpha (0–1).

**Palette** is the image's colour map: gray (default), inferno, magma, viridis,
cividis. Label colours always come from the category palette.

**Alpha and gamma** in the raycast (gamma for the image only):

- Image: `v = pow(contrast(v), gamma)`; per-sample opacity `v * alpha`; colour
  from the palette at `v`.
- Cells: per-sample opacity `alpha * a`, where `a` is the lookup's fill or
  outline alpha.

These become uniforms of the cube's own shader module, so moving any of them is
one redraw. The palette is a 256×1×1 lookup texture (3D, like every sampler in
the raycast). The cube always renders with its own extension (image only, or
image + cells, by channel count), no longer Viv's stock blend.

### Highlight rules (browser only)

The fill follows the Landmarks colour-by column (`active_category`) and the
panel's focus, for cells in the window (queried from the existing spatial index):

| Panel focus | Cube fills |
| --- | --- |
| nothing | every cell, in its category colour |
| a category (legend row) | that category's cells, in its colour |
| a Selection | the Selection's cells, by category colour |
| colour-by is a gene or continuous | outlines only |

Labels off hides fills and outlines. A legend of the categories shown sits in the
cube window's corner. Focus changes rebuild only the GPU lookup, as today.

### Main toolbar

Order: `select · hand · inspect · probe · node | lasso ▾ · landmark ▾ | + · − ·
reset | full screen`.

- **Landmark ▾** replaces the four landmark buttons with one dropdown built like
  the lasso's: left click arms the last-used landmark type, right click (or the
  chevron) opens point / line / spline / shape.
- **Inspect** uses lucide `Box`.
- **Lasso hover fix:** the active dropdown button keeps `bg-foreground
  text-background` on hover in dark mode (today the ghost variant's
  `dark:hover:bg-accent/50` wins and the icon turns dark on dark). Same fix
  for the new landmark dropdown.

### Collapsible side panels

The left (layers) and right (info / explore) docks each get a collapse button in
their header. Collapsed, the panel slides off its edge and leaves a slim peek tab
(icon, full height of the old header) that brings it back on click; **[** and
**]** toggle left and right. State is client-local. The narrow layout (one
stacked dock) collapses as one.

## Error handling

- No cube (in-memory SpatialData, no 3D image): the Inspect tool still places the
  square (as today); the context bar says "No 3D image: build the widget from a SpatialData
  with a 3D image".
- Fetch or decode error: the cube window shows the message; the map is
  unaffected.
- Window outside the image: "Inspect window is outside the volume".
- Label ids above 2^24 or 4M are not coloured (documented limit; warn in Python
  when `volume_label_ids` exceeds it).

## Testing

- **Python:** inference table (single table, region link, image grid match,
  overrides, in-memory SpatialData and missing-image warnings), trait sizes
  (`volume` dict keys only; one `volume_label_ids`), `volume_cut` default.
- **Playwright (landmarks harness, with a toy SpatialData):**
  - hover square follows the cursor in Inspect with no model writes;
  - click opens the cube window; drag pans (`data-pan` non-zero then `0,0`);
  - Inspect context bar: presets, MIP, palette, Labels, a committed Z cut in
    `volume_cut`, alpha / gamma change without a refetch;
  - highlight follows focus (nothing / category / Selection) via `data-highlight`;
  - toolbar order, landmark dropdown, cube icon, lasso active-hover colour;
  - side panels collapse to a peek tab and back, by click and `[` / `]`.
- **Existing:** cube e2e (standalone harness) and Landmarks e2e stay green.
- **Docs:** ADR 0006 "Landmarks hosts the volume cube"; verify-landmarks feature
  map entries for inspect-cube, toolbar layout and panel peek; the
  verify-volume-cube map notes the shared component.

## Risks

- Bundle size and first-load time of Landmarks with Viv inside.
- Landmarks' already large `landmarks.js` engine; the Inspect hover and drag
  stay small and self-contained there.
- SpatialData's writer and zarr v3 sharding for the rewritten mosaic.
