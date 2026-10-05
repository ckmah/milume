---
name: milume
description: >-
  Use and read milume's LandmarksWidget (interactive spatial-omics map) from a
  notebook kernel. Triggers when a notebook has `LandmarksWidget` / `milume.peek`,
  or the user mentions milume, landmarks, selections, Inspect cube, drawing a
  region/front/boundary on tissue, or getting selected cells back into Python.
  Covers reading widget state and data, driving the widget from Python, measuring
  against landmarks, and the browser only when pixels matter.
---

# milume in a notebook

The widget has two halves. **State** lives in the Python kernel as synced
traitlets and crosses to the browser in both directions. **Pixels** live in a
WebGL canvas that no accessibility tree or page-text read can see. Answer
state questions from the kernel; open a browser only to see or gesture.

You need a way to run Python in the user's live kernel. For marimo, use the
`marimo-pair` skill. In Jupyter there is no such channel unless a Jupyter MCP
is connected; say so rather than guessing at state.

## 1. Orient (always first)

Run [scripts/orient.py](scripts/orient.py) in the kernel. It finds every
`LandmarksWidget`, then prints the coordinate extent, categorical columns,
landmarks, selections, inspect window, volume, and the AnnData's `obs` columns.
It is read-only.

```bash
bash <marimo-pair>/scripts/execute-code.sh --url <notebook-url> <this-skill>/scripts/orient.py
```

In a marimo scratchpad the notebook's variables are already in scope. The
widget is usually wrapped: `mo.ui.anywidget(widget)`. The wrapper's `.widget` is
the `LandmarksWidget`, and attribute reads on the wrapper forward to it.

## 2. Read and write state from Python

Synced traitlets (details and dict shapes in [references/state.md](references/state.md)):

| Question or goal | Do |
|---|---|
| What has the user drawn? | `widget.landmarks` (list of dicts: `id`, `type` point/line/spline/shape, `vertices` in µm) |
| Which cells did they select? | `widget.get_obs_names(adata, selection_id)` → `obs_names` array |
| Keep a selection as a column | `widget.assign_obs_mask(adata, "my_key", selection_id)` |
| Which item is focused? | `widget.selected_kind`, `widget.selected_index` |
| Draw something for the user | assign a new list: `widget.landmarks = [*widget.landmarks, {...}]` |
| Select a region by code | append a `polygon` / `rectangle` / `ellipse` dict to `widget.selections` |
| Change colouring or genes | `widget.set_color("obs_col")`, `widget.active_genes = ["GENE"]`, `widget.mode = "select"` |
| Move the Inspect cube | set `widget.inspect_cx`, `widget.inspect_cy` |

Assign a new list to `landmarks` and `selections`. In-place mutation does not
sync. A write shows up on screen and on the wrapper within a second. Marimo cells
that read the wrapper re-run, so a probe write can recompute the user's
analysis: use a scratch id, then restore the original list.

## 3. Measure against what was drawn

Convert landmarks, then use the measure functions. Signatures and semantics are
in each function's docstring (`help(milume.distances)`); the map of which to use:

| Question | Function |
|---|---|
| Distance from every cell to a landmark | `milume.distances(adata, gdf, obs_key=...)` |
| Where along a line/spline is each cell | `milume.along_positions(adata, gdf, obs_key=...)` |
| Cell-type mix inside a shape or buffered line | `milume.composition(adata, gdf, obs_key=...)` |
| Is a selection enriched for a cell type | `milume.enrichment(adata, names, obs_key=...)` |
| Do 2D neighbours hold up in 3D | `milume.nearest_distances(adata, seeds, obs_key=...)` |
| Store a result on the cells | `milume.write_obs(adata, df, "col", "distance")` |

`gdf = milume.landmarks_to_geodataframe(widget.landmarks)`. The measure
functions run every row of `gdf`: subset to the landmark you mean with
`gdf[gdf["id"] == "front"]`. `enrichment` compares against all cells unless you
pass `background=`. Persisting a
landmark to SpatialData is the caller's job: `sdata["landmarks"] = gdf`.

Worked example, a selection's enrichment and its distance to a landmark:

```python
names = widget.get_obs_names(adata, "front cube")
enr = milume.enrichment(adata, names, obs_key="cell_type")
gdf = milume.landmarks_to_geodataframe(widget.landmarks)
d = milume.distances(adata, gdf[gdf["id"] == "front"], obs_key="cell_type", obs_names=names)
print(enr.head(3), d["distance"].median())
```

## 4. Traps that cost a turn

- **Coordinates are µm, `obsm["spatial"]`.** With three columns the third is z. Landmarks and selections are XY and extend through all of z. Say so when a 3D result looks surprising.
- **Selections drawn with the lasso carry `point_indices` (positional), not vertices.** Never keep those across a filter or reorder. Persist with `get_obs_names` / `assign_obs_mask`, which return `obs_names`.
- **`get_obs_names` raises `adata row count != widget points`** after the AnnData is filtered. Rebuild the widget on the filtered data.
- **The widget holds a reference to `adata`, not a copy.** Edits to `adata.obs` show up; changes to `obsm["spatial"]` or `X` after construction do not reach the browser.
- **`genes=` at construction restricts the gene catalog.** A gene missing from the picker was probably never packed.
- **Neighbourhood expand runs in the browser** from coordinates. Python sees it only after Promote freezes it into a selection's `point_indices`.
- **Selections are not written to SpatialData; landmarks round-trip through a GeoDataFrame.** Do not invent auto-save.
- **`obs` may already hold `dist_*` columns** from the notebook's own analysis. They can be signed (negative inside) where `milume.distances` is unsigned XY. Orient lists them; say which one you report.
- **An `inspect` selection holds every cell in the cube's window across all z**, not one slice.
- **Do not edit the notebook `.py` while the kernel is live.** Use marimo-pair's `cm` for notebook changes.
- **Inspect needs a SpatialData with a 3D image** (`LandmarksWidget(sdata)`). `widget.volume` is empty without one.

## 5. When the browser is worth it

Open it to see colour, layout and the cube, or to perform a gesture the user
asked for. The page exposes `window.__landmarksModel` (`get`/`set`/`save_changes`)
and `window.__landmarksEngine` (view state, geometry, hover), so a browser
session can read exact state without screenshots. Selectors, gesture recipes and
the shadow-DOM facts are in [references/browser.md](references/browser.md).

Verify what you drew by reading the state back, then screenshot once for the
user-facing result. A pixel match is not evidence that the traitlet holds what
you meant.
