# Changelog

## 1.4.0 (unreleased)

Breaking: no deprecation release.

### Color is one trait

`w.color = key` is the only way to colour the points. `key` is an `adata.obs` column (categorical or numeric) or a packed gene. An unknown key raises `milume.ColorKeyError` (a `KeyError`); a gene that was not packed, or a category column with more than 128 levels, raises `milume.ColorValueError` (a `ValueError`). Nothing changes when it raises.

Migration:

| 1.3.x | 1.4.0 |
|---|---|
| `w.set_color(adata.obs["cell_type"])` | `w.color = "cell_type"` |
| `w.set_color(gene_values, legend_title="APOB")` | `w.color = "APOB"` |
| `w.set_color(values)` for a computed array | `adata.obs["score"] = values; w.color = "score"` |
| `w.set_points(x, y, color=..., color_map=..., legend_title=..., continuous_range=...)` | `w.set_points(x, y)` then `w.color = key` |
| `w.color_by` | removed; the internal mode is derived from `w.color` |

Custom category colours still come from `adata.uns["<column>_colors"]`.

### One region reader

`w.get_obs_names(region)` is the only way to read cells in a region. `region` is required: a selection id from `w.selections`, or `"focus"` for the focused selection or category groups (empty when nothing is focused). It returns a `pd.Index` and raises `KeyError` for an unknown id. The `adata` argument is gone; the widget's own coordinates and `obs_names` are used.

Migration:

| 1.3.x | 1.4.0 |
|---|---|
| `w.get_obs_names(adata, sel_id)` / `w.get_obs_names(selection_id=sel_id)` | `w.get_obs_names(sel_id)` |
| `w.get_obs_names(adata, "missing")` returned an empty array | raises `KeyError` |
| `w.get_obs_names()` / `selection_id="all"` / `None` returned every cell | `adata.obs_names` |
| `w.get_focus_obs_names(adata)` | `w.get_obs_names("focus")` |
| `w.assign_obs_mask(adata, key, sel_id)` | `adata.obs[key] = adata.obs_names.isin(w.get_obs_names(sel_id))` |
| result was a `np.ndarray` of str | result is a `pd.Index` |
| a hidden selection returned no cells | a hidden selection returns its cells (hiding only affects display) |

### Open, move and close the Inspect cube from Python

New: `w.inspect_open` opens and closes the Inspect cube without a click (needs a widget built from SpatialData with a 3D image).

```python
w.inspect_cx, w.inspect_cy = 120.0, 140.0  # optional: with no window placed it opens at the volume centre
w.inspect_open = True                      # switches to Inspect and opens the cube there
w.inspect_cx = 150.0                       # moves the window and the open cube
w.inspect_open = False                     # closes it and exits Inspect, like Exit
```

- Setting `inspect_cx` / `inspect_cy` now moves the map's window square too, not only the cube.
- The default position is the volume centre: `w.inspect_open = True` with `inspect_cx` / `inspect_cy` still `None` opens the cube there.
- `inspect_open` follows the browser: opening the cube there (a click) reads `True`; Esc or Exit reads `False`.
- Behaviour change: one Esc in Inspect now closes the cube and leaves Inspect, back to the previous tool (Select if none), like Exit. It used to take two (close the cube, then leave), which left the widget in Inspect while `inspect_open` read `False`.
- `w.inspect_open = True` without a 3D image raises `ValueError`.
- `volume` and `volume_cut` join `inspect_open` in the public API.

### Inspect cube: cell meshes from polygons

The Inspect cube draws each cell as a 3D mesh lofted in the browser from the store's per-slice cell polygons, instead of raycasting a label image. Default mesh opacity is 0.9.

Migration:

| 1.3.x | 1.4.0 |
|---|---|
| `milume.peek(sdata, labels="cells")` / `LandmarksWidget(..., labels=)` | `shapes="cell_boundaries_z"` (a shapes element with `cell_id` and `Z_um`) |
| `w.volume["labels_url"]` | `w.volume["cells"]` → `{url, bytes}` for the polygon parquet |
| `w.volume_label_ids` | `w.volume_cell_rows` (base64 int32, one table row per polygon cell; −1 when the table has none) |

Stores without per-slice cell polygons (e.g. Xenium / CosMx) open Inspect image-only, with no cells; 2D image plus polygon rendering is tracked in [#122](https://github.com/ckmah/milume/issues/122). With several 3D images, pass `image=` to pick one.

### Inspect cube: cell meshes composited by depth

- Cell meshes sit inside the image by depth instead of drawing over it ([#228](https://github.com/ckmah/milume/pull/228)): image in front of a cell (DAPI above a cell wall) shows in front of it, image behind it shows through the cell's opacity. Per pixel, the nearest cell's front and back walls are drawn; cells behind them are hidden there. In MIP mode the meshes draw over the projection.
- Default mesh `fresnelMin` is 0.35 (was 0.15); opacity stays 0.9.

### Inspect minimap

- The Inspect view has a minimap ([#226](https://github.com/ckmah/milume/pull/226) `inspect-minimap-218`). Click or drag on it to move the cube; the mouse wheel does nothing over it. It is lazy-loaded, so it costs nothing until Inspect opens.
