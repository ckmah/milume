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
| `spatial_key` | `obsm` key holding coordinates (default `"spatial"`); `None` places cells from the annotated elements instead |
| `table`, `coordinate_system`, `region` | pick from a `SpatialData`: the table, the coordinate system, and which annotated elements to show |
| `image`, `labels` | override the 3D image / labels inferred from a `SpatialData` |
| `contrast_limits` | display range for the 3D image |

- From a SpatialData, the widget finds the table, the elements it annotates, the coordinate system they share, and (for a 3D image on the same grid) their µm frame. Cells sit at `obsm["spatial"]` when the table has it, otherwise at the centroids of the annotated labels or shapes, transformed into the coordinate system (Xenium, MERFISH, Visium HD segmentations, SpaceM). Those derived positions are stored in `obsm["spatial"]` so `distances` and friends work on the table afterwards.
- A table that annotates elements in several coordinate systems (one per FOV or slide, e.g. MIBI-TOF, Visium) shows the biggest one and warns; pass `coordinate_system=` to choose. `region=` shows only some of the annotated elements (e.g. SpaceM cells but not ablation marks). `w.coordinate_system` is the one shown; landmarks live in it.
- Several tables (e.g. Visium HD cell and nucleus segmentations) need `table=`.
- Press **I** (Inspect): hovering shows a live coarse preview of the tissue under the cursor, and a click places a 300 µm window and docks a floating full-resolution cube of it, colored like the map, with your landmarks drawn on top.
- **Save** in the dock's title bar adds the window as an **inspect selection** to its history strip. Read the inspected cells back with `w.get_obs_names(adata, "<inspect id>")` or `w.selections`.
- Hold **Space** to pan in any tool.

Read results back in Python:

| Need | Call |
| --- | --- |
| Cells in a selection | `w.get_obs_names(selection_id=...)`, `w.assign_obs_mask(adata, key, selection_id)` (by `obs_names`: pass the full table even if the widget shows only some rows) |
| Landmarks as geometry | `landmarks_to_geodataframe(w.landmarks)` |
| Measure against landmarks | `distances`, `composition`, `along_positions` (+ `write_obs`) |
| Compare a subset with the tissue | `enrichment(adata, obs_names, obs_key=...)` |
| XY vs 3D neighbors | `nearest_distances(adata, seeds, obs_key=...)` (needs `obsm["spatial"]` x, y, z) |
| Map colors for other plots | `w.category_colors("cell_type")` |
| Inspect window and cube cut | `w.inspect_cx`, `w.inspect_cy`, `w.inspect_size_um`; `w.volume_cut` = x0, x1, y0, y1, z0, z1 µm (intersect X/Y with the window for the shown box) |

Large expression matrices are sent sparse; pass `genes=` to limit the gene
catalog.
