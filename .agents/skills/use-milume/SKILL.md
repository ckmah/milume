---
name: use-milume
description: >-
  Drive milume's LandmarksWidget from Python in a notebook: open it with
  milume.peek, recolour with w.color, read the cells in a region with
  w.get_obs_names, match plot colours with category_colors, write
  landmarks to or from a GeoDataFrame / SpatialData, and open, move or close
  the 3D Inspect cube. Use when an agent writes
  notebook code against milume (AnnData or SpatialData spatial omics).
---

# use-milume

Notebook API for `milume` 2.0+. Only the entries listed under
[Public API](#public-api) are supported; every other synced trait is internal
and can change without notice.

The examples assume an AnnData `adata` with `obsm["spatial"]`, an
`obs["cell_type"]` column and a gene `APOB` in `var_names`; the Inspect
example uses a SpatialData `sdata` with a 3D image. CI runs every
`python` block on this page in order against a small fixture
(`tests/test_use_milume_skill.py`).

## Open the widget

```python
import milume

w = milume.peek(adata, color="cell_type")
w
```

`milume.peek(sdata)` takes a SpatialData too: the table, per-slice cell polygons
and 3D image are inferred (`shapes=` / `image=` to override). `color=` takes the
same keys as `w.color`.

## Colour by a column or a gene

```python
w.color = "APOB"       # a gene: expression ramp
w.color = "cell_type"  # an obs column: categorical palette
```

- `w.color` takes an `adata.obs` column (categorical or numeric) or a gene in
  `var_names`. A column added to `adata.obs` after the widget was built works.
- An unknown key raises `milume.ColorKeyError` (a `KeyError`). A gene the
  widget's catalog doesn't include (`genes=` left it out), or a category column with more
  than 128 levels, raises `milume.ColorValueError` (a `ValueError`). Nothing
  changes when it raises.
- Re-assigning the same key does not repack a column you rewrote; assign
  another key first.

## Cells in a region

Selections are drawn in the browser; each has an `id` in `w.selections`. You
can also write one from Python:

```python
w.selections = [
    {"id": "crypt", "type": "rectangle", "cx": 50.0, "cy": 50.0,
     "width": 40.0, "height": 40.0, "angle": 0.0},
]
cells = w.get_obs_names("crypt")              # pd.Index of obs_names
adata.obs["in_crypt"] = adata.obs_names.isin(cells)
focused = w.get_obs_names("focus")            # the focused selection or category groups
```

- `get_obs_names(region)` needs a selection id or `"focus"`. An unknown id
  raises `KeyError`. A hidden selection still returns its cells.
- For every cell use `adata.obs_names`; there is no `"all"`.
- Join by `obs_names`, never by position.

## Match colours in other plots

```python
palette = w.category_colors("cell_type")  # {label: "#rrggbb"}, as the map draws it
```

Pass it to scanpy / matplotlib (`palette=`) so plots match the widget.

## Landmarks to and from a GeoDataFrame

```python
from milume import geodataframe_to_landmarks, landmarks_to_geodataframe

w.landmarks = [{"id": "crypt-axis", "type": "line", "vertices": [[10.0, 10.0], [90.0, 90.0]]}]
gdf = landmarks_to_geodataframe(w.landmarks)
w.landmarks = geodataframe_to_landmarks(gdf)
```

- Control points live in the JSON `vertices` column; `geometry` is a GIS proxy.
  Round-trip through these two functions, not through `geometry`.
- The widget never writes SpatialData. Save with `sdata["landmarks"] = gdf`
  yourself.
- Needs the optional `geopandas` and `shapely`.

## Open, move and close the Inspect cube

The Inspect cube needs a 3D image, so build the widget from SpatialData:

```python
v = milume.peek(sdata)
v.inspect_open = True                      # no window placed yet: opens at the volume centre
v.inspect_open = False                     # closes the cube and exits Inspect
v.inspect_cx, v.inspect_cy = 120.0, 140.0  # window centre, in spatial units (µm)
v.inspect_open = True                      # the cube opens there, no click needed
v.inspect_cx = 150.0                       # moves the window and the open cube
v.volume_cut = [*v.volume_cut[:4], 0.0, 32.0]  # keep z between 0 and 32 µm
v.inspect_open = False                     # closes the cube and exits Inspect; the window stays put
```

- The default position is the volume's centre: `inspect_open = True` with no
  window placed (`inspect_cx`/`inspect_cy` still `None`) opens the cube there.
  Without a 3D image it raises `ValueError`.
- `True` switches the widget to Inspect; `False` closes the cube and exits
  Inspect, like the Exit button. In the browser, one Esc (or Exit) closes the
  cube and leaves Inspect, and sets `inspect_open` back to `False`; Python and
  the widget never disagree.
- `volume_cut` is `[x0, x1, y0, y1, z0, z1]` in µm. The browser writes it when
  a cut slider is released; X and Y are clipped to the window when drawn.
- `v.volume` describes the 3D image (`{}` without one). Read it, don't set it.

## Squidpy: niche and Moran's I

Optional (`squidpy`, `scanpy`). Full walkthrough with screenshots:
[docs/integrations/squidpy-color](https://ckmah.github.io/milume/docs/integrations/squidpy-color/).

Neighborhood niches on a selection mask, then recolour by the column Squidpy
writes (`nhood_niche_res=<resolution>`, e.g. `nhood_niche_res=0.5` when
`resolutions=0.5`):

```python
import pandas as pd
import scanpy as sc
import squidpy as sq

w_niche = milume.peek(adata, color="cell_type")
w_niche.selections = [
    {"id": "patch", "type": "rectangle", "cx": 50.0, "cy": 50.0,
     "width": 70.0, "height": 70.0, "angle": 0.0},
]
mask = pd.Series(adata.obs_names.isin(w_niche.get_obs_names("patch")), index=adata.obs_names)
sc.pp.neighbors(adata)
sq.gr.spatial_neighbors_knn(adata, n_neighs=6)
sq.gr.calculate_niche(
    adata,
    flavor="neighborhood",
    groups="cell_type",
    n_neighbors=6,
    resolutions=0.5,
    mask=mask,
)
w_niche.color = "nhood_niche_res=0.5"
```

Top Moran's I gene on the packed genes:

```python
import scanpy as sc
import squidpy as sq

w_moran = milume.peek(adata, color="cell_type", genes=["APOB", "Lgr5", "Muc2"])
sc.pp.neighbors(adata)
sq.gr.spatial_neighbors_knn(adata, n_neighs=6)
sq.gr.spatial_autocorr(adata, mode="moran")
w_moran.color = adata.uns["moranI"]["I"].idxmax()
```

## Gotchas

- Landmarks are 2D. In the 3D Inspect cube a landmark extends through the
  full depth of the window; there is no z on a landmark.
- Never join IDs across datasets: colon (`colon_a2`) and Pyxa (`small`,
  `xsmall`, mouse brain) are different tissues, and their `obs_names` and
  label ids do not correspond.
- Don't set internal traits (`color_mode`, `category_codes`, `point_palette`,
  …) to recolour; use `w.color`.

## Public API

<!-- BEGIN GENERATED: _PUBLIC_TRAITS (scripts/sync-use-milume-skill.py) -->
| Name | Kind | What it is |
| --- | --- | --- |
| `w.color` | trait | obs column or gene the points are coloured by; assign a key to recolour (raises ColorKeyError / ColorValueError). |
| `w.selections` | trait | Drawn selections as dicts with id, name, geometry and point indices. |
| `w.landmarks` | trait | Drawn landmarks (points, lines, splines, shapes) as dicts. |
| `w.selected_kind` | trait | Kind of the focused item: selection, landmark, type, or empty. |
| `w.selected_index` | trait | Index of the focused item within its kind, or -1. |
| `w.selected_type_indices` | trait | Focused category label indices when selected_kind is type. |
| `w.inspect_cx` | trait | Inspect window centre x in spatial units, or None before placement; set it to move the window and the open cube. |
| `w.inspect_cy` | trait | Inspect window centre y in spatial units, or None before placement; set it to move the window and the open cube. |
| `w.inspect_size_um` | trait | Inspect window side length in µm. |
| `w.inspect_open` | trait | Whether the Inspect cube is open; True opens it at inspect_cx/cy, or at the volume centre when no window is placed; False closes it and exits Inspect. ValueError without a 3D image. |
| `w.volume` | trait | The 3D image behind the Inspect cube (image path, cell polygons path and size, voxel size, origin, contrast); {} without one. Read it, don't set it. |
| `w.volume_cut` | trait | Cube cut box [x0, x1, y0, y1, z0, z1] in µm; the browser writes it on slider release, assign it to cut from Python. |
| `w.active_category` | trait | Name of the obs column driving categorical colour and type focus. |
| `w.active_genes` | trait | Genes shown in the expression blend; unknown genes are dropped. |
| `w.category_colors()` | method | Label to hex colour map of a categorical column as drawn. |
| `w.clear_selections()` | method | Remove every selection. |
| `w.clear_landmarks()` | method | Remove every landmark. |
| `w.clear()` | method | Remove all selections and landmarks. |
| `w.select_type()` | method | Focus one category group of the active column. |
| `w.get_obs_names()` | method | pd.Index of obs_names in a selection id or 'focus'; KeyError on unknown ids. |
| `w.set_points()` | method | Move the scatter points to new x/y; colour is set with color. |
| `w.set_expression()` | method | Replace the gene catalogue from a table. |
| `w.set_render_mode()` | method | Switch between points and raster bins. |
| `w.set_raster_basis()` | method | Pick the raster aggregation basis: genes, embedding or composition. |
| `w.clear_raster_query()` | method | Clear the pinned raster similarity query. |
<!-- END GENERATED -->
