# Changelog

What changed in each milume release, newest first. Dates are the day the
release reached PyPI (Pacific time). Each section links to its GitHub release
for the full list of pull requests.

To check which version you have:

```python
import milume
milume.__version__
```

## Unreleased { #unreleased }

!!! note "Not on PyPI yet"
    Version **2.1.0** is on the release branch. `pip install milume` still gives
    **2.0.0** until the release is published.

Genes load on demand, the install is lighter, and docs follow a Diátaxis layout.
The public Python API matches 2.0.0. Internal widget traits changed as noted under
**Changed** and **Removed**.

**Added**

- Genes load on demand with an 8-gene picker (**Mean**, **Median**, or **Max** when
  four or more genes are active). See [Color & layers](ui/color-layers.md#genes).
- The [`use-milume`](https://github.com/ckmah/milume/blob/main/skills/use-milume/SKILL.md)
  skill installs with `npx skills add ckmah/milume --skill use-milume` or
  `python -m milume.skill install`.

**Fixed**

- The Inspect (**I**) shortcut works when the pointer is over the map.
- molab demos tell you to click **Run all**.
- Vertex-only lasso selections show Measure category counts.
- Escape in the gene picker only closes the popup.
- Python 3.14 installs no longer fail on an ancient `s3fs` build.

**Changed**

- `pip install milume` no longer installs matplotlib, polars, or leidenalg. Install
  them yourself when your notebooks or recipes need them.
- Dependency floors for spatialdata, pyarrow, and s3fs; a smaller sdist; a minified
  widget bundle; and a brighter default Inspect contrast limit.
- If your code read `w.gene_columns`, use `w.gene_names` instead.

**Removed**

- The `milume[demo]` extra. Use each demo's script header or `uv sync --group demo`.
- Internal traits `gene_format` and `gene_values` (not part of the public API).

**Docs**

- Recipes, tutorials, Datasets, and Concepts pages under the Diátaxis restructure.

## 2.0.0 (October 20, 2026) { #v2.0.0 }

Coloring and reading cells in a region each have one way to do them now, and
the Inspect cube draws cells as 3D meshes. This release breaks code written
for 1.3.x with no deprecation period, so read the breaking changes before you
upgrade.

**Breaking**

| 1.3.x | 2.0.0 |
|---|---|
| `w.set_color(adata.obs["cell_type"])` | `w.color = "cell_type"` |
| `w.set_color(gene_values, legend_title="APOB")` | `w.color = "APOB"` |
| `w.set_color(values)` with a computed array | `adata.obs["score"] = values`, then `w.color = "score"` |
| `w.set_points(x, y, color=..., color_map=..., ...)` | `w.set_points(x, y)`, then `w.color = key` |
| `w.color_by` | Removed. Read `w.color`. |
| `w.get_obs_names(adata, sel_id)` | `w.get_obs_names(sel_id)` |
| `w.get_obs_names()` for every cell | `adata.obs_names` |
| `w.get_focus_obs_names(adata)` | `w.get_obs_names("focus")` |
| `w.assign_obs_mask(adata, key, sel_id)` | `adata.obs[key] = adata.obs_names.isin(w.get_obs_names(sel_id))` |
| `milume.peek(sdata, labels="cells")` | `milume.peek(sdata, shapes="cell_boundaries_z")` |
| `w.volume["labels_url"]` | `w.volume["cells"]` |
| `w.volume_label_ids` | `w.volume_cell_rows` |

- An unknown color key raises `milume.ColorKeyError`. A gene that wasn't
  loaded, or a category column with more than 128 values, raises
  `milume.ColorValueError`. The widget stays as it was when either one raises.
- `w.get_obs_names(region)` returns a `pd.Index` instead of a NumPy array, and
  raises `KeyError` for an unknown selection id instead of returning nothing.
- A hidden selection still returns its cells. Hiding only changes the display.
- One Esc in Inspect closes the cube and leaves Inspect. It used to take two.
- Inspect needs a shapes element with per-slice cell polygons (`cell_id` and
  `Z_um` columns) to draw cells. Stores without one, such as Xenium and CosMx,
  open Inspect with the image only.

**New**

- Open, move, and close the Inspect cube from Python:

    ```python
    w.inspect_cx, w.inspect_cy = 120.0, 140.0  # optional, defaults to the volume center
    w.inspect_open = True
    w.inspect_cx = 150.0  # moves the cube
    w.inspect_open = False
    ```

    `w.inspect_open` also reads `True` or `False` when you open or close the
    cube in the browser.
- Inspect draws each cell as a 3D mesh built from the cell polygons. Meshes
  sit inside the image by depth, so image in front of a cell shows in front of
  it.
- Inspect has a minimap. Click or drag on it to move the cube.

[Full 2.0.0 release](https://github.com/ckmah/milume/releases/tag/v2.0.0)

## 1.3.5 (October 14, 2026) { #v1.3.5 }

Lasso and Inspect polish. No API changes.

**Fixed**

- A quick lasso drag now makes a selection. It used to count as a click.

**Changed**

- Inspect always draws cell outlines, and the **Cut outline** toggle is gone.
  From the top, each cell shows as a ring you can see through.

[Full 1.3.5 release](https://github.com/ckmah/milume/releases/tag/v1.3.5)

## 1.3.4 (October 11, 2026) { #v1.3.4 }

Lasso works on molab. No API changes.

**Fixed**

- On molab, lasso drags draw and make a selection, and page text no longer
  gets selected while you drag.
- Inspect cube framing, **Save** snapshots, and cut outlines on data with
  uneven voxel spacing.

[Full 1.3.4 release](https://github.com/ckmah/milume/releases/tag/v1.3.4)

## 1.3.3 (October 11, 2026) { #v1.3.3 }

More molab fixes. No API changes.

**Fixed**

- On molab, selected cells are highlighted on the map and the Inspect cube is
  centered.
- Changing the cell or window size no longer resets the zoom.

[Full 1.3.3 release](https://github.com/ckmah/milume/releases/tag/v1.3.3)

## 1.3.2 (October 10, 2026) { #v1.3.2 }

Lasso works in marimo, and default sizes follow your data's units. No API
changes.

**Fixed**

- Lasso selection works in marimo and on molab.
- The default raster bin and Inspect window sizes come from the µm-per-pixel
  units in your dataset's metadata. milume falls back to guessing from point
  spacing only when the metadata has no units.

**New**

- With a Z cut or crop, the cut face of the Inspect cube outlines each cell.

[Full 1.3.2 release](https://github.com/ckmah/milume/releases/tag/v1.3.2)

## 1.3.1 (October 10, 2026) { #v1.3.1 }

Inspect works on remote kernels such as molab and JupyterHub.

**Fixed**

- Inspect images load on remote kernels. Panning in Inspect is also much
  faster on large stores.
- In marimo, the Inspect cube no longer fails with "Unexpected end of JSON
  input".
- A partial cut survives closing the cube, moving the map, and opening it
  again.
- A landmark's color in the panel matches its outline on the map.

**Changed**

- `pip install milume` always installs spatialdata. Platform readers such as
  `spatialdata-io` stay optional.

[Full 1.3.1 release](https://github.com/ckmah/milume/releases/tag/v1.3.1)

## 1.3.0 (October 9, 2026) { #v1.3.0 }

Xenium and CosMx support, a docs site, and a much richer Inspect cube.

**New**

- Load Xenium and CosMx data through spatialdata-io. For CosMx, pass
  `spatial_key="global"`.
- A [docs site](../../index.md) with an API reference and
  [`llms.txt`](https://ckmah.github.io/milume/llms.txt) for coding agents.
- Inspect shows cells as points, colors by gene expression, and cuts cross
  sections. It picks contrast limits from the image and shows labels by
  default.
- Select several category groups within one selection set.
- Loading and error indicators on the map and in Inspect.

**Fixed**

- Moving the Inspect window no longer flashes, and toggling neighbors is much
  faster.

[Full 1.3.0 release](https://github.com/ckmah/milume/releases/tag/v1.3.0)

## 1.2.0 (October 4, 2026) { #v1.2.0 }

A reworked Inspect view, and smoother zoom on large sections.

**Changed**

- The Inspect cube opens when you release the mouse and fills the plot area.
- New selections are named after their top category and cell count, such as
  `Epithelial · 214`, instead of `selection 1`. Code that typed an old id
  literally needs the new name. Read ids from `w.selections`.
- Labels draw as outlined shells instead of filled cells. Default label
  opacity is 0.6.

**New**

- Shift+drag, or the **Move** tool, pans the Inspect window. Python sees the
  new position in `w.inspect_cx` and `w.inspect_cy`.
- Choose Additive or MIP projection separately for the image and the labels.
- Windows you keep with **Save** appear in the Selections list with a
  thumbnail. Hover any selection row to see its cell count, bounds, and top
  categories.

**Fixed**

- Zoom no longer stalls at the start of a gesture on large sections. Hovering
  a cell no longer shows a tooltip.
- Collapsed side panels no longer block page scrolling.

[Changes since 1.1.0](https://github.com/ckmah/milume/compare/v1.1.0...v1.2.0)

## 1.1.0 (September 30, 2026) { #v1.1.0 }

The first release under the name milume, formerly spatial-rx. The 3D cube now
lives inside the Landmarks widget as the Inspect tool.

**Breaking**

| spatial-rx 1.0.x | milume 1.1.0 |
|---|---|
| `pip install spatial-rx` | `pip install milume` |
| `import spatial_rx` | `import milume` |
| `VolumeCubeWidget(...)` | `milume.peek(sdata)`, then the Inspect tool |
| `GalleryWidget` | Removed |

**New**

- `milume.peek(data)` opens a `LandmarksWidget` for an `AnnData` or
  `SpatialData` object.
- `LandmarksWidget(sdata)` finds the table, labels, and 3D image in your
  SpatialData and opens them in the Inspect cube.
- Inspect shows a live preview under the cursor and loads the docked cube at
  full resolution. It uses about a third of the memory it did before.
- **Save** in the cube's title bar keeps the current window as an inspect
  selection.
- `milume.enrichment` and `milume.nearest_distances` join the measure
  functions. With 3D coordinates, `distances`, `along_positions`, and
  `composition` also report depth, binned by `z_bin_size` (1 µm by default).

[Changes since spatial-rx 1.0.1](https://github.com/ckmah/milume/compare/v1.0.1...v1.1.0)
