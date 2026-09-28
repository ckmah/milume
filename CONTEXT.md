# spatial-rx

Interactive notebook widgets for spatial omics exploration. Python owns analysis
logic; the browser owns presentation. State crosses the boundary through named,
typed fields.

Point scatter, landmarks, selections, and drafts use deck.gl orthographic
layers via `LandmarksWidget(adata, color=..., genes=...)`. AnnData is the
analysis object: coordinates in `obsm["spatial"]`, labels in `obs`,
expression in `X`. The widget holds a **reference** to the caller’s AnnData
(no `obs.copy()`, no dense copy of `X`; sparse expression packs straight to
CSC). Gene names and expression pack at construct for view-only coloring
(`genes=` restricts the catalog; large matrices warn but still send). Chrome
follows the notebook cell width. Marker radius is derived from median
nearest-neighbor distance; opacity and default buffer are fixed or computed
from spatial extent.

Neighborhood expand (k-NN / radius) runs **in the browser** from coordinates
(spatial index). No `obsp` neighbor graphs are required or synced. Promote
freezes membership into selection `point_indices`. Persist selections as
`obs_names` via `get_obs_names` / `assign_obs_mask` (geometry or
`point_indices`), not positional indices.

Synced on interaction: `landmarks`, `selections`, and selection focus. Other
chrome state is client-local; hydrate payloads (points, genes, categories,
embeddings) cross the wire at construct. Raster bin features and probe scores
are built entirely in the browser.

`LandmarksWidget(sdata)` also reads a SpatialData on disk: the table's labels
element, a 3D image on the same grid, and their µm frame. **Inspect** opens a
**cube** of the inspect window inside the widget; its rendering controls are
client-local, and cells are colored from the category panel in the browser.
Only `volume` (config), `volume_label_ids` and `volume_cut` are synced
([ADR 0006](docs/adr/0006-landmarks-hosts-volume-cube.md)).

## Language

**Widget**:
An interactive control embedded in a notebook cell whose state stays in sync with
Python without re-running the cell.
_Avoid_: anywidget, component, view

**Synced state**:
A named value that flows between Python and a widget in either direction when it
changes.
_Avoid_: data blob, payload, props

**Traitlet**:
The name of one synced field on a widget's Python model. Each traitlet has a type
and an optional default.
_Avoid_: property, attribute, key

**Vanilla widget**:
A widget whose browser code is hand-written JavaScript, shipped as source in the
package.
_Avoid_: ESM widget, canvas widget, landmarks widget

**React widget**:
A widget whose browser code is composed with React and shadcn/ui, compiled ahead
of time into a bundle.
_Avoid_: shadcn widget, frontend widget

**Bundle**:
The pre-compiled browser assets for a React widget, shipped inside the installed
package so consumers need no build toolchain.
_Avoid_: static files, .mjs, dist

**Widget consumer**:
A notebook user who installs spatial-rx and embeds widgets. No frontend toolchain
required.
_Avoid_: user, end user

**Widget author**:
A contributor who adds or changes widget UI. Works in the frontend source tree
and rebuilds bundles before release.
_Avoid_: developer, maintainer

**Widget scaffold**:
Generated starter files for a new widget, driven by a traitlet specification
rather than copied from an existing widget.
_Avoid_: template, boilerplate generator

**Landmark**:
A user-placed geometric annotation on tissue coordinates (point, line, spline,
or shape). Landmarks are the durable annotation object: notebooks convert them
to/from a GeoDataFrame (and may place that into SpatialData). See
`docs/landmarks-spatialdata-contract.md`.
_Avoid_: treating landmarks like ephemeral canvas-only decorations; widget-owned
SpatialData attach/auto-save

**Selection**:
A region of tissue coordinates chosen for downstream analysis (lasso, polygon,
rectangle, ellipse). Selections stay on the widget as synced geometry; persist
hits via `get_obs_names` / `assign_obs_mask` as `obs_names`, not positional
indices. Selections are intentionally different from Categories / Genes /
Landmarks layer chrome and are not written to SpatialData in M1.
_Avoid_: layer-parity UX with landmarks; SpatialData export of selections

**Gallery item**:
One card in a gallery widget: a required title with optional description and
image.
