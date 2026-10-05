<p align="center">
  <img src="https://raw.githubusercontent.com/ckmah/milume/main/assets/logo/milume-mark.svg" width="128" alt="Milume logo" />
</p>

# milume

**milume: a thinking surface for spatial omics.**

You have a spatial dataset and a hunch. milume turns a notebook cell into a tactile,
reactive surface where you can look at your tissue, select what catches your eye, and
carry that selection straight into code. Cells, landmarks and measurements stay in
plain `AnnData` / `obs_names` / geometry, so what you see on the surface is what you
analyze next.

One call opens it:

```python
import milume

w = milume.peek(adata, color="cell_type")
```

Draw selections and landmarks, color by category or gene, expand neighborhoods, and
read everything back in Python. The name comes from *mille* (thousand, as in
mille-feuille, layers) + *lume* (light).

[![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)

## Install

```bash
pip install milume
```

### Migrate from spatial-rx

Note: Milume was formerly `spatial-rx`. The API is unchanged; only the names moved:

```bash
pip uninstall spatial-rx
pip install milume
```

```python
import milume   # was: import spatial_rx
```

## Alongside other viewers

Milume complements other viewers. Use `milume` to form intuition: layer images, cells,
and transcripts in a notebook, select what stands out, and carry the selection straight
into your analysis code. Use heavier viewers when you need to inspect in depth.
Landmarks and selections round-trip as plain geometry and `obs_names`, so you can hand
the same regions to any viewer.

From source:

```bash
uv sync --extra demo --group dev
```

## milume.peek

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/landmarks_widget_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="assets/landmarks_widget_light.png" />
  <img alt="milume surface" src="assets/landmarks_widget_light.png" />
</picture>

`milume.peek(data, **kwargs)` opens the surface on your data and returns a widget `w`
you read results from.

```python
import milume

w = milume.peek(adata, color="cell_type")   # AnnData with obsm["spatial"]
w = milume.peek(sdata, color="cell_type")   # SpatialData on disk: adds the 3D cube
```

| Argument | Meaning |
| --- | --- |
| `data` | `AnnData` with `obsm["spatial"]`, or a `SpatialData` |
| `color` | `obs` column to color cells by |
| `genes` | gene(s) to expose for coloring; limits the catalog on large matrices |
| `spatial_key` | `obsm` key holding coordinates (default `"spatial"`) |
| `table`, `image`, `labels` | override what is inferred from a `SpatialData` |
| `contrast_limits` | display range for the 3D image (default: its 1st to 99.5th percentile, from the coarsest pyramid level) |

- From a SpatialData, the widget finds the table, the labels element it annotates, a 3D image on the same grid, and their µm frame (override with `table=`, `image=`, `labels=`; `contrast_limits=` for the image).
- Press **I** (Inspect): the top toolbar turns into a dashed Inspect pill, hovering shows a live coarse preview of the tissue under the cursor, and a click places a 300 µm window; on release a full-resolution cube of it takes over the plot area, cells drawn as outlines colored like the map, with your landmarks on top. Shift+drag in the cube (or the **Move** tool) slides the window across the tissue; a plain drag orbits. The bottom bar holds the camera, **Adjust** (image and label display) and **Cross-section** (cuts). Esc closes the cube; Esc again, or ×, leaves Inspect. The side panels' peek tabs stay over the cube, so you can focus a category or Selection to color it.
- **Save window** on the Inspect pill adds the window as an **inspect selection**, listed in the Selections panel with a thumbnail and named by its main category and size (e.g. `Epithelial · 214`); hover a row for its cell count and category mix, click it to reopen the window. Read the inspected cells back with `w.get_obs_names(adata, "<inspect id>")` or `w.selections`.
- Hold **Space** to pan in any tool.

Read results back in Python:

| Need | Call |
| --- | --- |
| Cells in a selection | `w.get_obs_names(adata, selection_id)`, `w.assign_obs_mask(adata, key, selection_id)` |
| Landmarks as geometry | `landmarks_to_geodataframe(w.landmarks)` |
| Measure against landmarks | `distances`, `composition`, `along_positions` (+ `write_obs`) |
| Compare a subset with the tissue | `enrichment(adata, obs_names, obs_key=...)` |
| XY vs 3D neighbors | `nearest_distances(adata, seeds, obs_key=...)` (needs `obsm["spatial"]` x, y, z) |
| Map colors for other plots | `w.category_colors("cell_type")` |
| Inspect window and cube cut | `w.inspect_cx`, `w.inspect_cy`, `w.inspect_size_um`; `w.volume_cut` = x0, x1, y0, y1, z0, z1 µm (intersect X/Y with the window for the shown box) |

Large expression matrices are sent sparse; pass `genes=` to limit the gene
catalog.
